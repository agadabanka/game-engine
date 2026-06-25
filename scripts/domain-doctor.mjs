#!/usr/bin/env node
// domain-doctor — end-to-end health check for a Railway custom domain.
//
// Walks every hop between a custom domain and the app that should answer on it,
// and prints a pass/fail table:
//
//   1. DNS CNAME         the hostname → Railway edge target (via DoH; no `dig`)
//   2. DNS TXT verify    _railway-verify.<label> ownership record
//   3. Railway cert      certificateStatus == VALID   (Railway GraphQL)
//   4. Railway DNS       dnsRecords status == PROPAGATED
//   5. Edge serving      HTTPS 200 AND no `x-railway-fallback` header
//   6. App health        the app actually answers (optional --health <path>)
//
// The classic failure this catches: DNS + cert are green and Railway's API says
// the domain is fine, but the edge still returns `x-railway-fallback: true` (404
// "Application not found") because the edge never bound the route to the service.
// `--fix` clears that by redeploying the bound service (no DNS change, same edge
// target) — the forcing function that makes the edge re-read its route table.
//
// Usage:
//   RAILWAY_TOKEN=... node scripts/domain-doctor.mjs play.funstackstudios.com
//   node scripts/domain-doctor.mjs play.funstackstudios.com --project game-engine
//   node scripts/domain-doctor.mjs play.funstackstudios.com --health /health
//   node scripts/domain-doctor.mjs play.funstackstudios.com --fix     # redeploy to unstick edge
//
// Exit code 0 = every hop green, 1 = something is wrong (CI-friendly).

const GQL = 'https://backboard.railway.app/graphql/v2';
const DOH = 'https://dns.google/resolve';

const args = process.argv.slice(2);
const domain = args.find((a) => !a.startsWith('--'));
const flag = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined; };
const PROJECT = flag('project');
const SERVICE = flag('service');
const HEALTH = typeof flag('health') === 'string' ? flag('health') : null;
const FIX = !!flag('fix');
const TOKEN = process.env.RAILWAY_TOKEN || '';

if (!domain) { console.error('usage: domain-doctor <domain> [--project N] [--service N] [--health /path] [--fix]'); process.exit(2); }

const C = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' };
const rows = [];
const row = (ok, name, detail) => rows.push({ ok, name, detail });

async function doh(name, type) {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, { signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    return (j.Answer || []).map((a) => a.data);
  } catch { return []; }
}

async function gql(query, variables) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25000),
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map((e) => e.message).join('; '));
  return j.data;
}

// Find which (project, environment, service) the domain is registered on, and its status.
async function findDomain() {
  const me = await gql('query { me { workspaces { id } } }');
  const wsId = me.me.workspaces?.[0]?.id;
  if (!wsId) throw new Error('no workspace on this token');
  const ws = await gql(
    'query($w:String!){ workspace(workspaceId:$w){ projects { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } } } }',
    { w: wsId },
  );
  let projects = ws.workspace.projects.edges.map((e) => e.node);
  if (PROJECT) projects = projects.filter((p) => p.name === PROJECT || p.id === PROJECT);
  for (const p of projects) {
    let services = p.services.edges.map((e) => e.node);
    if (SERVICE) services = services.filter((s) => s.name === SERVICE || s.id === SERVICE);
    for (const env of p.environments.edges.map((e) => e.node)) {
      for (const svc of services) {
        let data;
        try {
          data = await gql(
            'query($p:String!,$e:String!,$s:String!){ domains(projectId:$p, environmentId:$e, serviceId:$s){ customDomains { id domain status { certificateStatus dnsRecords { recordType requiredValue currentValue status } } } } }',
            { p: p.id, e: env.id, s: svc.id },
          );
        } catch { continue; }
        const cd = (data.domains?.customDomains || []).find((d) => d.domain === domain);
        if (cd) return { project: p, env, service: svc, customDomain: cd };
      }
    }
  }
  return null;
}

async function probeEdge() {
  try {
    const r = await fetch(`https://${domain}/`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000) });
    return { status: r.status, fallback: r.headers.get('x-railway-fallback'), server: r.headers.get('server'), edge: r.headers.get('x-railway-edge') };
  } catch (e) { return { error: String(e.message || e) }; }
}

async function main() {
  console.log(`\n${C.bold}domain-doctor — ${domain}${C.reset}\n`);

  // 1+2 DNS (always available, no token needed)
  const cname = await doh(domain, 'CNAME');
  row(cname.length > 0, 'DNS CNAME', cname[0] ? `${domain} → ${cname[0]}` : 'no CNAME answer');
  const label = domain.split('.')[0];
  const verifyHost = `_railway-verify.${domain.split('.').slice(0, -2).join('.') || label}.${domain.split('.').slice(-2).join('.')}`;
  const txt = await doh(`_railway-verify.${domain}`, 'TXT');
  row(txt.length > 0, 'DNS TXT verify', txt[0] ? `${txt[0].slice(0, 44)}…` : `none at _railway-verify.${domain} (ok if cert already VALID)`);

  // 3+4 Railway API
  let found = null;
  if (TOKEN) {
    try {
      found = await findDomain();
      if (found) {
        const st = found.customDomain.status;
        const certOk = st.certificateStatus === 'CERTIFICATE_STATUS_TYPE_VALID';
        row(certOk, 'Railway cert', st.certificateStatus + `  (${found.project.name}/${found.service.name})`);
        const dnsOk = (st.dnsRecords || []).every((d) => d.status === 'DNS_RECORD_STATUS_PROPAGATED');
        row(dnsOk, 'Railway DNS', (st.dnsRecords || []).map((d) => `${d.recordType.replace('DNS_RECORD_TYPE_', '')}:${d.status.replace('DNS_RECORD_STATUS_', '')}`).join(' ') || 'no records');
      } else {
        row(false, 'Railway domain', `not found on any service${PROJECT ? ` in project ${PROJECT}` : ''} — is it registered?`);
      }
    } catch (e) { row(false, 'Railway API', String(e.message || e)); }
  } else {
    rows.push({ ok: null, name: 'Railway API', detail: 'skipped (set RAILWAY_TOKEN for cert/dns/edge fix)' });
  }

  // 5 Edge serving
  const edge = await probeEdge();
  if (edge.error) row(false, 'Edge serving', edge.error);
  else {
    const ok = edge.status === 200 && !edge.fallback;
    row(ok, 'Edge serving', `HTTP ${edge.status}${edge.fallback ? `  x-railway-fallback:${edge.fallback} (NOT BOUND)` : '  bound'}${edge.edge ? `  @${edge.edge}` : ''}`);
  }

  // 6 App health (optional)
  if (HEALTH) {
    try {
      const r = await fetch(`https://${domain}${HEALTH}`, { signal: AbortSignal.timeout(15000) });
      const body = (await r.text()).slice(0, 80);
      row(r.ok, 'App health', `${HEALTH} → ${r.status} ${body}`);
    } catch (e) { row(false, 'App health', String(e.message || e)); }
  }

  // Print table
  const pad = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const mark = r.ok === null ? `${C.yellow}—${C.reset}` : r.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(`  ${mark} ${r.name.padEnd(pad)}  ${C.dim}${r.detail}${C.reset}`);
  }

  const hardFails = rows.filter((r) => r.ok === false);
  const edgeUnbound = edge && edge.status && edge.fallback;

  // --fix: edge is unbound but cert/dns are fine → redeploy the bound service.
  if (FIX && edgeUnbound && found && TOKEN) {
    console.log(`\n${C.yellow}edge is on fallback though Railway config is green → redeploying ${found.project.name}/${found.service.name} to re-bind the route…${C.reset}`);
    const deps = await gql(
      'query($s:String!,$e:String!){ deployments(first:1, input:{serviceId:$s, environmentId:$e}){ edges { node { id status } } } }',
      { s: found.service.id, e: found.env.id },
    );
    const dep = deps.deployments.edges[0]?.node;
    if (!dep) { console.log(`${C.red}no deployment to redeploy${C.reset}`); process.exit(1); }
    await gql('mutation($id:String!){ deploymentRedeploy(id:$id, usePreviousImageTag:false){ id status } }', { id: dep.id });
    console.log(`${C.green}redeploy triggered for deployment ${dep.id}.${C.reset} Re-run domain-doctor in ~2 min to confirm the edge is bound.`);
    process.exit(1);
  }

  if (hardFails.length === 0) {
    console.log(`\n${C.green}${C.bold}All hops green — ${domain} is live end to end.${C.reset}\n`);
    process.exit(0);
  }
  console.log(`\n${C.red}${C.bold}${hardFails.length} hop(s) failing.${C.reset}` + (edgeUnbound ? ` Edge is registered but on fallback — re-run with ${C.bold}--fix${C.reset} to redeploy and re-bind.` : '') + '\n');
  process.exit(1);
}

main().catch((e) => { console.error('domain-doctor crashed:', e); process.exit(2); });

// scripts/engine-change-issues.mjs — a deterministic LEDGER + ROLLBACK path for engine changes.
//
// Every change to the engine (SDK / tools / scripts / pipeline / hub server) is already a discrete
// git commit on agadabanka/game-engine. This logs each as a GitHub issue with: WHAT changed, the
// files, the commit, and the EXACT, deterministic commands to ROLL IT BACK — including the bit that
// makes engine rollback non-trivial: `engine/sdk/studio.js` is MIRRORED into every game repo, so a
// studio.js revert must re-propagate to each game + redeploy. So "undo whatever was fixed in the
// engine" becomes a programmatic, reproducible operation, not archaeology.
//
//   node scripts/engine-change-issues.mjs --since <ref>     # log engine commits in <ref>..HEAD
//   node scripts/engine-change-issues.mjs --commits a,b,c   # log specific commits
//   node scripts/engine-change-issues.mjs --rollback <sha>  # PRINT the deterministic rollback plan
//   add --dry-run to preview the issues without creating them.
// Idempotent (matches an [eng-change:<sha>] marker). Needs GH_TOKEN.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'agadabanka/game-engine';
const BRANCH = 'claude/epic-tesla-2g2fb0';
const GH = process.env.GH_TOKEN;
// What counts as "engine code" (vs game data like hub/games.json or a game's own files).
const ENGINE_RE = [/^engine\//, /^tools\//, /^scripts\//, /^hub\/(server|lib|refresh)/, /^docs\/ENGINE/, /^\.claude\/skills\//];
const SDK_MIRROR = 'engine/sdk/studio.js';   // the file that propagates into every game repo

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const val = (n) => has(n) ? argv[argv.indexOf(n) + 1] : null;
const DRY = has('--dry-run');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

// Games that MIRROR engine/sdk/studio.js (separate repos). Read from the hub registry so the list
// stays current as games are added. A studio.js rollback must re-sync + redeploy each of these.
function consumerGames() {
  try {
    const reg = JSON.parse(fs.readFileSync(path.resolve('hub/games.json'), 'utf8'));
    return (Array.isArray(reg) ? reg : reg.games || []).filter((g) => g.repo && g.url).map((g) => ({ id: g.id, repo: g.repo }));
  } catch { return []; }
}

function commitInfo(ref) {
  const sha = git('rev-parse', ref);
  const subject = git('show', '-s', '--format=%s', sha);
  const body = git('show', '-s', '--format=%b', sha);
  const date = git('show', '-s', '--format=%cI', sha);
  const files = git('show', '--name-status', '--format=', sha).split('\n').filter(Boolean)
    .map((l) => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') }; });
  const engineFiles = files.filter((f) => ENGINE_RE.some((re) => re.test(f.path)));
  return { sha, short: sha.slice(0, 9), subject, body, date, files, engineFiles, touchesSdk: engineFiles.some((f) => f.path === SDK_MIRROR) };
}

function rollbackMd(c) {
  let s = `### ⏪ Rollback (deterministic)\n\nThis change is commit \`${c.short}\`. Undo exactly it (history-preserving):\n\n\`\`\`bash\ncd game-engine\ngit revert --no-edit ${c.short}        # atomically reverts every file in the commit (both in-repo studio.js mirrors included)\n`;
  if (c.touchesSdk) {
    const ids = consumerGames().map((g) => g.id).join(' ') || '<game-ids from hub/games.json>';
    // studio.js is the ONLY engine file copied into game repos (tools/scripts/pipeline run from
    // the engine repo, so they need no propagation). Re-sync just the games that actually ship
    // THIS version (md5 match) so reverting touches nothing it shouldn't, then redeploy them.
    s += `\n# studio.js is mirrored into game repos. Re-propagate the reverted file to each game that\n# ships THIS version, then redeploy. (md5 guard → only the games that actually had it are touched.)\nSDK_NOW=$(md5sum engine/sdk/studio.js | cut -d' ' -f1)\nfor g in ${ids}; do\n  [ "$(md5sum ../$g/src/vendor/studio.js 2>/dev/null | cut -d' ' -f1)" = "$SDK_NOW" ] && continue   # already matches (untouched)\n  cp engine/sdk/studio.js "../$g/src/vendor/studio.js" && git -C "../$g" commit -am "revert studio.js (${c.short})" && git -C "../$g" push origin HEAD:main && (cd "../$g" && railway up --detach)\ndone\n`;
  }
  s += `git push origin HEAD:${BRANCH} && git push origin HEAD:main\n\`\`\`\n\n` +
    `Or restore just these files to their pre-change state (no revert commit):\n\n\`\`\`bash\ngit checkout ${c.short}^ -- ${c.engineFiles.map((f) => f.path).join(' ')}\n\`\`\`\n`;
  return s;
}

// ── --rollback <sha>: just print the plan ────────────────────────────────────
if (has('--rollback')) {
  const c = commitInfo(val('--rollback'));
  console.log(`\nEngine change ${c.short} — ${c.subject}\n`);
  console.log(rollbackMd(c));
  process.exit(0);
}

// ── select the commits to log ────────────────────────────────────────────────
let shas = [];
if (has('--commits')) shas = val('--commits').split(',').map((s) => s.trim()).filter(Boolean);
else if (has('--since')) shas = git('rev-list', '--reverse', `${val('--since')}..HEAD`).split('\n').filter(Boolean);
else { console.error('usage: --since <ref> | --commits a,b,c | --rollback <sha>   [--dry-run]'); process.exit(2); }

const changes = shas.map(commitInfo).filter((c) => c.engineFiles.length);   // only commits that touch engine code
if (!changes.length) { console.log('No engine-code commits in the given range.'); process.exit(0); }

async function gh(route, method = 'GET', bodyObj) {
  const r = await fetch(`https://api.github.com${route}`, {
    method, headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'engine-change-log' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  if (!r.ok && r.status !== 422) console.error(`  gh ${method} ${route} → ${r.status}`);
  return r.json();
}

function issueBody(c) {
  const files = c.engineFiles.map((f) => `- \`${f.status}\` ${f.path}`).join('\n');
  return `**Engine change** — logged for traceability + a deterministic rollback path.  \n\`[eng-change:${c.short}]\`\n\n` +
    `**Commit:** [\`${c.short}\`](https://github.com/${REPO}/commit/${c.sha}) · ${c.date}\n\n` +
    `**What:** ${c.subject}\n\n` +
    (c.body ? `${c.body}\n\n` : '') +
    `**Engine files touched:**\n${files}\n\n` +
    (c.touchesSdk ? `> ⚠️ Touches \`engine/sdk/studio.js\` — which is mirrored into every game repo. A full rollback re-propagates to consumer games + redeploys (see below).\n\n` : '') +
    rollbackMd(c) +
    `\n_Logged by \`scripts/engine-change-issues.mjs\`. Close this when the change is reviewed/accepted, or run the rollback above to undo it._`;
}

if (DRY) {
  console.log(`\n[dry-run] ${changes.length} engine change(s) would be logged on ${REPO}:\n`);
  for (const c of changes) console.log(`  • ${c.short}  ${c.subject}  (${c.engineFiles.length} files${c.touchesSdk ? ', studio.js' : ''})`);
  console.log('\n— sample issue body —\n');
  console.log(issueBody(changes[changes.length - 1]));
  process.exit(0);
}

if (!GH) { console.error('needs GH_TOKEN'); process.exit(2); }
await gh(`/repos/${REPO}/labels`, 'POST', { name: 'engine-change', color: '5319e7', description: 'a shipped engine change + its rollback path' });

// existing logged changes (idempotent)
const existing = {};
for (let page = 1; page <= 5; page++) {
  const list = await gh(`/repos/${REPO}/issues?state=all&per_page=100&page=${page}&labels=engine-change`);
  if (!Array.isArray(list) || !list.length) break;
  for (const i of list) { const m = /\[eng-change:([0-9a-f]+)\]/.exec(`${i.title} ${i.body || ''}`); if (m) existing[m[1]] = i; }
}

console.log(`\nengine change ledger · ${REPO}\n`);
const rows = [];
for (const c of changes) {
  const title = `engine: ${c.subject}  [eng-change:${c.short}]`;
  let iss = existing[c.short];
  if (!iss) iss = await gh(`/repos/${REPO}/issues`, 'POST', { title, body: issueBody(c), labels: ['engine-change'] });
  else await gh(`/repos/${REPO}/issues/${iss.number}`, 'PATCH', { body: issueBody(c) });
  rows.push({ c, number: iss.number });
  console.log(`  ${iss.number ? '✓' : '·'} #${iss.number} ${c.short} ${c.subject}`);
}

// pinned ledger tracker
const list = rows.map((r) => `- #${r.number} — \`${r.c.short}\` ${r.c.subject}${r.c.touchesSdk ? '  _(studio.js)_' : ''} → rollback: \`git revert ${r.c.short}\``).join('\n');
const trackerBody = `# 🔧 Engine change ledger  \`[eng-change:tracker]\`\n\nEvery engine change, newest-tracked below, each with a one-command rollback. Full per-change rollback (incl. re-propagating \`studio.js\` to game repos) is in each linked issue. Print any plan with \`node scripts/engine-change-issues.mjs --rollback <sha>\`.\n\n${list}\n\n_Regenerate: \`node scripts/engine-change-issues.mjs --since <ref>\`._`;
let tracker;
for (let page = 1; page <= 3; page++) {
  const l = await gh(`/repos/${REPO}/issues?state=all&per_page=100&page=${page}&labels=engine-change`);
  if (!Array.isArray(l) || !l.length) break;
  tracker = l.find((i) => /\[eng-change:tracker\]/.test(`${i.title} ${i.body || ''}`)); if (tracker) break;
}
if (!tracker) tracker = await gh(`/repos/${REPO}/issues`, 'POST', { title: '🔧 Engine change ledger — changes + rollback paths  [eng-change:tracker]', body: trackerBody, labels: ['engine-change'] });
else await gh(`/repos/${REPO}/issues/${tracker.number}`, 'PATCH', { body: trackerBody });
if (tracker && tracker.node_id) await fetch('https://api.github.com/graphql', { method: 'POST', headers: { Authorization: `bearer ${GH}`, 'User-Agent': 'engine-change-log' }, body: JSON.stringify({ query: `mutation($id:ID!){ pinIssue(input:{issueId:$id}){ issue{ number } } }`, variables: { id: tracker.node_id } }) }).catch(() => {});

console.log(`\n${rows.length} engine change(s) logged. 📌 Ledger: https://github.com/${REPO}/issues/${tracker && tracker.number}`);
console.log(`Roll back any one: node scripts/engine-change-issues.mjs --rollback <sha>`);

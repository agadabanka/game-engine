#!/usr/bin/env node
// posthog-query — run HogQL (PostHog's SQL) against your project from the CLI.
//
// PostHog's public phc_… key is WRITE-ONLY (ingestion). Reading/querying needs a
// **personal API key** (Settings → Personal API keys; scope: "Query Read" + "Project
// Read"). Never ship that key to the client — it's server/CLI only.
//
//   POSTHOG_API_KEY=phx_…  node scripts/posthog-query.mjs "<HogQL>"
//   POSTHOG_API_KEY=phx_…  node scripts/posthog-query.mjs --canned funnel-by-short
//   POSTHOG_API_KEY=phx_…  node scripts/posthog-query.mjs --list
//
// Env: POSTHOG_API_KEY (required), POSTHOG_PROJECT_ID (default 484401),
//      POSTHOG_HOST (default https://us.posthog.com — the APP host, not us.i.posthog.com).

const KEY = process.env.POSTHOG_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID || '484401';
const HOST = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/+$/, '');
const GAME = process.env.GAME || 'rainbow-run';

// Canned queries — the funnel questions you actually want answered. {game} is templated.
const CANNED = {
  'events-30d': `
    SELECT event, count() AS n
    FROM events WHERE timestamp > now() - INTERVAL 30 DAY
    GROUP BY event ORDER BY n DESC`,
  // which short drives the most plays (top of funnel attribution)
  'plays-by-short': `
    SELECT properties.utm_content AS short, count() AS opens, uniq(person_id) AS players
    FROM events
    WHERE event = 'game_open' AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY short ORDER BY opens DESC`,
  // full funnel conversion per short: opens → level_start → level_complete
  'funnel-by-short': `
    SELECT properties.utm_content AS short,
           countIf(event='game_open')     AS opened,
           countIf(event='level_start')   AS started,
           countIf(event='level_complete')AS completed,
           round(100.0*countIf(event='level_complete')/nullIf(countIf(event='game_open'),0),1) AS pct_complete
    FROM events
    WHERE timestamp > now() - INTERVAL 30 DAY
    GROUP BY short ORDER BY opened DESC`,
  // where do players die — the difficulty/drop heatmap
  'deaths-by-level': `
    SELECT properties.level AS level, properties.cause AS cause, count() AS deaths
    FROM events
    WHERE event = 'player_death' AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY level, cause ORDER BY deaths DESC`,
  // conversion split by device (does mobile convert worse?)
  'convert-by-device': `
    SELECT properties.$device_type AS device,
           countIf(event='game_open') AS opened,
           countIf(event='level_complete') AS completed,
           round(100.0*countIf(event='level_complete')/nullIf(countIf(event='game_open'),0),1) AS pct
    FROM events WHERE timestamp > now() - INTERVAL 30 DAY
    GROUP BY device ORDER BY opened DESC`,
};

async function hogql(query) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`PostHog ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j; // { columns: [...], results: [[...], ...] }
}

function printTable({ columns, results }) {
  if (!results?.length) { console.log('(no rows)'); return; }
  const cols = columns || results[0].map((_, i) => `c${i}`);
  const w = cols.map((c, i) => Math.max(String(c).length, ...results.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => cells.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
  console.log(line(cols));
  console.log(w.map((n) => '─'.repeat(n)).join('  '));
  for (const r of results) console.log(line(r));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--list') { console.log('canned queries:\n  ' + Object.keys(CANNED).join('\n  ')); return; }
  if (!KEY) { console.error('set POSTHOG_API_KEY (a personal API key with Query Read scope)'); process.exit(2); }
  let query;
  if (args[0] === '--canned') {
    query = CANNED[args[1]];
    if (!query) { console.error('unknown canned query. --list to see them.'); process.exit(2); }
  } else if (args[0]) {
    query = args[0];
  } else {
    console.error('usage: posthog-query "<HogQL>"  |  --canned <name>  |  --list'); process.exit(2);
  }
  query = query.replaceAll('{game}', GAME);
  console.log(`# project ${PROJECT} @ ${HOST}\n`);
  printTable(await hogql(query));
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });

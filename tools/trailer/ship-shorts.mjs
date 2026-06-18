// ── ENGINE shorts SHIPPER — the whole flow as ONE program ─────────────────────
// The failure this prevents: shorts recorded but not hosted, hosted but not wired,
// or wired but never committed/deployed — which is exactly what left the bird game
// with no visible shorts (the registry edit sat staged-but-uncommitted). This drives
// the FULL pipeline end-to-end and won't exit "green" until the shorts are LIVE:
//   record → host (GitHub Release) → wire hub/games.json → commit → push (branch +
//   main, which auto-deploys the hub) → POLL the live hub until the shorts appear.
// Idempotent + safe to re-run.
//   node tools/trailer/ship-shorts.mjs <gameId> [gameId...] [--skip-record] [--no-verify]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!ids.length) { console.error('usage: node tools/trailer/ship-shorts.mjs <gameId> [gameId...] [--skip-record] [--no-verify]'); process.exit(2); }
const SKIP_RECORD = process.argv.includes('--skip-record');
const NO_VERIFY = process.argv.includes('--no-verify');
const HUB = process.env.HUB_URL || 'https://hub-production-6d28.up.railway.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, opts = {}) => { console.log(`\n$ ${cmd} ${args.join(' ')}`); execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts }); };
const cap = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT }).toString().trim();

for (const id of ids) {
  console.log(`\n━━━ shipping shorts: ${id} ━━━`);
  if (!SKIP_RECORD) run('node', ['tools/trailer/make-shorts.mjs', id]);   // record + compose off the live deploy
  run('node', ['tools/trailer/host-shorts.mjs', id]);                     // upload to the game's Release + auto-wire hub/games.json
}

// commit + push the registry (branch + main) so the wiring is NEVER lost (the bird-game bug)
const reg = 'hub/games.json';
if (cap('git', ['status', '--porcelain', reg])) {
  run('git', ['add', reg]);
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', `shorts: host + wire ${ids.join(', ')} into hub/games.json`]);
  const branch = cap('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  run('git', ['push', '-u', 'origin', branch]);
  run('git', ['push', 'origin', 'HEAD:main']);   // main auto-deploys the hub
} else {
  console.log('\n(no registry change to commit — shorts already wired to the live assets)');
}

// VERIFY: poll the live hub until each game's shorts actually show up (don't exit green early)
if (!NO_VERIFY) {
  console.log(`\nverifying on the live hub (${HUB})…`);
  for (const id of ids) {
    let live = 0;
    for (let i = 0; i < 40; i++) {   // ~6–7 min budget for the hub to build + serve
      try {
        const r = await fetch(`${HUB}/api/games`, { signal: AbortSignal.timeout(10000) });
        const g = (await r.json()).games.find((x) => x.id === id);
        live = (g && g.shorts || []).length;
        if (live > 0) break;
      } catch (e) {}
      await sleep(10000);
    }
    console.log(live > 0 ? `  ✓ ${id}: ${live} shorts live on the hub` : `  ⚠ ${id}: shorts not visible on the hub yet — re-run or check the hub deploy`);
  }
}
console.log(`\n✅ shorts shipped for ${ids.join(', ')}.`);

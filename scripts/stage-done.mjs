// Mark a make-game stage DONE — programmatically, in ONE step. Closing the loop the
// pipeline always wanted: set GAME_META.stages[<stage>]='done' AND immediately sync GitHub
// (close that stage's issue, advance the pinned Build tracker's 👉 NEXT pointer, flag any
// out-of-order completion). So "finish a stage" is a single command instead of two
// easy-to-forget ones (edit meta, then re-run the issues script). Reusable for every game.
//
//   node scripts/stage-done.mjs <owner/repo> --game-dir <dir> <stage> [<stage> ...]
//   node scripts/stage-done.mjs <owner/repo> --game-dir <dir> gate --next   (also print the new NEXT)
//
// Needs GH_TOKEN. Validates the stage key against the canonical pipeline so a typo can't
// silently write a bogus stage. After it runs, the repo's tracker reflects reality.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PIPELINE } from '../tools/lib/pipeline.mjs';

const argv = process.argv.slice(2);
const repo = argv.find((a) => !a.startsWith('--') && a.includes('/'));
const gi = argv.indexOf('--game-dir');
const gameDir = gi >= 0 ? argv[gi + 1] : null;
const VALID = new Set(PIPELINE.map((s) => s.key));
const stages = argv.filter((a, i) => !a.startsWith('--') && a !== repo && argv[i - 1] !== '--game-dir');
const alsoNext = argv.includes('--next');

if (!repo || !gameDir || !stages.length) {
  console.error('usage: node scripts/stage-done.mjs <owner/repo> --game-dir <dir> <stage> [<stage> ...]');
  console.error('stages: ' + [...VALID].join(' · '));
  process.exit(2);
}
if (!process.env.GH_TOKEN) { console.error('GH_TOKEN required'); process.exit(2); }
const bad = stages.filter((s) => !VALID.has(s));
if (bad.length) { console.error(`unknown stage(s): ${bad.join(', ')}\nvalid: ${[...VALID].join(' · ')}`); process.exit(2); }

const metaPath = path.join(gameDir, 'GAME_META.json');
if (!fs.existsSync(metaPath)) { console.error(`no GAME_META.json in ${gameDir}`); process.exit(2); }
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.stages = meta.stages || {};
for (const s of stages) meta.stages[s] = 'done';
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log(`✓ GAME_META.stages → done: ${stages.join(', ')}`);

// Sync GitHub: close the now-done stage issues + re-point the Build tracker's NEXT pointer.
const here = path.dirname(fileURLToPath(import.meta.url));
execFileSync('node', [path.join(here, 'make-game-issues.mjs'), repo, '--game-dir', gameDir], { stdio: 'inherit' });

if (alsoNext) {
  console.log('\n— next —');
  execFileSync('node', [path.join(here, 'make-game-issues.mjs'), repo, '--game-dir', gameDir, '--next'], { stdio: 'inherit' });
}

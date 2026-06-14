// tools/fun-max.mjs — #38 the fun-max CLI. Hill-climbs a game's levels by the feel model under the
// 0-death safety proxy, writes the improved levels + an edit log, and prints before/after FUN.
// DRY by default (prints only); pass --write to overwrite src/game/levels.js (then run `npm run eval`
// — the REAL 0-death gate — and only ship if it stays green).
//
//   node tools/fun-max.mjs <gameDir> [--write] [--steps=14]
import fs from 'node:fs';
import path from 'node:path';
import { funMaxCampaign } from './lib/funmax.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/fun-max.mjs <gameDir> [--write] [--steps=N]'); process.exit(2); }
const write = process.argv.includes('--write');
const steps = +((process.argv.find((a) => a.startsWith('--steps=')) || '').split('=')[1]) || 14;

const levelsPath = path.join(gameDir, 'src', 'game', 'levels.js');
const src = fs.readFileSync(levelsPath, 'utf8');
const g = {}; new Function('window', src)(g);                 // eval window.LEVELS = […]
const LEVELS = g.LEVELS || [];
if (!LEVELS.length) { console.error('no window.LEVELS found in', levelsPath); process.exit(1); }

const c = funMaxCampaign(LEVELS, { steps });
console.log(`\n🎢 fun-max · ${gameDir}  (steps=${steps}${write ? ', WRITE' : ', dry-run'})\n`);
c.results.forEach((r, i) => {
  console.log(`  L${i + 1} ${(LEVELS[i].name || '').padEnd(20)} FUN ${r.fun0} → ${r.fun1}  (+${r.kept} edits: ${r.log.filter((l) => l.kept).map((l) => l.type).join(', ') || 'none'})`);
});
console.log(`\n  campaign mean FUN ${c.meanFun0} → ${c.meanFun1}\n`);

if (write) {
  const header = src.slice(0, src.indexOf('window.LEVELS'));   // keep the file's comment banner
  fs.writeFileSync(levelsPath, header + 'window.LEVELS = ' + JSON.stringify(c.levels, null, 2) + ';\n');
  fs.writeFileSync(path.join(gameDir, 'out', 'fun-max-log.json'), JSON.stringify(c.results.map((r, i) => ({ level: i, name: LEVELS[i].name, fun0: r.fun0, fun1: r.fun1, edits: r.log })), null, 2));
  console.log(`  ✍️  wrote ${levelsPath} + out/fun-max-log.json — now run \`npm run eval\` (the 0-death gate) and only ship if GREEN.`);
} else {
  console.log('  (dry-run — pass --write to apply, then re-gate with `npm run eval`)');
}

// Apply out/shorts/wired.json (per-game shorts + shortsPlaylist) into
// hub/games.json: shorts as a top-level array, shortsPlaylist into meta.
//   node tools/trailer/wire-shorts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wired = JSON.parse(fs.readFileSync(path.join(ROOT, 'out/shorts/wired.json'), 'utf8'));
const gf = path.join(ROOT, 'hub/games.json');
const games = JSON.parse(fs.readFileSync(gf, 'utf8'));
let n = 0;
for (const g of games) {
  const w = wired[g.id]; if (!w) continue;
  g.shorts = w.shorts;
  g.meta = g.meta || {};
  if (w.shortsPlaylist) g.meta.shortsPlaylist = w.shortsPlaylist;
  n++;
}
fs.writeFileSync(gf, JSON.stringify(games, null, 2) + '\n');
console.log(`wired shorts into ${n} games → hub/games.json`);

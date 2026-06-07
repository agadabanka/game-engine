// CLI healthcheck: snapshot every registered game and print a one-line summary.
// Handy from a session-start hook or to sanity-check the registry locally.
//   node hub/refresh.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotAll } from './lib/aggregate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const games = JSON.parse(fs.readFileSync(path.join(HERE, 'games.json'), 'utf8'));
const d = await snapshotAll(games, { ghToken: process.env.GH_TOKEN });
console.log(`game-engine · ${d.totals.games} games · ${d.totals.live} live · ${d.totals.openNotes} open notes · ${d.totals.diaryEntries} diary entries`);
for (const g of d.games) {
  console.log(`  ${g.live ? '●' : g.diary.count ? '◐' : '○'} ${g.name.padEnd(16)} notes ${String(g.notes.open + '/' + g.notes.total).padStart(6)} · diary ${String(g.diary.count).padStart(3)} (${g.diary.source || '—'})${g.error ? ' · ' + g.error : ''}`);
}

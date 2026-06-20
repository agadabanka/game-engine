// tools/narrative.mjs — the NARRATIVE-COHERENCE stage CLI. Maps every engine PRIMITIVE a game's
// levels actually use (gap/hazard/conveyor/crumble/oneway/updraft/walker/boss…) to that game's
// FICTION, so nothing reads generic ("the void replaces the pit"). Prints the table, flags any
// primitive with no fiction, and (with --write) emits NARRATIVE.md + src/narrative.json. The agent
// can author overrides in GAME_META.narrative ({ fiction:{ gap:"…" }, theme, collectible }).
//
//   node tools/narrative.mjs <gameDir> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { narrativeFrom, narrativeMarkdown } from './lib/narrative.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/narrative.mjs <gameDir> [--write]'); process.exit(2); }
const write = process.argv.includes('--write');

const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
const src = fs.readFileSync(path.join(gameDir, 'src', 'game', 'levels.js'), 'utf8');
const g = {}; new Function('window', src)(g);
const levels = g.LEVELS || [];

const opts = meta.narrative || {};
const n = narrativeFrom(meta, levels, opts);
console.log(`\n📜 narrative · ${meta.name}  (${n.used.length} primitives used)\n`);
for (const m of n.map) console.log(`  ${m.authored ? '★' : '·'} ${m.primitive.padEnd(9)} → ${m.fiction}`);
if (n.issues.length) console.log(`\n  ⚠️ ${n.issues.length} unmapped: ${n.issues.join('; ')}`);

if (write) {
  fs.writeFileSync(path.join(gameDir, 'NARRATIVE.md'), narrativeMarkdown(n, meta) + '\n');
  fs.writeFileSync(path.join(gameDir, 'src', 'narrative.json'), JSON.stringify(n, null, 2) + '\n');
  console.log(`\n  ✍️  wrote ${path.relative(process.cwd(), path.join(gameDir, 'NARRATIVE.md'))} + src/narrative.json`);
} else {
  console.log('\n  (dry-run — pass --write to emit NARRATIVE.md + src/narrative.json)');
}
process.exit(n.ok ? 0 : 0);

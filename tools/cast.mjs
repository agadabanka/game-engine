// tools/cast.mjs — the CAST stage CLI. Reads a game's GAME_META.json, synthesizes a named ROSTER
// (hero + per-world adversaries + final boss — each a role/look/personality), prints it, and (with
// --write) emits CAST.md + src/cast.json. The art pipeline reads castArtList(); the HUD reads names.
// Mirrors tools/story.mjs. Enemy names/personalities can be authored in GAME_META.art.enemies
// ({key,desc,name,personality}); otherwise titleCase(key) + a default personality is used.
//
//   node tools/cast.mjs <gameDir> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { castFrom, castMarkdown } from './lib/cast.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/cast.mjs <gameDir> [--write]'); process.exit(2); }
const write = process.argv.includes('--write');

const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
// let a game author enemy names/personalities inline on its art.enemies entries
const enemies = (meta.art && meta.art.enemies) || [];
const names = Object.fromEntries(enemies.filter((e) => e.name).map((e) => [e.key, e.name]));
const personalities = Object.fromEntries(enemies.filter((e) => e.personality).map((e) => [e.key, e.personality]));
const opts = { names, personalities };
if (meta.heroPersonality) opts.heroPersonality = meta.heroPersonality;
if (meta.bossHp) opts.bossHp = meta.bossHp;

const cast = castFrom(meta, opts);
console.log(`\n🎭 cast · ${meta.name}\n`);
console.log(`  hero:  ${cast.hero.name} — ${cast.hero.personality}`);
for (const e of cast.enemies) console.log(`  enemy: ${e.name} (${e.world}) — ${e.personality}`);
console.log(`  boss:  ${cast.boss.name} — ${cast.boss.personality}`);

if (write) {
  fs.writeFileSync(path.join(gameDir, 'CAST.md'), castMarkdown(cast) + '\n');
  fs.mkdirSync(path.join(gameDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'src', 'cast.json'), JSON.stringify(cast, null, 2) + '\n');
  console.log(`\n  ✍️  wrote ${path.relative(process.cwd(), path.join(gameDir, 'CAST.md'))} + src/cast.json`);
} else {
  console.log('\n  (dry-run — pass --write to emit CAST.md + src/cast.json)');
}

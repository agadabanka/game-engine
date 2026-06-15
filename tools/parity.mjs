// tools/parity.mjs — #49 the parity gate. Gathers facts about a game and fails (exit 1) if it
// misses the richness bar: a menu, mobile scale + full-bleed, touch, real art, ≥K mechanics,
// ≥E enemy kinds, and a story. Run in the `gate` stage (alongside eval). Static (no browser).
//
//   node tools/parity.mjs <gameDir> [--mechanics=3] [--enemies=2]
import fs from 'node:fs';
import path from 'node:path';
import { checkParity, countMechanics } from './lib/parity.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/parity.mjs <gameDir> [--mechanics=N] [--enemies=N]'); process.exit(2); }
const read = (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return ''; } };
const has = (p) => fs.existsSync(path.join(dir, p));
const num = (flag) => { const a = process.argv.find((x) => x.startsWith(`--${flag}=`)); return a ? +a.split('=')[1] : undefined; };

const game = read('src/game/game.js'), html = read('src/index.html');
const sprites = read('src/game/sprites.js'), chars = read('src/game/characters.js');
let levels = []; try { const g = {}; new Function('window', read('src/game/levels.js'))(g); levels = g.LEVELS || []; } catch {}
let meta = {}; try { meta = JSON.parse(read('GAME_META.json')); } catch {}
const m = meta.meta || meta;

const facts = {
  menu: /Shell\.title|window\.SHELL\b/.test(game),
  scaleFit: /Scale\.FIT|mode:\s*Phaser\.Scale\.FIT/.test(game),
  fullBleed: /position:\s*fixed|inset:\s*0|100dvh|touch-action\s*:\s*none/.test(html),
  touch: /Studio\.Touch/.test(game),
  art: /window\.SPRITES\s*=\s*\{|"hero"\s*:/.test(sprites) || /window\.CHARACTER\s*=/.test(chars) || has('src/assets/sprites'),
  mechanics: countMechanics(levels),
  enemyKinds: ((m.art && m.art.enemies) || []).length || new Set((levels.flatMap((L) => (L.enemies || []).map((e) => e.kind || (e.fly ? 'flyer' : 'walker'))))).size,
  story: has('STORY.md') || has('src/story.json'),
};

const verdict = checkParity(facts, { mechanics: num('mechanics'), enemyKinds: num('enemies') });
console.log(`\n🪪 parity · ${path.basename(dir)}\n`);
verdict.checks.forEach((c) => console.log(`  ${c.ok ? '✓' : '✗'} ${c.k.padEnd(10)} ${c.want}${c.got != null ? `  (got ${c.got})` : ''}`));
console.log(`\n  ${verdict.ok ? '✅ PARITY PASS' : '❌ PARITY FAIL — ' + verdict.failed.join(', ')}\n`);
process.exit(verdict.ok ? 0 : 1);

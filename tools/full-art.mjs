// tools/full-art.mjs — ENGINE art orchestrator (#26). ONE command runs the whole art pipeline
// for a game: world backdrops + title keyart, hero + enemy sprite sheets, clay tile materials,
// and props. Each sub-tool is content-addressed (gencache) so re-runs are free, skips cleanly
// without a Gemini SA, and merges into one sprites manifest. Drives GAME_META.art.{style,
// enemies,tiles,props} + meta.worlds.
//
//   node tools/full-art.mjs <gameDir> [--all|--backdrops|--sprites|--tiles|--props] [--force]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const gameDir = process.argv[2];
if (!gameDir || !fs.existsSync(path.join(gameDir, 'GAME_META.json'))) {
  console.error('usage: node tools/full-art.mjs <gameDir> [--all|--backdrops|--sprites|--tiles|--props] [--force]');
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const flags = process.argv.slice(3).filter((a) => a.startsWith('--')).map((a) => a.slice(2));
const force = flags.includes('force');
const sel = flags.filter((f) => f !== 'force');
const all = !sel.length || sel.includes('all');
const want = (k) => all || sel.includes(k);

// order matters: backdrops first (parallax anchors on them), then sprites (writes the manifest), then tiles + props (merge in)
const STEPS = [
  ['backdrops', 'art.mjs'],
  ['parallax', 'parallax-art.mjs'],   // multi-layer parallax layers — every game gets depth by default
  ['sprites', 'art-sprites.mjs'],
  ['tiles', 'art-tiles.mjs'],
  ['props', 'art-props.mjs'],
];

console.log(`\n🎨 full-art · ${gameDir}\n`);
let ran = 0, failed = 0;
for (const [name, tool] of STEPS) {
  if (!want(name)) continue;
  console.log(`── ${name} (${tool}) ─────────────────────────`);
  try {
    execFileSync('node', [path.join(here, tool), gameDir, ...(force ? ['--force'] : [])], { stdio: 'inherit' });
    ran++;
  } catch (e) { console.error(`  ✗ ${name} failed (continuing): ${e.message}`); failed++; }
  console.log('');
}
console.log(`✅ full-art done — ${ran} stage(s) run${failed ? `, ${failed} failed` : ''}. Assets + manifest under ${gameDir}/src/assets.`);

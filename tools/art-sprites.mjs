// tools/art-sprites.mjs — ENGINE character-sprite generator (#20). Produces a real animated
// hero from GAME_META: a locked MODEL SHEET (Gemini), then one green-screen frame per pose
// (idle/run×4/jump/fall/land) conditioned on the sheet → chroma-key to transparent → trim →
// pack into ONE uniform sprite sheet + a manifest the game loads (with a Studio.Toon fallback).
//
//   node tools/art-sprites.mjs <gameDir> [--force]
//
// Needs a Vertex/Gemini SA (GEMINI_SA_JSON). Skips cleanly if absent. Each Gemini call is
// content-addressed via gencache, so re-runs are free. Keying/packing runs in headless Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';
import { cached } from './lib/gencache.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/art-sprites.mjs <gameDir> [--force]'); process.exit(2); }
const force = process.argv.includes('--force');
if (!geminiConfigured()) { console.error('No Gemini SA — skipping sprite art (the game keeps its Studio.Toon rig).'); process.exit(0); }

const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
const hero = meta.hero || meta.name || 'a cute cartoon hero';
const style = (meta.art && meta.art.style) || 'bold-outline cartoon, flat cel shading, big friendly eyes';
const cacheDir = path.join(gameDir, '.cache');
const outDir = path.join(gameDir, 'src/assets/sprites');
fs.mkdirSync(outDir, { recursive: true });

const GREEN = 'FLAT SOLID GREEN (#00d800) background everywhere — nothing else: no ground, no shadow, no text, no separators.';
const SHEET_PROMPT = `Character model sheet for "${hero}". Four views in a row (front, side facing right, 3/4, back), ${style}. Consistent proportions and colors across views, bold thick dark outlines. Plain light-grey background. No text.`;
// 7 STATES, model-sheet-conditioned so frames stay consistent (low boil). idle/run/cheer are
// multi-frame for fluid loops; Studio.Hero adds the procedural smoothing (squash/lerp/bob/lean).
const POSES = [
  ['idle', 'standing idle, relaxed, gentle smile, facing RIGHT'],
  ['idle2', 'standing idle mid-breath, facing RIGHT, chest a touch higher, very subtle bob — idle frame 2'],
  ['run1', 'SPRINTING hard to the RIGHT, whole body LEANING FAR FORWARD over its toes (momentum), legs in a WIDE running stride — front leg lifted high with the knee bent up, the back leg kicked straight out behind, arms pumping like a sprinter (front arm forward, back arm back). Dynamic and airborne, clearly mid-RUN — NOT standing upright — run-cycle frame 1 of 4'],
  ['run2', 'SPRINTING to the RIGHT, leaning forward, the PASSING pose — legs crossing close under the body, one foot just pushing off the ground and the other swinging through, arms swapping. Low, compressed and fast, clearly running — NOT standing — run-cycle frame 2 of 4'],
  ['run3', 'SPRINTING hard to the RIGHT, body LEANING FAR FORWARD, legs in the OPPOSITE wide stride now — the other leg lifted high and forward with the knee up, the first leg extended straight behind, arms pumping the other way. Dynamic and airborne, clearly mid-RUN — NOT standing — run-cycle frame 3 of 4'],
  ['run4', 'SPRINTING to the RIGHT, leaning forward, the other PASSING pose — legs crossing close under the body, the opposite foot pushing off, arms swapping. Low, compressed and fast, clearly running — NOT standing — run-cycle frame 4 of 4'],
  ['jump', 'JUMPING up, facing RIGHT, body stretched tall, arms up, legs tucked'],
  ['fall', 'FALLING, facing RIGHT, arms out for balance, legs reaching down'],
  ['land', 'LANDING squash, facing RIGHT, knees deeply bent, body compressed low, arms out'],
  ['land2', 'recovering from a landing, facing RIGHT, rising back up, knees slightly bent, arms settling'],
  ['hurt', 'HURT recoil, facing RIGHT, head snapped back, eyes squeezed shut, body flinching, arms up'],
  ['cheer1', 'CELEBRATING with joy, facing RIGHT, both arms thrown up, big happy open-mouth grin, looking up'],
  ['cheer2', 'CELEBRATING, facing RIGHT, a little hop with arms up, eyes sparkling with delight'],
];
const posePrompt = (desc) => `Use the attached model sheet as the EXACT same character (${hero}: identical colors, outline, proportions, ${style}). Render ONE full-body sprite, SIDE VIEW facing RIGHT, centered, full body in frame, at the SAME size as the other frames. POSE: ${desc}. ${GREEN}`;

async function genPNG(key, prompt, refs, ar) {
  const c = await cached('sprite', { key, prompt, refs: refs ? 'ref' : 'none', model: 'img' }, '.png',
    async () => { const { base64 } = await generateImage(prompt, { aspectRatio: ar || '1:1', refs }); return Buffer.from(base64, 'base64'); },
    { dir: cacheDir });
  return { path: c.path, hit: c.hit };
}

console.log(`\nsprite art · ${hero}`);
const sheet = await genPNG('modelsheet', SHEET_PROMPT, undefined, '16:9');
console.log(`  model sheet${sheet.hit ? ' (cached)' : ''}`);
const refs = [{ base64: fs.readFileSync(sheet.path).toString('base64'), mimeType: 'image/png' }];
const frames = [];
for (const [name, desc] of POSES) {
  const f = await genPNG(name, posePrompt(desc), refs, '1:1');
  frames.push({ name, path: f.path });
  process.stdout.write(`  ${name}${f.hit ? '·' : '✱'}`);
}
console.log('');

// ── enemies (#21): one green-screen sheet per kind (stand + waddle) from meta.art.enemies ──
const enemies = (meta.art && meta.art.enemies) || [];
// 7 STATES per enemy too (every actor animates richly, not just stand+walk).
const EPOSES = [
  ['idle', 'standing idle, facing RIGHT'],
  ['walk1', 'mid-WALK step to the RIGHT, leaning into the step, one stubby foot lifted and reaching FORWARD, the other foot planted behind, body tilted forward — clearly walking, NOT standing still'],
  ['walk2', 'mid-WALK, the PASSING pose, both feet close together under the body, body bobbed slightly low, facing RIGHT — clearly mid-stride'],
  ['walk3', 'mid-WALK step to the RIGHT, the OTHER stubby foot now lifted and reaching FORWARD, body tilted the other way — clearly walking, NOT standing still'],
  ['hurt', 'squashed and flattened, facing RIGHT, eyes shut — got stomped flat'],
  ['hop', 'hopping up, facing RIGHT, body stretched tall, little feet tucked'],
  ['happy', 'happy and bouncy, facing RIGHT, big smile, eyes bright'],
  ['turn', 'turning around, facing FORWARD toward the viewer, startled wide eyes'],
  ['jump', 'a big joyful jump, facing RIGHT, body fully stretched tall, feet kicked up'],
];
const enemyFrames = {};
for (const en of enemies) {
  enemyFrames[en.key] = [];
  for (const [pose, desc] of EPOSES) {
    const f = await genPNG('enemy_' + en.key + '_' + pose, `${en.desc}, ${style}. Render ONE full-body sprite, SIDE VIEW facing RIGHT, centered, full body in frame. POSE: ${desc}. ${GREEN}`, undefined, '1:1');
    enemyFrames[en.key].push(f.path);
    process.stdout.write(`  ${en.key}.${pose}${f.hit ? '·' : '✱'}`);
  }
}
if (enemies.length) console.log('');

// ── headless: chroma-key green → transparent, trim, pack into uniform sheets (hero + enemies) ──
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
async function packSheet(paths) {
  const urls = paths.map((p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'));
  return await page.evaluate(async (urls) => {
    function load(u) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; }); }
    async function keyTrim(u) {
      const im = await load(u); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); const id = x.getImageData(0, 0, c.width, c.height); const d = id.data;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
        if (g > 90 && g > r * 1.25 && g > b * 1.25) d[i + 3] = 0;
        else if (g > r && g > b && g - Math.max(r, b) > 28) { d[i] = r * .7; d[i + 2] = b * .7; d[i + 3] = Math.max(0, d[i + 3] - 80); } }
      x.putImageData(id, 0, 0);
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) { if (d[(yy * c.width + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
      if (x1 < x0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
      const w = x1 - x0 + 1, h = y1 - y0 + 1; const tc = document.createElement('canvas'); tc.width = w; tc.height = h;
      tc.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h); return { canvas: tc, w, h };
    }
    const fr = []; for (const u of urls) fr.push(await keyTrim(u));
    const cw = Math.max(...fr.map((f) => f.w)), ch = Math.max(...fr.map((f) => f.h));
    const cellW = Math.ceil(cw * 1.04), cellH = Math.ceil(ch * 1.02);
    // GRID-pack (rows × cols), capping the sheet at ~3600px each side — a single row of many frames
    // blows past the GPU max-texture-size (≈4096 on mobile) and the whole sheet fails to load (black).
    // Phaser slices a grid by frameWidth/frameHeight in frame order (L→R, top→bottom), so the anim
    // frame indices are unchanged.
    const cols = Math.max(1, Math.min(fr.length, Math.floor(3600 / cellW) || 1));
    const rows = Math.ceil(fr.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cellW * cols; sheet.height = cellH * rows; const sx = sheet.getContext('2d');
    fr.forEach((f, i) => { const cx = (i % cols) * cellW, cy = ((i / cols) | 0) * cellH; sx.drawImage(f.canvas, Math.round(cx + (cellW - f.w) / 2), Math.round(cy + (cellH - f.h))); }); // feet-aligned per cell
    return { url: sheet.toDataURL('image/png'), frameWidth: cellW, frameHeight: cellH, count: fr.length, cols: cols };
  }, urls);
}
const packed = await packSheet(frames.map((f) => f.path));
fs.writeFileSync(path.join(outDir, 'hero.png'), Buffer.from(packed.url.split(',')[1], 'base64'));
const manifest = {
  hero: { sheet: 'sprites/hero.png', frameWidth: packed.frameWidth, frameHeight: packed.frameHeight,
    anims: { idle: [0, 1], run: [2, 3, 4, 5], jump: [6], fall: [7], land: [8, 9], hurt: [10], cheer: [11, 12] } },
  enemies: {},
};
for (const en of enemies) {
  const ep = await packSheet(enemyFrames[en.key]);
  fs.writeFileSync(path.join(outDir, en.key + '.png'), Buffer.from(ep.url.split(',')[1], 'base64'));
  manifest.enemies[en.key] = { sheet: 'sprites/' + en.key + '.png', frameWidth: ep.frameWidth, frameHeight: ep.frameHeight, anims: { idle: [0], walk: [1, 2, 3], hurt: [4], hop: [5], happy: [6], turn: [7], jump: [8] } };
  console.log(`  enemy ${en.key} → ${en.key}.png (${ep.count} frames)`);
}
await browser.close();
const mPath = path.join(outDir, 'manifest.json');
const prev = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : {};
const full = { ...prev, ...manifest };
fs.writeFileSync(mPath, JSON.stringify(full, null, 2));
// also emit a JS global so the game knows the frame size synchronously (to load the spritesheet)
fs.writeFileSync(path.join(gameDir, 'src/game/sprites.js'), '/* generated by tools/art-sprites.mjs — real character sprite atlas (Studio.Hero loads it, falls back to the Toon rig). */\nwindow.SPRITES = ' + JSON.stringify(full, null, 2) + ';\n');
console.log(`\n✅ hero sheet → ${path.join(outDir, 'hero.png')} (${packed.count} frames, ${packed.frameWidth}×${packed.frameHeight}) + manifest.json + src/game/sprites.js`);

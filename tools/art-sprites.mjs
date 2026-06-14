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
const POSES = [
  ['idle', 'standing idle, relaxed, gentle smile, facing RIGHT'],
  ['run1', 'mid-RUN, facing RIGHT, leading leg forward and up, arms swinging — run-cycle frame 1 of 4'],
  ['run2', 'mid-RUN, facing RIGHT, passing/contact pose, body low — run-cycle frame 2 of 4'],
  ['run3', 'mid-RUN, facing RIGHT, other leg forward and up, arms swinging opposite — run-cycle frame 3 of 4'],
  ['run4', 'mid-RUN, facing RIGHT, passing/contact pose, body low — run-cycle frame 4 of 4'],
  ['jump', 'JUMPING up, facing RIGHT, body stretched tall, arms up, legs tucked'],
  ['fall', 'FALLING, facing RIGHT, arms out for balance, legs reaching down'],
  ['land', 'LANDING squash, facing RIGHT, knees bent, body compressed, arms out'],
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

// ── headless: chroma-key green → transparent, trim each frame, pack into a uniform sheet ──
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const dataUrls = frames.map((f) => 'data:image/png;base64,' + fs.readFileSync(f.path).toString('base64'));
const packed = await page.evaluate(async (urls) => {
  function load(u) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; }); }
  // key + trim one image → {canvas, w, h}
  async function keyTrim(u) {
    const im = await load(u); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); const id = x.getImageData(0, 0, c.width, c.height); const d = id.data;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > 90 && g > r * 1.25 && g > b * 1.25) d[i + 3] = 0;                       // green → clear
      else if (g > r && g > b && g - Math.max(r, b) > 28) { d[i] = r * .7; d[i + 2] = b * .7; d[i + 3] = Math.max(0, d[i + 3] - 80); } // despill edges
    }
    x.putImageData(id, 0, 0);
    // trim to content bbox
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) { if (d[(yy * c.width + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1; const tc = document.createElement('canvas'); tc.width = w; tc.height = h;
    tc.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
    return { canvas: tc, w, h };
  }
  const fr = []; for (const u of urls) fr.push(await keyTrim(u));
  const cw = Math.max(...fr.map((f) => f.w)), ch = Math.max(...fr.map((f) => f.h));
  const cellW = Math.ceil(cw * 1.04), cellH = Math.ceil(ch * 1.02);
  const sheet = document.createElement('canvas'); sheet.width = cellW * fr.length; sheet.height = cellH;
  const sx = sheet.getContext('2d');
  fr.forEach((f, i) => { const ox = i * cellW + (cellW - f.w) / 2, oy = cellH - f.h; sx.drawImage(f.canvas, Math.round(ox), Math.round(oy)); }); // bottom (feet) aligned
  return { url: sheet.toDataURL('image/png'), frameWidth: cellW, frameHeight: cellH, count: fr.length };
}, dataUrls);
await browser.close();

fs.writeFileSync(path.join(outDir, 'hero.png'), Buffer.from(packed.url.split(',')[1], 'base64'));
const manifest = {
  hero: { sheet: 'sprites/hero.png', frameWidth: packed.frameWidth, frameHeight: packed.frameHeight,
    anims: { idle: [0], run: [1, 2, 3, 4], jump: [5], fall: [6], land: [7] } },
};
const mPath = path.join(outDir, 'manifest.json');
const prev = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : {};
const full = { ...prev, ...manifest };
fs.writeFileSync(mPath, JSON.stringify(full, null, 2));
// also emit a JS global so the game knows the frame size synchronously (to load the spritesheet)
fs.writeFileSync(path.join(gameDir, 'src/game/sprites.js'), '/* generated by tools/art-sprites.mjs — real character sprite atlas (Studio.Hero loads it, falls back to the Toon rig). */\nwindow.SPRITES = ' + JSON.stringify(full, null, 2) + ';\n');
console.log(`\n✅ hero sheet → ${path.join(outDir, 'hero.png')} (${packed.count} frames, ${packed.frameWidth}×${packed.frameHeight}) + manifest.json + src/game/sprites.js`);

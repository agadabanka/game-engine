// tools/art-sprites.mjs — ENGINE character-sprite generator (sprite-SHEET approach, #20).
// Instead of one Gemini call per pose (which can't keep a run cycle's legs ALTERNATING),
// we ask nano-banana-pro (gemini-3-pro-image) for whole, coherent SPRITE SHEETS — a 6-frame
// run/walk cycle drawn in ONE image (so the legs visibly scissor left/right) plus a grid of
// action poses — on flat chroma green. We then chroma-key, segment the frames with connected-
// component labelling (robust to imperfect grids), trim, and pack into ONE uniform atlas + a
// manifest the game loads (Studio.Hero, with a Studio.Toon fallback).
//
//   node tools/art-sprites.mjs <gameDir> [--force]
//
// Needs a Vertex/Gemini SA (GEMINI_SA_JSON). Skips cleanly if absent. Each Gemini call is
// content-addressed via gencache, so re-runs are free. Keying/segmenting runs in headless Chromium.
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

const GREEN = 'ONE flat SOLID CHROMA GREEN (#00d800) fills the ENTIRE image, behind AND between every frame — NO ground, NO shadow, NO grid lines, NO boxes/borders, NO text, NO numbers, NO labels. Only the clay characters on flat green.';
const STYLE_NOTE = `polished CLAYMATION / plasticine style (${style}); bold rounded forms, glossy surface, soft studio key light, crisp clean edges.`;

// ── prompts ───────────────────────────────────────────────────────────────
// A 6-frame locomotion CYCLE in a 2×3 grid, with explicit per-frame leg choreography so the legs
// ALTERNATE (the whole point — one coherent image keeps the cycle consistent).
function cyclePrompt(charDesc, motion) {
  const m = motion.toUpperCase(), lo = motion.toLowerCase();
  return `Create a 2D platformer ${m}-CYCLE sprite sheet. ${STYLE_NOTE}

THE CHARACTER: ${charDesc}. Keep EVERY frame the IDENTICAL character — same colours, same proportions, same eyes, same size, same details.

LAYOUT — a clean sprite sheet of EXACTLY 6 frames in a grid of 2 ROWS × 3 COLUMNS (top row = frames 1,2,3 left→right; bottom row = frames 4,5,6 left→right). Every frame the SAME cell size, evenly spaced, with a clear even green margin between frames. In each frame the character is CENTERED, drawn at the SAME scale, with its feet on the SAME horizontal baseline. Side profile; the character faces and moves to the RIGHT in all 6 frames. Nothing cropped — each whole character fits inside its cell.

${GREEN}

THE ${m} CYCLE — a smooth, looping, athletic ${lo} where the legs/feet CLEARLY ALTERNATE (scissor) left/right across the six frames. Draw the legs LONG and obvious so the motion reads:
• Frame 1 — CONTACT: the RIGHT leg reaches FORWARD and plants ahead of the body; the LEFT leg is stretched far BACK, pushing off. Body leans forward. Left arm forward, right arm back.
• Frame 2 — DOWN / RECOIL: both legs gather UNDER the body, knees bent, the body dips to its LOWEST.
• Frame 3 — PASSING: the LEFT leg swings FORWARD with the knee lifted HIGH; the RIGHT leg trails straight behind; the body rises to its TALLEST.
• Frame 4 — CONTACT (the MIRROR of frame 1): the LEFT leg reaches FORWARD and plants ahead; the RIGHT leg is stretched far BACK, pushing off. Body leans forward. Right arm forward, left arm back.
• Frame 5 — DOWN / RECOIL: both legs gather UNDER the body, knees bent, body at its LOWEST.
• Frame 6 — PASSING (the MIRROR of frame 3): the RIGHT leg swings FORWARD with the knee lifted HIGH; the LEFT leg trails behind; body at its TALLEST.
The sequence loops seamlessly from frame 6 back to frame 1. Across the whole sheet the two legs visibly SWAP forward/back every frame — an unmistakable ${lo}, never a symmetric hop or bounce-in-place.`;
}

// A grid of N distinct action poses (idle/jump/fall/…), one per cell, in a known row-major order.
function gridPrompt(charDesc, poses) {
  const cols = 3, rows = Math.ceil(poses.length / cols);
  const lines = poses.map((p, i) => `• Frame ${i + 1} (row ${((i / cols) | 0) + 1}, col ${(i % cols) + 1}) — ${p[0].toUpperCase()}: ${p[1]}`).join('\n');
  return `Create a 2D platformer CHARACTER-POSE sprite sheet. ${STYLE_NOTE}

THE CHARACTER: ${charDesc}. Keep EVERY frame the IDENTICAL character — same colours, proportions, eyes, size, details.

LAYOUT — EXACTLY ${poses.length} frames in a grid of ${rows} ROWS × ${cols} COLUMNS, filled left→right then top→bottom. Every frame the SAME cell size, evenly spaced, with a clear even green margin between frames. Each character CENTERED, at the SAME scale, feet on the SAME baseline. Side profile facing RIGHT unless the pose says otherwise. Nothing cropped.

${GREEN}

THE POSES — one per frame, in THIS EXACT order:
${lines}`;
}

const HERO_POSES = [
  ['idle', 'standing idle, relaxed, gentle smile, weight settled'],
  ['idle2', 'standing idle mid-breath, chest a touch higher, a very subtle bob'],
  ['jump', 'JUMPING UP, body stretched tall, both arms up, legs tucked under'],
  ['fall', 'FALLING, arms out for balance, legs reaching down'],
  ['land', 'LANDING squash, knees deeply bent, body compressed low and wide, arms out'],
  ['land2', 'rising out of a landing, knees only slightly bent, arms settling'],
  ['hurt', 'HURT recoil, head snapped back, eyes squeezed shut, body flinching, arms up'],
  ['cheer1', 'CELEBRATING with joy, BOTH arms thrown up, big happy open-mouth grin, looking up'],
  ['cheer2', 'CELEBRATING, a happy little hop with arms up, eyes sparkling with delight'],
];
const ENEMY_POSES = [
  ['idle', 'standing idle, facing RIGHT'],
  ['hurt', 'squashed and flattened, eyes shut — got stomped flat'],
  ['hop', 'hopping up, body stretched tall, little feet tucked'],
  ['happy', 'happy and bouncy, big smile, eyes bright'],
  ['turn', 'turning to face FORWARD toward the viewer, startled wide eyes'],
  ['jump', 'a big joyful jump, body fully stretched tall, feet kicked up'],
];

async function genSheet(key, prompt, refs, ar) {
  const c = await cached('sheet', { key, prompt, refs: refs ? 'ref' : 'none', model: 'g3pro' }, '.png',
    async () => { const { base64 } = await generateImage(prompt, { aspectRatio: ar || '3:2', refs }); return Buffer.from(base64, 'base64'); },
    { dir: cacheDir });
  return { path: c.path, hit: c.hit };
}

console.log(`\nsprite art (sheets) · ${hero}`);

// ── headless Chromium: chroma-key + connected-component frame segmentation + packing ──
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();

// Slice ONE sheet into trimmed, chroma-keyed frames in row-major order (rows top→bottom, cols left→right).
async function sliceSheet(sheetPath, expected) {
  const b64 = fs.readFileSync(sheetPath).toString('base64');
  const frames = await page.evaluate(async ({ b64 }) => {
    function load(u) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; }); }
    const im = await load('data:image/png;base64,' + b64); const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const id = x.getImageData(0, 0, W, H), d = id.data;
    // chroma-key + green-spill suppression on edges
    const op = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (g > 90 && g > r * 1.25 && g > b * 1.25) { d[i * 4 + 3] = 0; op[i] = 0; }
      else { if (g > r && g > b && g - Math.max(r, b) > 26) { d[i * 4] = (r * 0.72) | 0; d[i * 4 + 2] = (b * 0.72) | 0; } op[i] = 1; }
    }
    // connected components (8-connectivity), iterative
    const lab = new Int32Array(W * H); let next = 1; const comps = []; const stack = [];
    for (let i = 0; i < W * H; i++) {
      if (op[i] && !lab[i]) {
        const cid = next++; let area = 0, minx = W, miny = H, maxx = 0, maxy = 0; stack.length = 0; stack.push(i); lab[i] = cid;
        while (stack.length) {
          const q = stack.pop(), qx = q % W, qy = (q / W) | 0; area++;
          if (qx < minx) minx = qx; if (qx > maxx) maxx = qx; if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue; const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx; if (op[ni] && !lab[ni]) { lab[ni] = cid; stack.push(ni); }
          }
        }
        comps.push({ id: cid, area, minx, miny, maxx, maxy });
      }
    }
    // keep meaningful blobs (ignore specks); merge nothing
    let big = comps.filter((c) => c.area > W * H * 0.004);
    big.forEach((c) => { c.cy = (c.miny + c.maxy) / 2; });
    // cluster into rows by y-center, then sort each row by x
    big.sort((a, b) => a.cy - b.cy);
    const rows = []; const rowTol = H * 0.16;
    big.forEach((c) => { let row = rows.find((r) => Math.abs(r.cy - c.cy) < rowTol); if (!row) { row = { cy: c.cy, items: [] }; rows.push(row); } row.items.push(c); row.cy = (row.cy * (row.items.length - 1) + c.cy) / row.items.length; });
    rows.sort((a, b) => a.cy - b.cy); rows.forEach((r) => r.items.sort((a, b) => a.minx - b.minx));
    const ordered = []; rows.forEach((r) => r.items.forEach((c) => ordered.push(c)));
    // extract each component to its own trimmed transparent canvas
    return ordered.map((cp) => {
      const w = cp.maxx - cp.minx + 1, h = cp.maxy - cp.miny + 1; const fc = document.createElement('canvas'); fc.width = w; fc.height = h; const fx = fc.getContext('2d');
      const fid = fx.createImageData(w, h), fd = fid.data;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const si = (cp.miny + yy) * W + (cp.minx + xx), di = (yy * w + xx) * 4;
        if (op[si] && lab[si] === cp.id) { fd[di] = d[si * 4]; fd[di + 1] = d[si * 4 + 1]; fd[di + 2] = d[si * 4 + 2]; fd[di + 3] = d[si * 4 + 3] || 255; } else fd[di + 3] = 0;
      }
      fx.putImageData(fid, 0, 0); return { url: fc.toDataURL('image/png'), w, h };
    });
  }, { b64 });
  if (expected && frames.length !== expected) console.log(`  ⚠ ${path.basename(sheetPath)} → ${frames.length} frames (expected ${expected})`);
  return frames;   // [{url,w,h}] row-major
}

// Grid-pack a list of frame data-urls into ONE uniform atlas (feet-aligned per cell).
async function packFrames(frameUrls) {
  return await page.evaluate(async (urls) => {
    function load(u) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; }); }
    const ims = []; for (const u of urls) ims.push(await load(u));
    const cw = Math.max(...ims.map((i) => i.width)), ch = Math.max(...ims.map((i) => i.height));
    const cellW = Math.ceil(cw * 1.04), cellH = Math.ceil(ch * 1.02);
    const cols = Math.max(1, Math.min(ims.length, Math.floor(3600 / cellW) || 1)), rows = Math.ceil(ims.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cellW * cols; sheet.height = cellH * rows; const sx = sheet.getContext('2d');
    ims.forEach((im, i) => { const cx = (i % cols) * cellW, cy = ((i / cols) | 0) * cellH; sx.drawImage(im, Math.round(cx + (cellW - im.width) / 2), Math.round(cy + (cellH - im.height))); });
    return { url: sheet.toDataURL('image/png'), frameWidth: cellW, frameHeight: cellH, count: ims.length, cols };
  }, frameUrls);
}

// identity model sheet (shared reference → keeps the run sheet & the action sheet on-model)
const modelPrompt = `Character model/reference sheet for "${hero}". ${STYLE_NOTE} Show the SAME character in a large clear SIDE view facing right and a three-quarter front view, full body, consistent colours and proportions, all of its features clearly visible. Plain neutral light-grey studio background. No text, no labels.`;
const model = await genSheet('hero_model', modelPrompt, undefined, '3:2');
console.log(`  hero model sheet${model.hit ? ' (cached)' : '✱'}`);
const heroRef = [{ base64: fs.readFileSync(model.path).toString('base64'), mimeType: 'image/png' }];

// HERO: a run-cycle sheet + an action sheet, conditioned on the model sheet
const heroRun = await genSheet('hero_run', cyclePrompt(hero, 'run'), heroRef, '3:2');
const heroAct = await genSheet('hero_actions', gridPrompt(hero, HERO_POSES), heroRef, '3:2');
console.log(`  hero run sheet${heroRun.hit ? '·' : '✱'}  hero action sheet${heroAct.hit ? '·' : '✱'}`);
const runFrames = await sliceSheet(heroRun.path, 6);
const actFrames = await sliceSheet(heroAct.path, HERO_POSES.length);
// assemble: actions first (idle,idle2,jump,fall,land,land2,hurt,cheer1,cheer2) then run1..6
const heroAll = actFrames.concat(runFrames);
const heroPacked = await packFrames(heroAll.map((f) => f.url));
fs.writeFileSync(path.join(outDir, 'hero.png'), Buffer.from(heroPacked.url.split(',')[1], 'base64'));
const nAct = actFrames.length;
const manifest = {
  hero: {
    sheet: 'sprites/hero.png', frameWidth: heroPacked.frameWidth, frameHeight: heroPacked.frameHeight,
    anims: {
      idle: [0, 1], jump: [2], fall: [3], land: [4, 5], hurt: [6], cheer: [7, 8],
      run: Array.from({ length: runFrames.length }, (_, i) => nAct + i),
    },
  },
  enemies: {},
};
console.log(`  hero → hero.png (${heroPacked.count} frames: ${nAct} action + ${runFrames.length} run, ${heroPacked.frameWidth}×${heroPacked.frameHeight})`);

// ENEMIES: each gets a walk-cycle sheet + an action sheet
const enemies = (meta.art && meta.art.enemies) || [];
for (const en of enemies) {
  const eDesc = `${en.desc}, a small game critter`;
  const eModel = await genSheet('en_' + en.key + '_model', `Character reference sheet for ${eDesc}. ${STYLE_NOTE} A clear side view facing right + a three-quarter view, full body, consistent. Plain light-grey background. No text.`, undefined, '3:2');
  const eRef = [{ base64: fs.readFileSync(eModel.path).toString('base64'), mimeType: 'image/png' }];
  const eWalk = await genSheet('en_' + en.key + '_walk', cyclePrompt(eDesc, 'walk'), eRef, '3:2');
  const eAct = await genSheet('en_' + en.key + '_actions', gridPrompt(eDesc, ENEMY_POSES), eRef, '3:2');
  const wF = await sliceSheet(eWalk.path, 6), aF = await sliceSheet(eAct.path, ENEMY_POSES.length);
  const all = aF.concat(wF);
  const packed = await packFrames(all.map((f) => f.url));
  fs.writeFileSync(path.join(outDir, en.key + '.png'), Buffer.from(packed.url.split(',')[1], 'base64'));
  const na = aF.length;
  manifest.enemies[en.key] = {
    sheet: 'sprites/' + en.key + '.png', frameWidth: packed.frameWidth, frameHeight: packed.frameHeight,
    anims: { idle: [0], hurt: [1], hop: [2], happy: [3], turn: [4], jump: [5], walk: Array.from({ length: wF.length }, (_, i) => na + i) },
  };
  console.log(`  enemy ${en.key} → ${en.key}.png (${packed.count} frames: ${na} action + ${wF.length} walk)`);
}

await browser.close();
const mPath = path.join(outDir, 'manifest.json');
const prev = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : {};
const full = { ...prev, ...manifest };
fs.writeFileSync(mPath, JSON.stringify(full, null, 2));
fs.writeFileSync(path.join(gameDir, 'src/game/sprites.js'), '/* generated by tools/art-sprites.mjs — sprite-SHEET atlas (Studio.Hero loads it, falls back to the Toon rig). */\nwindow.SPRITES = ' + JSON.stringify(full, null, 2) + ';\n');
console.log(`\n✅ hero + ${enemies.length} enemies → ${outDir} (sheets sliced + packed) + manifest.json + src/game/sprites.js`);

// tools/art-props.mjs — ENGINE world-prop generator (#23). One green-screen, chroma-keyed
// sprite per prop (collectible / bounce pad / goal / decoration / hazard marker) from
// meta.art.props → src/assets/props/<key>.png. The game preloads them as `prop_<key>` and
// applies them (e.g. setTexture on coins/goal/pads). Merged into the sprites manifest.
//
//   node tools/art-props.mjs <gameDir> [--force]   (needs GEMINI_SA_JSON; skips cleanly if absent)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';
import { cached } from './lib/gencache.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/art-props.mjs <gameDir> [--force]'); process.exit(2); }
if (!geminiConfigured()) { console.error('No Gemini SA — skipping prop art.'); process.exit(0); }
const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
const props = (meta.art && meta.art.props) || [];
if (!props.length) { console.log('no meta.art.props declared — nothing to do.'); process.exit(0); }
const styleRaw = (meta.art && meta.art.style) || 'bold cartoon';
// PROPS must sit on a flat, removable background. A "sketchbook paper / cream page" style fights
// that (the model draws the object ON the page, so there's no chroma to key → an opaque rectangle).
// Strip page/paper/background phrases for props and ask for a clean die-cut sticker on flat green.
const style = styleRaw.replace(/\b(on |warm )?(cream |white |kraft )?(sketchbook |note ?book )?(paper|page|background|backdrop|parchment)\b[^,.;]*/gi, '')
  .replace(/\bfield sketchbook\b[^,.;]*/gi, 'naturalist ink sketch').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
const cacheDir = path.join(gameDir, '.cache');
const outDir = path.join(gameDir, 'src/assets/props');
fs.mkdirSync(outDir, { recursive: true });
const GREEN = 'Render it as a clean DIE-CUT STICKER of just the object, centered, with a little empty margin around it. The ENTIRE background is FLAT SOLID CHROMA GREEN (#00d800) filling every pixel that is not the object — NO paper, NO sketchbook page, NO panel, NO border, NO frame, NO ground line, NO drop shadow, NO text.';

async function genPNG(key, prompt) {
  const c = await cached('prop', { key, prompt }, '.png', async () => { const { base64 } = await generateImage(prompt, { aspectRatio: '1:1' }); return Buffer.from(base64, 'base64'); }, { dir: cacheDir });
  return c;
}
console.log(`\nprop art · ${props.length} props`);
const raw = {};
for (const p of props) {
  const c = await genPNG(p.key, `A single ${p.desc}, drawn ${style}. ONE object only, centered, full object in frame. ${GREEN}`);
  raw[p.key] = c.path; process.stdout.write(`  ${p.key}${c.hit ? '·' : '✱'}`);
}
console.log('');

// Background removal by EDGE FLOOD-FILL — robust to ANY flat background (chroma green, cream
// sketchbook paper, white), which a fixed green-key is not: it samples the real border colour and
// floods inward, stopping at the object's outline, so a sketch drawn ON a page still cuts out
// cleanly instead of staying an opaque rectangle. Then green-despill, feather, trim + VALIDATE alpha.
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const propMap = {};
const report = [];
for (const p of props) {
  const url = 'data:image/png;base64,' + fs.readFileSync(raw[p.key]).toString('base64');
  const out = await page.evaluate(async (u) => {
    function load(x) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = x; }); }
    const im = await load(u); const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const id = x.getImageData(0, 0, W, H), d = id.data;
    // 1) sample the background colour from the border ring (corners + edge midpoints, median per channel)
    const samp = []; const step = Math.max(1, Math.floor(Math.min(W, H) / 40));
    for (let xx = 0; xx < W; xx += step) { samp.push([xx, 0]); samp.push([xx, H - 1]); }
    for (let yy = 0; yy < H; yy += step) { samp.push([0, yy]); samp.push([W - 1, yy]); }
    const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
    const br = med(samp.map(([sx, sy]) => d[(sy * W + sx) * 4]));
    const bg = med(samp.map(([sx, sy]) => d[(sy * W + sx) * 4 + 1]));
    const bb = med(samp.map(([sx, sy]) => d[(sy * W + sx) * 4 + 2]));
    const greenBg = bg > 90 && bg > br * 1.2 && bg > bb * 1.2;
    const TOL = greenBg ? 90 : 56;            // green keys hard; paper/white needs a tighter tol to keep ink
    const tol2 = TOL * TOL;
    const isBg = (i) => { const r = d[i] - br, g = d[i + 1] - bg, b = d[i + 2] - bb; return (r * r + g * g + b * b) <= tol2 || (greenBg && d[i + 1] > 90 && d[i + 1] > d[i] * 1.2 && d[i + 1] > d[i + 2] * 1.2); };
    // 2) flood-fill from every border pixel through connected background → alpha 0
    const seen = new Uint8Array(W * H), stack = new Int32Array(W * H); let sp = 0;
    const push = (px) => { if (!seen[px] && isBg(px * 4)) { seen[px] = 1; stack[sp++] = px; } };
    for (let xx = 0; xx < W; xx++) { push(xx); push((H - 1) * W + xx); }
    for (let yy = 0; yy < H; yy++) { push(yy * W); push(yy * W + W - 1); }
    while (sp > 0) { const px = stack[--sp]; d[px * 4 + 3] = 0; const xx = px % W, yy = (px / W) | 0;
      if (xx > 0) push(px - 1); if (xx < W - 1) push(px + 1); if (yy > 0) push(px - W); if (yy < H - 1) push(px + W); }
    // 3) green-despill + feather the cut edge (kept pixels that still look like bg lose some alpha)
    for (let px = 0; px < W * H; px++) { const i = px * 4; if (d[i + 3] === 0) continue;
      if (greenBg && d[i + 1] > d[i] && d[i + 1] > d[i + 2]) d[i + 1] = Math.round((d[i] + d[i + 2]) / 2 * 0.9 + d[i + 1] * 0.1);
      if (isBg(i)) d[i + 3] = Math.round(d[i + 3] * 0.35); }
    x.putImageData(id, 0, 0);
    // 4) trim to the object bbox + count transparency for validation
    let x0 = W, y0 = H, x1 = 0, y1 = 0, clear = 0;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const a = d[(yy * W + xx) * 4 + 3];
      if (a < 16) clear++; if (a > 32) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1; const tc = document.createElement('canvas'); tc.width = w; tc.height = h;
    tc.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
    return { url: tc.toDataURL('image/png'), transparentRatio: +(clear / (W * H)).toFixed(3), greenBg, fillW: +(w / W).toFixed(2), fillH: +(h / H).toFixed(2) };
  }, url);
  fs.writeFileSync(path.join(outDir, p.key + '.png'), Buffer.from(out.url.split(',')[1], 'base64'));
  propMap[p.key] = 'props/' + p.key + '.png';
  // VALIDATE: a good cut-out removed a real chunk of background (≥8% clear) but kept an object
  // (didn't erase nearly everything, and the trimmed subject isn't still the whole frame).
  const ok = out.transparentRatio >= 0.08 && out.transparentRatio <= 0.98 && (out.fillW < 0.99 || out.fillH < 0.99);
  report.push({ key: p.key, ...out, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${p.key} → ${p.key}.png  (clear ${Math.round(out.transparentRatio * 100)}% · bg ${out.greenBg ? 'green' : 'paper'})`);
}
await browser.close();
const bad = report.filter((r) => !r.ok);
if (bad.length) console.log(`\n  ⚠️  ${bad.length} prop(s) failed alpha validation: ${bad.map((b) => `${b.key} (clear ${Math.round(b.transparentRatio * 100)}%)`).join(', ')} — check the source art / prompt.`);
else console.log(`\n  ✅ all ${report.length} props validated — real transparency, object preserved.`);

const sprDir = path.join(gameDir, 'src/assets/sprites'); fs.mkdirSync(sprDir, { recursive: true });
const mPath = path.join(sprDir, 'manifest.json');
const full = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : {};
full.props = propMap;
fs.writeFileSync(mPath, JSON.stringify(full, null, 2));
fs.writeFileSync(path.join(gameDir, 'src/game/sprites.js'), '/* generated by tools/art-*.mjs — character + tile + prop atlas. */\nwindow.SPRITES = ' + JSON.stringify(full, null, 2) + ';\n');
console.log(`\n✅ ${Object.keys(propMap).length} props → ${outDir} + merged into sprites.js`);

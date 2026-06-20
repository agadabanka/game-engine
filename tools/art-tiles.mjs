// tools/art-tiles.mjs — ENGINE themed-tile generator (#22). One claymation GROUND texture per
// material (a side-view clay block: a clay top surface + body) → src/assets/tiles/<key>.<ext>.
// The game preloads them as `tile_<mat>`; Studio.Level.build prefers `tile_<mat>` over the baked
// materialTile, and Textures.kit skips baking when a generated tile is loaded. Matches the
// claymation backdrops so the ground stops reading as a flat gradient.
//
//   node tools/art-tiles.mjs <gameDir> [--force]
//
// Needs a Gemini SA (GEMINI_SA_JSON). Skips cleanly if absent. Cached via gencache. Merges into
// the sprites manifest (manifest.json + src/game/sprites.js) so one include covers all art.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';
import { cached } from './lib/gencache.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/art-tiles.mjs <gameDir> [--force]'); process.exit(2); }
if (!geminiConfigured()) { console.error('No Gemini SA — skipping tile art (the game keeps the baked materialTile).'); process.exit(0); }

const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
const tiles = (meta.art && meta.art.tiles) || [];
if (!tiles.length) { console.log('no meta.art.tiles declared — nothing to do.'); process.exit(0); }
const styleRaw = (meta.art && meta.art.style) || 'bold cartoon';
// A GROUND tile must FILL the frame edge-to-edge. A "sketchbook paper / cream page / folk-art border"
// style makes the model draw the material ON a bordered page (paper margins → ugly square borders
// when tiled). Strip page/paper/border phrases so the texture is a flat, seamless material swatch.
const style = styleRaw.replace(/\b(on |warm )?(cream |white |kraft )?(sketchbook |note ?book )?(paper|page|background|backdrop|parchment)\b[^,.;]*/gi, '')
  .replace(/\b(african )?folk[- ]art (motif|border)s?\b[^,.;]*/gi, 'hand-drawn').replace(/\bfield sketchbook\b[^,.;]*/gi, 'naturalist ink sketch')
  .replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
const cacheDir = path.join(gameDir, '.cache');
const outDir = path.join(gameDir, 'src/assets/tiles');
fs.mkdirSync(outDir, { recursive: true });

const tileMap = {};
const report = [];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
console.log(`\ntile art · ${tiles.length} materials`);
for (const t of tiles) {
  try {
    const prompt = `A seamless, full-frame close-up TEXTURE SWATCH of ${t.desc}. Richly HAND-PAINTED: dense ink linework over saturated watercolour, deep earthy colour covering the whole surface, hand-drawn storybook feel. The material FILLS EVERY PIXEL corner to corner as one continuous dense surface — strong saturated colour right up to all four edges. Absolutely NO paper, NO cream page, NO white, NO pale margin, NO border, NO frame, NO vignette, NO drop shadow, NO scene, NO object, NO text.`;
    const c = await cached('tile', { key: t.key, desc: t.desc, prompt, v: 3 }, '.img',
      async () => { const { mimeType, base64 } = await generateImage(prompt, { aspectRatio: '16:9' }); return Buffer.from(JSON.stringify({ mimeType, base64 })); },
      { dir: cacheDir });
    const { mimeType, base64 } = JSON.parse(fs.readFileSync(c.path, 'utf8'));
    // auto-trim any uniform light (paper) border the model still left, and validate the edges fill.
    const res = await page.evaluate(async (u) => {
      function load(x) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = x; }); }
      const im = await load(u); const W = im.naturalWidth, H = im.naturalHeight;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, W, H).data;
      const paperish = (i) => { const r = d[i], g = d[i + 1], b = d[i + 2]; return r > 198 && g > 192 && b > 170 && (Math.max(r, g, b) - Math.min(r, g, b)) < 46; };
      const rowPaper = (y) => { let n = 0; for (let xx = 0; xx < W; xx++) if (paperish((y * W + xx) * 4)) n++; return n / W > 0.86; };
      const colPaper = (xx) => { let n = 0; for (let yy = 0; yy < H; yy++) if (paperish((yy * W + xx) * 4)) n++; return n / H > 0.86; };
      let top = 0, bot = H - 1, lef = 0, rig = W - 1;
      while (top < bot && rowPaper(top)) top++; while (bot > top && rowPaper(bot)) bot--;
      while (lef < rig && colPaper(lef)) lef++; while (rig > lef && colPaper(rig)) rig--;
      const w = rig - lef + 1, h = bot - top + 1;
      const tc = document.createElement('canvas'); tc.width = w; tc.height = h; tc.getContext('2d').drawImage(c, lef, top, w, h, 0, 0, w, h);
      // after trim, re-check the four edges still aren't paper (validation)
      const td = tc.getContext('2d').getImageData(0, 0, w, h).data; const pp = (i) => { const r = td[i], g = td[i + 1], b = td[i + 2]; return r > 198 && g > 192 && b > 170 && (Math.max(r, g, b) - Math.min(r, g, b)) < 46; };
      let edge = 0, tot = 0; for (let xx = 0; xx < w; xx++) { tot += 2; if (pp((0 * w + xx) * 4)) edge++; if (pp(((h - 1) * w + xx) * 4)) edge++; }
      for (let yy = 0; yy < h; yy++) { tot += 2; if (pp((yy * w) * 4)) edge++; if (pp((yy * w + w - 1) * 4)) edge++; }
      return { url: tc.toDataURL('image/jpeg', 0.9), trimmed: (w < W || h < H), trimPct: +(1 - (w * h) / (W * H)).toFixed(2), edgePaper: +(edge / tot).toFixed(2) };
    }, 'data:' + mimeType + ';base64,' + base64);
    const file = t.key + '.jpg';
    fs.writeFileSync(path.join(outDir, file), Buffer.from(res.url.split(',')[1], 'base64'));
    tileMap[t.key] = 'tiles/' + file;
    const ok = res.edgePaper < 0.15;   // edges should be material, not leftover paper
    report.push({ key: t.key, ...res, ok });
    console.log(`  ${ok ? '✓' : '✗'} ${t.key}${c.hit ? '·' : '✱'}  (trimmed ${Math.round(res.trimPct * 100)}% · edge-paper ${Math.round(res.edgePaper * 100)}%)`);
  } catch (e) { console.log(`\n  ✗ ${t.key}: ${e.message}`); report.push({ key: t.key, ok: false }); }
}
await browser.close();
console.log('');
const bad = report.filter((r) => !r.ok);
if (bad.length) console.log(`  ⚠️  ${bad.length} tile(s) still show a paper edge: ${bad.map((b) => b.key).join(', ')} — re-run with --force to regenerate.`);
else console.log(`  ✅ all ${report.length} tiles fill edge-to-edge (no paper border).`);

// merge into the sprites manifest + sprites.js (so one <script> include covers hero+enemies+tiles)
const sprDir = path.join(gameDir, 'src/assets/sprites');
fs.mkdirSync(sprDir, { recursive: true });
const mPath = path.join(sprDir, 'manifest.json');
const full = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : {};
full.tiles = tileMap;
fs.writeFileSync(mPath, JSON.stringify(full, null, 2));
fs.writeFileSync(path.join(gameDir, 'src/game/sprites.js'), '/* generated by tools/art-*.mjs — real character + tile atlas (Studio loads it, falls back to procedural). */\nwindow.SPRITES = ' + JSON.stringify(full, null, 2) + ';\n');
console.log(`\n✅ ${Object.keys(tileMap).length} tiles → ${outDir} + merged into sprites.js`);

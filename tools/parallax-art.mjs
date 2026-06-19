// tools/parallax-art.mjs — multi-layer PARALLAX backdrops for a game (issue: layered parallax).
//
// Per world, generates depth-separated layers with Gemini and writes them to
// <game>/src/assets/backdrops/layers/<slug>-L<i>.png + a layers.json manifest the game reads:
//   L0  far  — an OPAQUE dreamy sky (gradient + sun + faint clouds)
//   L1  mid  — DISTANT mountains / rainbow arcs on flat chroma green  → keyed transparent
//   L2  near — foreground rolling hills on flat chroma green          → keyed transparent
// Studio.Parallax scrolls them at increasing rates for depth. Transparent layers are
// chroma-keyed (green #00d800 → alpha) in headless Chromium, same as the sprite pipeline.
//
//   node tools/parallax-art.mjs <gameDir> [--world <name|index>] [--force]
// Needs GEMINI_SA_JSON + playwright. Idempotent (skips existing unless --force).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('usage: node tools/parallax-art.mjs <gameDir> [--world N] [--force]'); process.exit(2); }
if (!geminiConfigured()) { console.error('no GEMINI creds'); process.exit(1); }
const FORCE = process.argv.includes('--force');
const wsel = process.argv.includes('--world') ? process.argv[process.argv.indexOf('--world') + 1] : null;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const levelsSrc = fs.readFileSync(path.join(dir, 'src/game/levels.js'), 'utf8');
const g = {}; new Function('window', levelsSrc)(g);
const worlds = (g.LEVELS || []).map((l, i) => ({ name: l.name || `World ${i + 1}`, i, sky: l.sky }));
const pick = wsel == null ? worlds : worlds.filter((w, i) => w.name === wsel || String(w.i) === String(wsel) || String(i + 1) === String(wsel));

const outDir = path.join(dir, 'src/assets/backdrops/layers');
fs.mkdirSync(outDir, { recursive: true });
const GREEN = 'Everything ELSE in the image — the entire sky and all empty space above and around — is ONE FLAT SOLID CHROMA GREEN (#00d800), no gradient, no texture. NO text, NO words, NO watermark.';

// Coherence directive — every layer is generated WITH the previous layers (and the world's
// established backdrop) as reference images, and told to match them, so the stack composes into
// ONE holistic scene instead of three clashing images.
const COHERE = 'CRITICAL — the reference image(s) are the OTHER layers of THIS SAME scene: match their exact COLOR PALETTE, the LIGHTING and light/sun DIRECTION, the time of day, and the painterly art STYLE precisely, so this layer composes seamlessly INTO ONE coherent picture stacked with them. Same world, same moment, same light.';

// layer recipes (far → near). opaque:true skips chroma-key.
const LAYERS = (world) => [
  { tag: 'sky', opaque: true,
    prompt: `A wide panoramic dreamy SKY for a bright whimsical platformer world called "${world}". Soft pastel gradient, a big soft glowing sun and a few faint distant clouds high up. NO ground, NO hills, NO mountains, NO characters, NO text. Painterly, gentle, fills the whole frame, seamlessly tileable left-to-right. ${COHERE}` },
  { tag: 'mountains',
    prompt: `A wide panoramic row of DISTANT soft pastel MOUNTAINS and big translucent RAINBOW ARCS for a whimsical world called "${world}", sitting only along the BOTTOM HALF of the image, hazy and far away — they must sit naturally UNDER the sky in the reference. ${COHERE} ${GREEN} Seamlessly tileable left-to-right.` },
  { tag: 'hills',
    prompt: `A wide panoramic row of rolling FOREGROUND CANDY HILLS and bright grass for a whimsical world called "${world}", filling only the BOTTOM THIRD of the image, saturated and close-up with chunky soft shapes that sit in front of the mountains and sky in the reference. ${COHERE} ${GREEN} Seamlessly tileable left-to-right.` },
];

async function chromaKey(browser, srcPng, dstPng) {
  const page = await browser.newPage();
  const b64 = fs.readFileSync(srcPng).toString('base64');
  const out = await page.evaluate(async (data) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // green screen: green clearly dominant → transparent; soft edge → partial alpha + despill
      if (g > 90 && g > r * 1.25 && g > b * 1.25) { d[i + 3] = 0; }
      else if (g > r && g > b) { const spill = Math.min(g - Math.max(r, b), 60); d[i + 1] = g - spill; d[i + 3] = Math.max(0, d[i + 3] - spill * 2); }
    }
    x.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  }, b64);
  fs.writeFileSync(dstPng, Buffer.from(out.split(',')[1], 'base64'));
  await page.close();
}

// the world's established backdrop (if any) anchors the whole stack to one palette.
function backdropRef(wslug) {
  const p = path.join(dir, 'src/assets/backdrops', wslug + '.jpg');
  return fs.existsSync(p) ? { mimeType: 'image/jpeg', base64: fs.readFileSync(p).toString('base64') } : null;
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const manifestPath = path.join(outDir, 'layers.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
for (const w of pick) {
  const wslug = slug(w.name), recipes = LAYERS(w.name), files = [];
  console.log(`\n${w.name}:`);
  // reference chain: the world backdrop first (palette anchor), then each layer we generate, so
  // every later layer is built to MATCH what's already there → a holistic, in-sync composite.
  const refs = []; const anchor = backdropRef(wslug); if (anchor) refs.push(anchor);
  for (let li = 0; li < recipes.length; li++) {
    const rec = recipes[li], file = `${wslug}-L${li}.png`, dst = path.join(outDir, file);
    if (fs.existsSync(dst) && !FORCE) {
      files.push({ file, scroll: [0.08, 0.25, 0.5][li] });
      refs.push({ mimeType: 'image/png', base64: fs.readFileSync(dst).toString('base64') });   // keep the chain coherent
      if (refs.length > 3) refs.splice(1, 1);
      console.log(`  – L${li} ${rec.tag} (exists)`); continue;
    }
    try {
      const { base64 } = await generateImage(rec.prompt, { aspectRatio: '16:9', refs: refs.slice() });
      const raw = path.join(outDir, `_raw-${file}`); fs.writeFileSync(raw, Buffer.from(base64, 'base64'));
      if (rec.opaque) fs.renameSync(raw, dst);
      else { await chromaKey(browser, raw, dst); fs.unlinkSync(raw); }
      files.push({ file, scroll: [0.08, 0.25, 0.5][li] });
      // feed THIS layer (the raw, opaque-on-green render — clearest for the model) into the chain
      refs.push({ mimeType: 'image/png', base64 });
      if (refs.length > 3) refs.splice(1, 1);     // cap refs: keep the backdrop anchor + the 2 most recent layers
      console.log(`  ✓ L${li} ${rec.tag} → ${file} (${Math.round(fs.statSync(dst).size / 1024)}KB)`);
    } catch (e) { console.error(`  ✗ L${li} ${rec.tag}: ${String(e.message || e).slice(0, 140)}`); }
  }
  manifest[wslug] = files;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`\nlayers.json → ${path.relative(dir, manifestPath)}`);

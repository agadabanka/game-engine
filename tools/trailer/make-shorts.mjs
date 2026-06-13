// ── ENGINE SHORTS builder ────────────────────────────────────────────────────
// Record short gameplay clips off each game's LIVE deployment (the deterministic
// window.__rec API), reframe them to vertical YouTube Shorts (1080x1920): a
// blurred backdrop, the sharp gameplay centered, a bold title banner + Play CTA,
// over a shared upbeat bed. Works across BOTH engine eras:
//   • studio family  — window.__game.autopilot(true) at load (?level=1..)
//   • platformer family — press Space to spawn window.__game (?level=101..)
//
//   node tools/trailer/make-shorts.mjs <gameId> [level,level,...]
//   node tools/trailer/make-shorts.mjs all          (every game, default levels)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FF = (await import('ffmpeg-static')).default;
const ff = (args) => execFileSync(FF, ['-y', ...args], { stdio: 'pipe' });
const BED = path.join(HERE, 'shorts-bed.mp3');
const GAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub/games.json'), 'utf8'));
const OUT = path.join(ROOT, 'out/shorts');
const WORK = path.join(OUT, '_work');
fs.mkdirSync(WORK, { recursive: true });

const W = 1080, H = 1920, GW = 1080, GH = Math.round(1080 * 540 / 960); // 1080x608
const FPS = 30, SHORT = 30;

// studio-era games boot ?level=1..; platformer-era use the 100+ showcase convention
const PLATFORMER = new Set(['the-platformer', 'jazz', 'deepfin', 'starsweeper']);
const ACCENT = { 'the-platformer': '#7CFC00', jazz: '#7cc6ff', deepfin: '#ff8fc8', 'ember-depths': '#ff7b3a',
  'nimbus-climb': '#bfe3ff', starlance: '#b388eb', roadwar: '#ffb703', starsweeper: '#ffd166',
  'roadwar-iso': '#ffd166', grovekeep: '#9bd67a', 'biome-bash': '#9ecbff' };

function worldLabel(g, level) {
  const w = (g.meta && Array.isArray(g.meta.worlds)) ? g.meta.worlds : [];
  if (w[level - 1]) return w[level - 1].toUpperCase();
  // else derive a nice name from the video keys (…-level-N-<name>)
  const vids = (g.meta && g.meta.videos) || {};
  for (const k of Object.keys(vids)) {
    const m = new RegExp(`level-?${level}(?:-(.+))?$`, 'i').exec(k);
    if (m) return (m[1] ? m[1].replace(/-/g, ' ') : `Level ${level}`).toUpperCase();
  }
  return `Level ${level}`.toUpperCase();
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

// ── record a ~SHORT-second 16:9 clip off the live deploy ──
async function recordClip(g, level, out) {
  const base = g.url.replace(/\/$/, '');
  const isPlat = PLATFORMER.has(g.id);
  const lv = isPlat ? 100 + level : level;
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await page.goto(`${base}/?r=canvas&level=${lv}&inputs=0&mute=1`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => window.__rec, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { try { window.__rec.begin(); } catch (e) {} });
  // spawn __game (platformer family needs a Space press to start)
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(() => !!window.__game)) break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true })));
    await page.evaluate(() => { try { window.__rec.step(1); } catch (e) {} });
  }
  await page.evaluate(() => { try { window.__game.reset && window.__game.reset(); } catch (e) {} try { window.__game.autopilot(true); } catch (e) {} try { window.__game.showcase && window.__game.showcase(true); } catch (e) {} try { window.__game.collect && window.__game.collect(true); } catch (e) {} });
  for (let i = 0; i < 160; i++) await page.evaluate(() => { try { window.__rec.step(1); } catch (e) {} }); // skip intro
  const fdir = path.join(WORK, 'frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  const total = FPS * SHORT; let n = 0;
  for (let i = 0; i < total; i++) {
    const durl = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? c.toDataURL('image/jpeg', 0.9) : null; });
    if (durl) fs.writeFileSync(path.join(fdir, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(durl.split(',')[1], 'base64'));
    await page.evaluate(() => { try { window.__rec.step(2); } catch (e) {} }); // 2 sim steps per captured frame → livelier 30fps
  }
  await page.close();
  ff(['-framerate', String(FPS), '-i', path.join(fdir, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
  return n;
}

// ── render the title + CTA overlay PNG (transparent) ──
const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const FONT = `'Arial Black','Helvetica Neue',Arial,sans-serif`;
async function overlayPNG(file, name, label, tint, url) {
  const html = `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;font-family:${FONT};overflow:hidden">
    <div style="position:absolute;top:70px;left:0;right:0;text-align:center;padding:0 40px">
      <div style="display:inline-block;background:linear-gradient(180deg,rgba(8,11,20,.86),rgba(8,11,20,.64));border:3px solid ${tint};border-radius:26px;padding:22px 40px;box-shadow:0 10px 40px rgba(0,0,0,.6)">
        <div style="font-size:68px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.02;text-shadow:0 4px 18px rgba(0,0,0,.8)">${name}</div>
        <div style="margin-top:12px;font-size:30px;font-weight:800;color:${tint};letter-spacing:4px">${label}</div>
      </div>
    </div>
    <div style="position:absolute;bottom:120px;left:0;right:0;text-align:center;padding:0 40px">
      <div style="display:inline-block;background:${tint};color:#0a0f1c;font-size:52px;font-weight:900;letter-spacing:2px;padding:20px 54px;border-radius:50px;box-shadow:0 10px 36px rgba(0,0,0,.55)">▶ PLAY FREE</div>
      <div style="margin-top:20px;font-size:30px;font-weight:800;color:#fff;letter-spacing:1px;text-shadow:0 3px 14px rgba(0,0,0,.9)">${url.replace(/^https?:\/\//, '')}</div>
      <div style="margin-top:10px;font-size:25px;font-weight:800;color:#ffd166;letter-spacing:3px">#Shorts · #IndieGame</div>
    </div>
  </body></html>`;
  await pg.setContent(html); await pg.waitForTimeout(60);
  await pg.screenshot({ path: file, omitBackground: true });
}

// ── compose vertical short: blurred bg + sharp gameplay + overlay + music ──
function compose(clip, overlay, out) {
  const fc = [
    `[0:v]split=2[bg][fg]`,
    `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:2,eq=brightness=-0.18:saturation=1.1[bgb]`,
    `[fg]scale=${GW}:${GH}[fgs]`,
    `[bgb][fgs]overlay=0:(H-${GH})/2[base]`,
    `[base][1:v]overlay=0:0,format=yuv420p[v]`,
  ].join(';');
  ff(['-i', clip, '-i', overlay, '-stream_loop', '-1', '-i', BED,
    '-filter_complex', fc,
    '-map', '[v]', '-map', '2:a',
    '-t', String(SHORT), '-af', `volume=0.8,afade=t=in:st=0:d=0.6,afade=t=out:st=${SHORT - 1.2}:d=1.2`,
    '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '150k', '-movflags', '+faststart', out]);
}

async function makeShort(g, level) {
  const gdir = path.join(OUT, g.id); fs.mkdirSync(gdir, { recursive: true });
  const clip = path.join(WORK, `${g.id}-L${level}-raw.mp4`);
  const ov = path.join(WORK, `${g.id}-L${level}-ov.png`);
  const out = path.join(gdir, `${g.id}-L${level}.mp4`);
  process.stdout.write(`  ● ${g.id} L${level} … rec`);
  const n = await recordClip(g, level, clip);
  process.stdout.write(`(${n}f) compose`);
  await overlayPNG(ov, g.name, worldLabel(g, level), ACCENT[g.id] || '#ffd166', g.url);
  compose(clip, ov, out);
  fs.rmSync(clip, { force: true });
  console.log(` → ${path.basename(out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
  return out;
}

const arg = process.argv[2];
const levelsArg = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const targets = arg === 'all' ? GAMES.filter(g => g.url && g.id !== 'biome-bash') : GAMES.filter(g => g.id === arg);
if (!targets.length) { console.error('no matching game; pass a game id or "all"'); process.exit(1); }

for (const g of targets) {
  const lc = (g.meta && g.meta.levelCount) || 5;
  const levels = levelsArg || [1, Math.ceil(lc / 2), lc].filter((v, i, a) => a.indexOf(v) === i);
  console.log(`\n${g.name} (${g.id}) — levels ${levels.join(',')}`);
  for (const lv of levels) { try { await makeShort(g, lv); } catch (e) { console.log(`  ✗ ${g.id} L${lv}: ${String(e).split('\n')[0].slice(0, 80)}`); } }
}
await browser.close();
console.log('\n✅ shorts complete →', OUT);

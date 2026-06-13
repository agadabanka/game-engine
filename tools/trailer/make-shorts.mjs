// ── ENGINE SHORTS builder (v2) ───────────────────────────────────────────────
// Record DISTINCT-level gameplay clips off each game's LIVE deploy, reframe to
// vertical 1080x1920 with each game's OWN music muxed in. Fixes vs v1:
//   • no window.__game.reset() → ?level=N is honoured (distinct levels)
//   • per-game real music (fetched from the deploy), per-level where it exists
//   • per-game mode: levels (?level), windows (slice one chained run), single
//   node tools/trailer/make-shorts.mjs <gameId|all> [level,level]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FF = (await import('ffmpeg-static')).default;
const ff = (args) => execFileSync(FF, ['-y', ...args], { stdio: 'pipe' });
const BED = path.join(HERE, 'shorts-bed.mp3');          // only fallback (procedural-music games)
const GAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub/games.json'), 'utf8'));
const OUT = path.join(ROOT, 'out/shorts');
const WORK = path.join(OUT, '_work');
fs.mkdirSync(WORK, { recursive: true });

const W = 1080, H = 1920, GW = 1080, GH = Math.round(1080 * 540 / 960);
const FPS = 30, SHORT = 30;
const PLATFORMER = new Set(['the-platformer', 'jazz', 'deepfin', 'starsweeper']);
const ACCENT = { 'the-platformer': '#7CFC00', jazz: '#7cc6ff', deepfin: '#ff8fc8', 'ember-depths': '#ff7b3a',
  'nimbus-climb': '#bfe3ff', starlance: '#b388eb', roadwar: '#ffb703', starsweeper: '#ffd166',
  'roadwar-iso': '#ffd166', grovekeep: '#9bd67a' };

// per-game plan: which levels, and the music track for a given level (relative path on the deploy)
const PLAN = {
  'the-platformer': { mode: 'levels', levels: [1, 4, 7], music: () => null },
  jazz:            { mode: 'levels', levels: [1, 5, 9], music: () => 'assets/music/title.mp3' },
  deepfin:         { mode: 'levels', levels: [1, 3, 5], music: () => 'assets/music/title.mp3' },
  starsweeper:     { mode: 'levels', levels: [1, 3, 5], music: () => 'assets/music/title.mp3' },
  // studio RTS/builder/shooter games don't switch levels via ?level on their
  // live build → one distinct short each (no repeats) until they're redeployed
  // with the engine ?level contract. Ember chains depths, so it keeps 3 (windows).
  'nimbus-climb':  { mode: 'single', music: () => 'assets/music/level-1.mp3' },
  roadwar:         { mode: 'single', music: () => 'assets/music/ground-1.mp3' },
  'roadwar-iso':   { mode: 'single', music: () => 'assets/music/ground-1.mp3' },
  grovekeep:       { mode: 'single', music: () => 'assets/music/glade-1.mp3' },
  'ember-depths':  { mode: 'windows', windows: [180, 1080, 1980], labels: ['Molten Shallows', 'Ember Vents', 'The Core'], music: () => 'assets/music/cave.mp3' },
  starlance:       { mode: 'single', music: () => 'assets/music/drive.mp3' },
};

function label(g, lv) {
  const w = (g.meta && Array.isArray(g.meta.worlds)) ? g.meta.worlds : [];
  if (w[lv - 1]) return w[lv - 1].toUpperCase();
  const vids = (g.meta && g.meta.videos) || {};
  for (const k of Object.keys(vids)) { const m = new RegExp(`level-?${lv}(?:-(.+))?$`, 'i').exec(k); if (m && m[1]) return m[1].replace(/-/g, ' ').toUpperCase(); }
  return `LEVEL ${lv}`;
}

// fetch a music track off the deploy → local file (cached). returns path or null.
async function music(base, rel) {
  if (!rel) return null;
  const key = (base + '/' + rel).replace(/[^a-z0-9]/gi, '_') + '.mp3';
  const dst = path.join(WORK, key);
  if (fs.existsSync(dst)) return dst;
  try {
    const r = await fetch(base + '/' + rel, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
    return dst;
  } catch (e) { return null; }
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

// record `frames` capture-frames starting after `skip` sim steps. NO reset().
async function record(base, lv, skip, frames, out) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await page.goto(`${base}/?r=canvas&level=${lv}&inputs=0&mute=1`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => window.__rec, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { try { window.__rec.begin(); } catch (e) {} });
  for (let i = 0; i < 200; i++) { if (await page.evaluate(() => !!window.__game)) break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true })));
    await page.evaluate(() => { try { window.__rec.step(1); } catch (e) {} }); }
  // autopilot ONLY — never reset (reset restarts at level 1 and ignores ?level)
  await page.evaluate(() => { try { window.__game.autopilot(true); } catch (e) {} try { window.__game.showcase && window.__game.showcase(true); } catch (e) {} try { window.__game.collect && window.__game.collect(true); } catch (e) {} });
  for (let i = 0; i < skip; i++) await page.evaluate(() => { try { window.__rec.step(1); } catch (e) {} });
  const fdir = path.join(WORK, 'frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  let n = 0;
  for (let i = 0; i < frames; i++) {
    const durl = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? c.toDataURL('image/jpeg', 0.9) : null; });
    if (durl) fs.writeFileSync(path.join(fdir, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(durl.split(',')[1], 'base64'));
    await page.evaluate(() => { try { window.__rec.step(2); } catch (e) {} });
  }
  await page.close();
  ff(['-framerate', String(FPS), '-i', path.join(fdir, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
  return n;
}

const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const FONT = `'Arial Black','Helvetica Neue',Arial,sans-serif`;
async function overlayPNG(file, name, lab, tint, url) {
  await pg.setContent(`<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;font-family:${FONT};overflow:hidden">
    <div style="position:absolute;top:70px;left:0;right:0;text-align:center;padding:0 40px">
      <div style="display:inline-block;background:linear-gradient(180deg,rgba(8,11,20,.86),rgba(8,11,20,.64));border:3px solid ${tint};border-radius:26px;padding:22px 40px;box-shadow:0 10px 40px rgba(0,0,0,.6)">
        <div style="font-size:66px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.02;text-shadow:0 4px 18px rgba(0,0,0,.8)">${name}</div>
        <div style="margin-top:12px;font-size:29px;font-weight:800;color:${tint};letter-spacing:4px">${lab}</div>
      </div></div>
    <div style="position:absolute;bottom:120px;left:0;right:0;text-align:center;padding:0 40px">
      <div style="display:inline-block;background:${tint};color:#0a0f1c;font-size:50px;font-weight:900;letter-spacing:2px;padding:20px 54px;border-radius:50px;box-shadow:0 10px 36px rgba(0,0,0,.55)">▶ PLAY FREE</div>
      <div style="margin-top:20px;font-size:29px;font-weight:800;color:#fff;letter-spacing:1px;text-shadow:0 3px 14px rgba(0,0,0,.9)">${url.replace(/^https?:\/\//, '')}</div>
      <div style="margin-top:10px;font-size:24px;font-weight:800;color:#ffd166;letter-spacing:3px">#Shorts · #IndieGame</div>
    </div></body></html>`);
  await pg.waitForTimeout(60); await pg.screenshot({ path: file, omitBackground: true });
}

function compose(clip, overlay, track, out) {
  const fc = [`[0:v]split=2[bg][fg]`,
    `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:2,eq=brightness=-0.18:saturation=1.1[bgb]`,
    `[fg]scale=${GW}:${GH}[fgs]`, `[bgb][fgs]overlay=0:(H-${GH})/2[base]`, `[base][1:v]overlay=0:0,format=yuv420p[v]`].join(';');
  ff(['-i', clip, '-i', overlay, '-stream_loop', '-1', '-i', track || BED,
    '-filter_complex', fc, '-map', '[v]', '-map', '2:a', '-t', String(SHORT),
    '-af', `volume=0.85,afade=t=in:st=0:d=0.6,afade=t=out:st=${SHORT - 1.2}:d=1.2`,
    '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '150k', '-movflags', '+faststart', out]);
}

const arg = process.argv[2];
const targets = arg === 'all' ? GAMES.filter(g => g.url && PLAN[g.id]) : GAMES.filter(g => g.id === arg);
for (const g of targets) {
  const base = g.url.replace(/\/$/, '');
  const plan = PLAN[g.id]; if (!plan) { console.log(`no plan for ${g.id}`); continue; }
  const gdir = path.join(OUT, g.id); fs.rmSync(gdir, { recursive: true, force: true }); fs.mkdirSync(gdir, { recursive: true });
  console.log(`\n${g.name} (${g.id}) — ${plan.mode}`);
  const jobs = plan.mode === 'levels' ? plan.levels.map(l => ({ lv: PLATFORMER.has(g.id) ? 100 + l : l, n: l, skip: 160, lab: label(g, l), track: plan.music(l) }))
    : plan.mode === 'windows' ? plan.windows.map((w, i) => ({ lv: PLATFORMER.has(g.id) ? 101 : 1, n: i + 1, skip: w, lab: (plan.labels[i] || `Run ${i + 1}`).toUpperCase(), track: plan.music(i + 1) }))
    : [{ lv: PLATFORMER.has(g.id) ? 101 : 1, n: 1, skip: 160, lab: label(g, 1), track: plan.music(1) }];
  for (const j of jobs) {
    const clip = path.join(WORK, `${g.id}-${j.n}-raw.mp4`), ov = path.join(WORK, `${g.id}-${j.n}-ov.png`);
    const out = path.join(gdir, `${g.id}-${j.n}.mp4`);
    process.stdout.write(`  ● ${g.id} #${j.n} (${j.lab})… rec`);
    const n = await record(base, j.lv, j.skip, FPS * SHORT, clip);
    const track = await music(base, j.track);
    process.stdout.write(`(${n}f, music:${track ? 'real' : 'bed'}) compose`);
    await overlayPNG(ov, g.name, j.lab, ACCENT[g.id] || '#ffd166', g.url);
    compose(clip, ov, track, out);
    fs.rmSync(clip, { force: true });
    console.log(` → ${path.basename(out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
  }
}
await browser.close();
console.log('\n✅ shorts complete →', OUT);

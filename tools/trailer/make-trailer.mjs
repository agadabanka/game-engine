// ── ENGINE TRAILER builder ───────────────────────────────────────────────────
// Build a polished montage trailer across ANY set of games on the engine, from one
// JSON spec. Records short gameplay clips straight off each game's LIVE deployment
// (the same deterministic `window.__rec` API the recorder uses), renders title
// cards + lower-third captions as PNGs (this ffmpeg has no drawtext, so text is
// rendered in headless Chromium — nicer typography anyway), then xfade-chains
// everything with a multi-track music bed and global fades.
//
//   node tools/trailer/make-trailer.mjs [spec.json]      (default: tools/trailer/montage.json)
//
// Needs devDeps playwright + ffmpeg-static (npm i). Records against URLs in the
// spec (or fall back to hub/games.json), so no game repo needs to be cloned.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SPEC = JSON.parse(fs.readFileSync(process.argv[2] || path.join(HERE, 'montage.json'), 'utf8'));
const FF = (await import('ffmpeg-static')).default;
const ff = (args) => execFileSync(FF, ['-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

const WORK = path.resolve(ROOT, SPEC.workdir || 'trailer-build');
const [W, H] = (SPEC.size || '1280x720').split('x').map(Number);
const FPS = SPEC.fps || 60;
const XF = SPEC.xfade ?? 0.45;
const ACC = SPEC.accent || '#5cf0c8';
const BG = SPEC.bg || '#080b14';
const FONT = `-apple-system,'Arial Black','Helvetica Neue',Arial,sans-serif`;
for (const d of ['clips', 'txt', 'seg', 'music']) fs.mkdirSync(path.join(WORK, d), { recursive: true });

// resolve a game's base URL: explicit on the segment, else by id from spec.games / hub/games.json
function gamesMap() {
  const m = { ...(SPEC.games || {}) };
  try { for (const g of JSON.parse(fs.readFileSync(path.join(ROOT, 'hub/games.json'), 'utf8'))) if (g.url && !m[g.id]) m[g.id] = g.url; } catch {}
  return m;
}
const GAMES = gamesMap();
const baseFor = (s) => s.base || GAMES[s.game] || (() => { throw new Error(`no URL for game "${s.game}" (set spec.games or hub/games.json)`); })();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

// ── 1) record each gameplay clip off the live deployment ──
async function recordClip(s, out) {
  const base = baseFor(s);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await page.goto(`${base}/?r=canvas&inputs=0&level=${s.level}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => window.__PLATFORMER && window.__rec, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => window.__rec.begin());
  const step = () => page.evaluate(() => window.__rec.step());
  for (let i = 0; i < 200; i++) { if (await page.evaluate(() => !!window.__game)) break; await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true }))); await step(); }
  await page.evaluate(() => { window.__game.autopilot(true); try { window.__game.showcase(true); } catch {} try { window.__game.collect(true); } catch {} });
  for (let i = 0; i < (s.skip ?? 150); i++) await step();
  const fdir = path.join(WORK, 'clips', '_frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  const total = Math.ceil(FPS * (s.record || s.dur + 1));
  let n = 0;
  for (let i = 0; i < total; i++) {
    const durl = await page.evaluate(() => { const c = window.__PLATFORMER.canvas; return c ? c.toDataURL('image/jpeg', 0.92) : null; });
    if (durl) fs.writeFileSync(path.join(fdir, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(durl.split(',')[1], 'base64'));
    await step();
  }
  await page.close();
  ff(['-framerate', String(FPS), '-i', path.join(fdir, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out]);
  console.log(`  recorded ${s.game} L${s.level} → ${path.basename(out)} (${n} frames)`);
}

// ── 2) render text PNGs (opaque cards + transparent lower-third captions) ──
const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const html = (inner) => `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;font-family:${FONT};overflow:hidden">${inner}</body></html>`;
const cardHTML = (title, sub, big) => `
  <div style="position:absolute;inset:0;background:${BG}"></div>
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${W * 0.86}px;height:${W * 0.86}px;border-radius:50%;background:radial-gradient(circle, ${ACC}22, transparent 58%)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div style="font-size:${big || 96}px;font-weight:900;color:#fff;letter-spacing:3px;line-height:1.05;text-shadow:0 6px 40px rgba(0,0,0,0.7)">${title}</div>
    <div style="margin-top:26px;height:5px;width:140px;background:${ACC};border-radius:3px"></div>
    <div style="margin-top:24px;font-size:34px;color:#cfe9ff;letter-spacing:6px;text-transform:uppercase">${sub || ''}</div>
  </div>`;
const capHTML = (name, feat) => `
  <div style="position:absolute;left:0;right:0;bottom:0;height:280px;background:linear-gradient(to top, rgba(6,9,18,0.82), transparent)"></div>
  <div style="position:absolute;left:64px;bottom:74px">
    <div style="font-size:66px;font-weight:900;color:#fff;letter-spacing:1px;text-shadow:0 4px 22px rgba(0,0,0,0.95)">${name}</div>
    <div style="margin-top:12px;height:5px;width:120px;background:${ACC};border-radius:3px"></div>
    <div style="margin-top:16px;font-size:32px;font-weight:700;color:#eaf6ff;letter-spacing:1px;text-shadow:0 2px 14px rgba(0,0,0,1)">${feat || ''}</div>
  </div>`;
async function renderPNG(file, inner, transparent) {
  await pg.setContent(html(inner)); await pg.waitForTimeout(60);
  await pg.screenshot({ path: file, omitBackground: !!transparent });
}

// ── build all assets for the timeline ──
const segFiles = [];
for (let i = 0; i < SPEC.timeline.length; i++) {
  const s = SPEC.timeline[i];
  const tag = String(i).padStart(2, '0');
  if (s.type === 'card') {
    const png = path.join(WORK, 'txt', `card${tag}.png`);
    await renderPNG(png, cardHTML(s.title, s.sub, s.big), false);
    s._png = png;
  } else {
    const clip = path.join(WORK, 'clips', `clip${tag}.mp4`);
    if (!(SPEC.reuseClips && fs.existsSync(clip))) await recordClip(s, clip); else console.log(`  reuse ${path.basename(clip)}`);
    s._clip = clip;
    if (s.name) { const cap = path.join(WORK, 'txt', `cap${tag}.png`); await renderPNG(cap, capHTML(s.name, s.feat), true); s._cap = cap; }
  }
}
await browser.close();

// ── 3) normalize each segment to W×H@FPS ──
SPEC.timeline.forEach((s, i) => {
  const out = path.join(WORK, 'seg', `s${String(i).padStart(2, '0')}.mp4`); const D = s.dur;
  if (s.type === 'card') {
    ff(['-loop', '1', '-t', String(D), '-i', s._png,
      '-filter_complex', `[0:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${(D - 0.4).toFixed(2)}:d=0.4[v]`,
      '-map', '[v]', '-t', String(D), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
  } else {
    const st = s.start || 0;
    const base = `[0:v]trim=${st}:${(st + D).toFixed(2)},setpts=PTS-STARTPTS,scale=${W}:${H},fps=${FPS},setsar=1`;
    if (s._cap) {
      ff(['-i', s._clip, '-loop', '1', '-t', String(D), '-i', s._cap,
        '-filter_complex', `${base}[g];[1:v]format=rgba,fade=t=in:st=0.3:d=0.4:alpha=1,fade=t=out:st=${(D - 0.7).toFixed(2)}:d=0.4:alpha=1[c];[g][c]overlay=0:0,format=yuv420p[v]`,
        '-map', '[v]', '-t', String(D), '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
    } else {
      ff(['-i', s._clip, '-filter_complex', `${base},format=yuv420p[v]`, '-map', '[v]', '-t', String(D), '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
    }
  }
  s._seg = out;
});

// ── 4) xfade-chain into the silent video ──
const inputs = []; SPEC.timeline.forEach((s) => inputs.push('-i', s._seg));
let fc = '', prev = '[0:v]', acc = SPEC.timeline[0].dur;
for (let k = 1; k < SPEC.timeline.length; k++) {
  const lbl = k === SPEC.timeline.length - 1 ? '[vout]' : `[x${k}]`;
  fc += `${prev}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${(acc - XF).toFixed(3)}${lbl};`;
  prev = lbl; acc += SPEC.timeline[k].dur - XF;
}
const TOTAL = acc; fc = fc.replace(/;$/, '');
ff([...inputs, '-filter_complex', fc, '-map', '[vout]', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(WORK, '_video.mp4')]);
console.log(`video ≈ ${TOTAL.toFixed(1)}s`);

// ── 5) music bed: fetch tracks (url or local), trim/crossfade to length, fade ──
async function resolveTrack(src, idx) {
  const dst = path.join(WORK, 'music', `m${idx}.mp3`);
  if (/^https?:/.test(src)) { const b = Buffer.from(await (await fetch(src)).arrayBuffer()); fs.writeFileSync(dst, b); }
  else fs.copyFileSync(path.resolve(ROOT, src), dst);
  return dst;
}
const tracks = []; for (let i = 0; i < (SPEC.music || []).length; i++) tracks.push(await resolveTrack(SPEC.music[i], i));
if (tracks.length) {
  // even split of TOTAL across tracks, with crossfades
  const per = TOTAL / tracks.length + 1.5;
  const ins = []; tracks.forEach((t) => ins.push('-i', t));
  let af = '', p = '';
  tracks.forEach((_, i) => { af += `[${i}:a]atrim=0:${per.toFixed(2)}${i === 0 ? ',afade=t=in:st=0:d=1.2' : ''}[t${i}];`; });
  p = '[t0]';
  for (let i = 1; i < tracks.length; i++) { af += `${p}[t${i}]acrossfade=d=0.9[a${i}];`; p = `[a${i}]`; }
  af += `${p}atrim=0:${TOTAL.toFixed(2)},afade=t=out:st=${(TOTAL - 1.6).toFixed(2)}:d=1.6,volume=${SPEC.musicVol ?? 0.9}[aout]`;
  ff([...ins, '-filter_complex', af, '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', path.join(WORK, '_music.m4a')]);
}

// ── 6) mux + global fade from/to black ──
const OUT = path.resolve(ROOT, SPEC.out || 'trailer-build/engine_trailer.mp4');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const vfade = `[0:v]fade=t=in:st=0:d=0.6,fade=t=out:st=${(TOTAL - 0.8).toFixed(2)}:d=0.8[v]`;
if (tracks.length) ff(['-i', path.join(WORK, '_video.mp4'), '-i', path.join(WORK, '_music.m4a'), '-filter_complex', vfade, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', OUT]);
else ff(['-i', path.join(WORK, '_video.mp4'), '-filter_complex', vfade, '-map', '[v]', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);

console.log(`\n✅ TRAILER → ${OUT}  (${TOTAL.toFixed(1)}s, ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
console.log(`   upload:  YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/trailer/yt-upload.mjs "${OUT}" "<title>" "<desc>" unlisted`);

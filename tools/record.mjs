// tools/record.mjs — ENGINE recorder: render each level's deterministic autopilot run to a
// landscape MP4 with the level's OWN music muxed in, then build a montage. Serves the game's
// src/ locally (fast + reliable) and captures canvas frames via the __rec stepper (byte-identical
// to the eval). Output → <gameDir>/out/videos/level-N.mp4 + montage.mp4.
//
//   node tools/record.mjs <gameDir> [--fps 30] [--max 1600]
//
// Pairs with tools/trailer/yt-upload.mjs to publish. Needs ffmpeg-static (bundled).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/record.mjs <gameDir> [--fps N] [--max N]'); process.exit(2); }
const FPS = process.argv.includes('--fps') ? +process.argv[process.argv.indexOf('--fps') + 1] : 30;
const MAXF = process.argv.includes('--max') ? +process.argv[process.argv.indexOf('--max') + 1] : 1600;
const ff = (args) => execFileSync(ffmpegPath, ['-y', ...args], { stdio: 'pipe' });

const SRC = path.join(gameDir, 'src');
const OUT = path.join(gameDir, 'out/videos');
const WORK = path.join(OUT, '_work');
fs.mkdirSync(WORK, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
const worlds = meta.worlds || [];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(SRC, u);
  if (!f.startsWith(SRC) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

// record one level's full autopilot run (until won, capped at MAXF sim frames)
async function record(level, rawOut) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await page.goto(`${BASE}/?r=canvas&level=${level}&inputs=0&mute=1`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
  await page.evaluate(() => { window.__game.reset(); window.__game.autopilot(true); window.__rec.begin(); });
  const fdir = path.join(WORK, `frames-${level}`); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  let n = 0, done = false;
  for (let i = 0; i < MAXF && !done; i++) {
    // capture every other sim frame → ~30fps video from a 60fps sim
    const durl = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? c.toDataURL('image/jpeg', 0.92) : null; });
    if (durl) fs.writeFileSync(path.join(fdir, `f${String(n++).padStart(5, '0')}.jpg`), Buffer.from(durl.split(',')[1], 'base64'));
    done = await page.evaluate(() => { try { window.__rec.step(2); } catch (e) {} const s = window.__game.snapshot(); return !!s.won; });
  }
  // hold a final beat on the win frame
  for (let h = 0; h < FPS && n > 0; h++) { const last = fs.readFileSync(path.join(fdir, `f${String(n - 1).padStart(5, '0')}.jpg`)); fs.writeFileSync(path.join(fdir, `f${String(n++).padStart(5, '0')}.jpg`), last); }
  await page.close();
  ff(['-framerate', String(FPS), '-i', path.join(fdir, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', rawOut]);
  fs.rmSync(fdir, { recursive: true, force: true });
  return n;
}

// mux a music track under a silent clip (loop to fit, gentle fades) → final mp4
function mux(raw, track, out) {
  if (track && fs.existsSync(track)) {
    ff(['-i', raw, '-stream_loop', '-1', '-i', track, '-map', '0:v', '-map', '1:a', '-shortest',
      '-af', 'volume=0.6,afade=t=in:st=0:d=0.5,afade=t=out:st=999:d=1.0',
      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  } else {
    ff(['-i', raw, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  }
}

const made = [];
for (let L = 1; L <= worlds.length; L++) {
  const world = worlds[L - 1], s = slug(world);
  const raw = path.join(WORK, `raw-${L}.mp4`), out = path.join(OUT, `level-${L}-${s}.mp4`);
  process.stdout.write(`● L${L} ${world}… rec`);
  const n = await record(L, raw);
  const track = path.join(SRC, 'assets/music', s + '.mp3');
  process.stdout.write(`(${n}f) mux`);
  mux(raw, track, out);
  fs.rmSync(raw, { force: true });
  made.push({ level: L, world, file: out });
  console.log(` → ${path.basename(out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
}

// montage: ~6s highlight from each level, concatenated, over the title theme
if (made.length) {
  const segs = [];
  for (const m of made) {
    const seg = path.join(WORK, `seg-${m.level}.mp4`);
    ff(['-ss', '2', '-t', '6', '-i', m.file, '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', seg]);
    segs.push(seg);
  }
  const list = path.join(WORK, 'concat.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
  const silent = path.join(WORK, 'montage-silent.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', silent]);
  const title = path.join(SRC, 'assets/music/title.mp3');
  mux(silent, fs.existsSync(title) ? title : null, path.join(OUT, 'montage.mp4'));
  console.log(`● montage → montage.mp4 (${(fs.statSync(path.join(OUT, 'montage.mp4')).size / 1048576).toFixed(1)} MB)`);
}

fs.rmSync(WORK, { recursive: true, force: true });
await browser.close(); server.close();
console.log(`\n✅ ${made.length} level videos + montage → ${OUT}`);

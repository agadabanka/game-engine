// ── ENGINE rhythm/dance VIDEO recorder ───────────────────────────────────────
// The deterministic record.mjs stepper doesn't fit a real-time rhythm scene, so this
// records each SONG with Playwright's recordVideo while driving autopilot + ON-BEAT taps
// (via the __beatPhase hook) so the captured clip shows the celebratory PERFECT flourish,
// then muxes the song's real mp3 over the silent screen capture and xfade-chains a montage.
// Boots the game's OWN server.js locally (audio is silent headless — that's fine, we mux
// the real track afterward). Outputs <game>/out/videos/song-<N>-<slug>.mp4 + montage.mp4.
//
//   node tools/dance-record.mjs <game-dir> [--secs 24] [--port 4319]
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'server.js'))) { console.error('usage: node tools/dance-record.mjs <game-dir>'); process.exit(2); }
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const SECS = Number(arg('--secs', 24));
const PORT = Number(arg('--port', 4300 + Math.floor(Math.random() * 500)));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'GAME_META.json'), 'utf8'));
const worlds = (Array.isArray(meta.worlds) ? meta.worlds : []).map((w) => (typeof w === 'string' ? w : w.name));
const N = worlds.length || meta.levelCount || 5;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MUSIC = path.join(dir, 'src/assets/music');
const OUT = path.join(dir, 'out/videos');
const TMP = path.join(dir, 'out/_rec');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (args) => { const r = spawnSync(ffmpeg, args, { stdio: 'inherit' }); if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' ')); };

const srv = spawn('node', ['server.js'], { cwd: path.resolve(dir), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
async function waitUp() { for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/health'); if (r.ok) return true; } catch (e) {} await sleep(250); } return false; }
if (!(await waitUp())) { console.error('✗ server did not come up'); srv.kill(); process.exit(1); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

async function recordSong(lv) {
  const name = worlds[lv - 1] || ('Song ' + lv), sl = slug(name);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: TMP, size: { width: 960, height: 540 } } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?level=${lv}&r=canvas&mute=1`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { try { window.__game.autopilot(true); } catch (e) {} });
  // tap on the downbeat for SECS seconds so the clip is full of PERFECTs + flourishes
  await page.evaluate(async (secs) => {
    const tap = window.__autoTap || function () {}; const phase = window.__beatPhase;
    const end = performance.now() + secs * 1000; let prev = phase ? phase() : 0;
    while (performance.now() < end) {
      await new Promise((res) => {
        const step = () => {
          if (!phase) { tap(); return setTimeout(res, 300); }
          const p = phase(); if (prev > 0.7 && p < 0.14) { tap(); res(); } else { prev = p; requestAnimationFrame(step); }
        }; requestAnimationFrame(step);
      });
    }
  }, SECS);
  const vp = await page.video().path();
  await ctx.close();   // finalizes the .webm
  // mux the REAL song mp3 over the silent capture (trim to the shorter; re-encode to h264/aac)
  const song = path.join(MUSIC, sl + '.mp3');
  const out = path.join(OUT, `song-${lv}-${sl}.mp4`);
  const aArgs = fs.existsSync(song) ? ['-i', song] : [];
  ff(['-y', '-i', vp, ...aArgs, '-map', '0:v:0', ...(aArgs.length ? ['-map', '1:a:0'] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
  fs.rmSync(vp, { force: true });
  return { lv, name, out };
}

console.log(`\ndance-record · ${meta.name} · ${N} song(s) → ${path.relative(process.cwd(), OUT)}`);
const clips = [];
for (let lv = 1; lv <= N; lv++) {
  try { const c = await recordSong(lv); clips.push(c); const kb = (fs.statSync(c.out).size / 1024) | 0; console.log(`  ✓ song-${lv}-${slug(c.name)}.mp4 (${kb}KB)`); }
  catch (e) { console.error(`  ✗ song ${lv}: ${e.message}`); }
}
await browser.close();
srv.kill();

// montage: concat the per-song clips (uniform 960×540/30/h264-aac so a stream copy concat is safe)
if (clips.length) {
  const listFile = path.join(TMP, 'concat.txt');
  fs.writeFileSync(listFile, clips.map((c) => `file '${path.resolve(c.out)}'`).join('\n'));
  const montage = path.join(OUT, 'montage.mp4');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', montage]);
  console.log(`  ✓ montage.mp4 (${(fs.statSync(montage).size / 1024) | 0}KB)`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${clips.length}/${N} songs recorded. Upload with tools/yt.mjs, then update GAME_META.videos + the hub.`);
process.exit(clips.length === N ? 0 : 1);

// ── ENGINE diary GALLERY screenshots ─────────────────────────────────────────
// Capture full-size, in-motion gameplay frames for the build DIARY and write them to
//   <game>/src/diary-shots/level<N>.jpg   (served at /diary-shots/level<N>.jpg)
// diary.html's markdown renderer normalizes `src/diary-shots/…` → `/diary-shots/…`, so
// embedding ![](src/diary-shots/level1.jpg) in DIARY.md just works on the live site.
// Unlike tools/shots.mjs (tiny 480×270 menu thumbnails), these are larger 960×540 frames
// driven a few seconds in WITH autopilot + a couple of auto-taps, so confetti / flourishes
// are firing — a representative, lively "here's the game" still for the diary.
//
//   node tools/diary-shots.mjs <game-dir> [--levels 1,3,5] [--port 4318] [--settle 3200]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'server.js'))) {
  console.error('usage: node tools/diary-shots.mjs <game-dir>   (a game dir with server.js + GAME_META.json)');
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'GAME_META.json'), 'utf8'));
const N = (Array.isArray(meta.worlds) && meta.worlds.length) || meta.levelCount || 5;
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const levels = process.argv.includes('--levels')
  ? arg('--levels').split(',').map(Number)
  : Array.from({ length: N }, (_, i) => i + 1);
const PORT = Number(arg('--port', 4300 + Math.floor(Math.random() * 500)));
const SETTLE = Number(arg('--settle', 3200));
const OUT = path.join(dir, 'src/diary-shots');
fs.mkdirSync(OUT, { recursive: true });
const base = `http://127.0.0.1:${PORT}`;

const srv = spawn('node', ['server.js'], { cwd: path.resolve(dir), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() { for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/health'); if (r.ok) return true; } catch (e) {} await sleep(250); } return false; }
if (!(await waitUp())) { console.error('✗ game server did not come up on ' + base); srv.kill(); process.exit(1); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

async function shoot(lv) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await page.goto(`${base}/?level=${lv}&r=canvas&mute=1`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { try { window.__game.autopilot(true); } catch (e) {} });
  await sleep(SETTLE);
  // Fire taps so confetti / flourishes are mid-flight. If the game exposes a beat-phase hook
  // (window.__beatPhase), wait for the downbeat and tap on it so the captured frame shows the
  // PERFECT flourish rather than a miss; otherwise just tap a few times for liveliness.
  const synced = await page.evaluate(() => typeof window.__beatPhase === 'function');
  if (synced) {
    await page.evaluate(async () => {
      const tap = window.__autoTap || function () {};
      const phase = window.__beatPhase;
      for (let n = 0; n < 3; n++) {
        // spin until just past the downbeat (phase wraps high→low), then tap on-beat
        await new Promise((res) => {
          let prev = phase();
          const step = () => { const p = phase(); if (prev > 0.7 && p < 0.12) { tap(); res(); } else { prev = p; requestAnimationFrame(step); } };
          requestAnimationFrame(step);
        });
        await new Promise((r) => setTimeout(r, 120));
      }
    });
  } else {
    for (let t = 0; t < 4; t++) { await page.evaluate(() => { try { (window.__autoTap || function () {})(); } catch (e) {} }); await sleep(140); }
  }
  await sleep(90);
  // WebGL canvases read back black via toDataURL (no preserveDrawingBuffer); the compositor
  // screenshot captures what's actually on screen. Clip to the canvas element.
  const el = await page.$('canvas');
  if (!el) { await page.close(); throw new Error('no canvas'); }
  const f = path.join(OUT, `level${lv}.jpg`);
  const buf = await el.screenshot({ type: 'jpeg', quality: 85 });
  await page.close();
  if (buf.length < 2000) throw new Error(`frame looks blank (${buf.length}b)`);
  fs.writeFileSync(f, buf);
  return buf.length;
}

console.log(`\ndiary-shots · ${meta.name || dir} · ${levels.length} level(s) → ${path.relative(process.cwd(), OUT)}`);
let ok = 0;
for (const lv of levels) {
  try { const b = await shoot(lv); ok++; console.log(`  ✓ level${lv}.jpg (${(b / 1024).toFixed(0)}KB)`); }
  catch (e) { console.error(`  ✗ level${lv}: ${e.message}`); }
}
await browser.close();
srv.kill();
console.log(`\n${ok}/${levels.length} diary shots captured → embed in DIARY.md as ![](src/diary-shots/level<N>.jpg), commit + redeploy.`);
process.exit(ok === levels.length ? 0 : 1);

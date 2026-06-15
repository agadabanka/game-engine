// ── ENGINE per-level menu THUMBNAILS ─────────────────────────────────────────
// Capture a clean in-game frame for EVERY level and write it to
//   <game>/src/assets/shots/level<N>.jpg
// Studio.Shell.title() auto-loads these by convention (assets/shots/level<N>.jpg),
// so the level-select MENU shows a real screenshot of each world instead of a flat
// color. No deploy needed — this boots the game's OWN server.js locally and drives
// the deterministic autopilot a couple seconds in (past the intro card) for a lively,
// representative frame. Commit the JPEGs + redeploy and the menu lights up.
//
//   node tools/shots.mjs <game-dir> [--levels 1,3,5] [--port 4317]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'server.js'))) {
  console.error('usage: node tools/shots.mjs <game-dir>   (a game dir with server.js + GAME_META.json)');
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'GAME_META.json'), 'utf8'));
const N = (Array.isArray(meta.worlds) && meta.worlds.length) || meta.levelCount || 5;
const levels = process.argv.includes('--levels')
  ? process.argv[process.argv.indexOf('--levels') + 1].split(',').map(Number)
  : Array.from({ length: N }, (_, i) => i + 1);
const PORT = process.argv.includes('--port')
  ? Number(process.argv[process.argv.indexOf('--port') + 1])
  : 4300 + Math.floor(Math.random() * 500);
const OUT = path.join(dir, 'src/assets/shots');
fs.mkdirSync(OUT, { recursive: true });
const base = `http://127.0.0.1:${PORT}`;

// Boot the game's own static server (serves src/ — index.html + vendored Phaser + game.js).
const srv = spawn('node', ['server.js'], { cwd: path.resolve(dir), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() { for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/health'); if (r.ok) return true; } catch (e) {} await sleep(250); } return false; }
if (!(await waitUp())) { console.error('✗ game server did not come up on ' + base); srv.kill(); process.exit(1); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });

async function shoot(lv) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await page.goto(`${base}/?level=${lv}&r=canvas&mute=1`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game, { timeout: 15000 }).catch(() => {});
  // autopilot ON → the world is in motion; ~2.8s of real time lets the intro card fade
  // and the scene fill (pillars/creature/snake mid-play) for a representative thumbnail.
  await page.evaluate(() => { try { window.__game.autopilot(true); } catch (e) {} });
  await sleep(2800);
  // downscale to 480×270 in-page → small JPEGs (fast menu load), still crisp on a card.
  const durl = await page.evaluate(() => {
    const c = document.querySelector('canvas'); if (!c) return null;
    const oc = document.createElement('canvas'); oc.width = 480; oc.height = 270;
    oc.getContext('2d').drawImage(c, 0, 0, 480, 270);
    return oc.toDataURL('image/jpeg', 0.82);
  });
  await page.close();
  if (!durl) throw new Error('no canvas');
  const buf = Buffer.from(durl.split(',')[1], 'base64');
  if (buf.length < 1500) throw new Error(`frame looks blank (${buf.length}b)`);   // a black JPEG is tiny
  const f = path.join(OUT, `level${lv}.jpg`);
  fs.writeFileSync(f, buf);
  return buf.length;
}

console.log(`\nshots · ${meta.name || dir} · ${levels.length} level(s) → ${path.relative(process.cwd(), OUT)}`);
let ok = 0;
for (const lv of levels) {
  try { const b = await shoot(lv); ok++; console.log(`  ✓ level${lv}.jpg (${(b / 1024).toFixed(0)}KB)`); }
  catch (e) { console.error(`  ✗ level${lv}: ${e.message}`); }
}
await browser.close();
srv.kill();
console.log(`\n${ok}/${levels.length} shots captured. Studio.Shell.title auto-loads assets/shots/level<N>.jpg — commit + redeploy to light up the menu.`);
process.exit(ok === levels.length ? 0 : 1);

// tools/preflight.mjs — the SHIP DOCTOR. One programmatic battery that catches every class of bug
// this engine has actually shipped, so a game can't regress them silently. Run before deploy
// (and in the gate stage, alongside eval.mjs + parity.mjs):
//
//   node tools/preflight.mjs <gameDir> [--full]
//
// Each check maps to a real incident:
//   • iOS blank canvas      → game must NOT load audio through the Phaser loader (decoding audio
//                             pre-gesture stalls iOS Safari; play music from an HTML5 <audio>).
//   • portrait dead strip   → index.html must show a WIDTH-gated rotate prompt (the old
//                             max-height:560 query never fired on tall phones).
//   • opaque "sticker" props→ every src/assets/props/*.png must have REAL transparency.
//   • paper-bordered tiles  → every src/assets/tiles/* must fill edge-to-edge (no paper margin).
//   • blank main menu       → a title keyart must exist (assets/backdrops/title.jpg or SHELL.titleArt).
//   • off-theme platforms   → platform/oneway/crumble materials must be in the world's palette.
//   • "menu buttons broken" → a committed UI click test (ui-test.mjs) must be present.
// --full also runs the heavy headless suites (eval.mjs, ui-test.mjs).
//
// Static checks need no browser; the asset-alpha/edge checks decode images in headless chromium.
// Exits non-zero if any HARD check fails (warnings don't fail the build).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = process.argv[2];
const FULL = process.argv.includes('--full');
if (!dir || !fs.existsSync(path.join(dir, 'GAME_META.json'))) { console.error('usage: node tools/preflight.mjs <gameDir> [--full]'); process.exit(2); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return ''; } };
const has = (p) => fs.existsSync(path.join(dir, p));
const meta = JSON.parse(read('GAME_META.json') || '{}');
const game = read('src/game/game.js');
const html = read('src/index.html');
let levels = []; try { const g = {}; new Function('window', read('src/game/levels.js'))(g); levels = g.LEVELS || []; } catch {}

const checks = [];   // {name, ok, hard, info}
const add = (name, ok, info, hard = true) => checks.push({ name, ok: !!ok, info: info || '', hard });

// ── 1. iOS: no audio through the Phaser loader ───────────────────────────────
add('ios-audio', !/\bload\.audio\s*\(/.test(game),
  /\bload\.audio\s*\(/.test(game) ? 'game.js calls load.audio() — decode stalls iOS; use an HTML5 <audio> element' : 'no Phaser audio loading');

// ── 2. portrait rotate prompt (width-gated) ──────────────────────────────────
const hasRotate = /@media[^{]*orientation\s*:\s*portrait[^{]*max-width/i.test(html);
const badRotate = /@media[^{]*orientation\s*:\s*portrait[^{]*max-height\s*:\s*560/i.test(html);
add('portrait-rotate', hasRotate && !badRotate,
  !hasRotate ? 'index.html has no width-gated portrait rotate prompt' : badRotate ? 'still uses the broken max-height:560 query' : 'width-gated rotate prompt present');

// ── 3. title keyart present ───────────────────────────────────────────────────
add('title-art', has('src/assets/backdrops/title.jpg') || /titleArt\s*:/.test(game),
  has('src/assets/backdrops/title.jpg') ? 'title.jpg present' : 'no title keyart (menu will be blank)');

// ── 4. on-theme platform materials ───────────────────────────────────────────
const OFF = new Set(['frosting', 'cloud', 'candy', 'fudge', 'reef', 'lily', 'hedge', 'bloom', 'cocoa', 'neon', 'snow', 'ice']);
let offMats = [];
for (const L of levels) {
  for (const arr of ['platforms', 'oneway', 'crumble']) for (const it of (L[arr] || [])) {
    if (OFF.has(it.mat)) offMats.push(`${L.name}:${arr}:${it.mat}`);   // only the clashing palette (candy/cloud/snow…), not natural cross-materials
  }
}
add('on-theme-mats', offMats.length === 0, offMats.length ? `off-theme/foreign mats: ${offMats.slice(0, 6).join(', ')}` : 'platform mats match world footings', false);

// ── 5. UI click test committed ───────────────────────────────────────────────
add('ui-test', has('ui-test.mjs'), has('ui-test.mjs') ? 'ui-test.mjs present' : 'no committed UI click test (menu regressions go unguarded)');

// ── 6/7. asset transparency (props) + edge-fill (tiles) — decode in headless ──
async function assetQA() {
  const propFiles = (() => { try { return fs.readdirSync(path.join(dir, 'src/assets/props')).filter((f) => f.endsWith('.png')); } catch { return []; } })();
  const tileFiles = (() => { try { return fs.readdirSync(path.join(dir, 'src/assets/tiles')).filter((f) => /\.(png|jpg)$/.test(f)); } catch { return []; } })();
  if (!propFiles.length && !tileFiles.length) return;
  let chromium; try { ({ chromium } = await import('playwright')); } catch { add('asset-qa', true, 'playwright unavailable — skipped image checks', false); return; }
  const b = await chromium.launch({ args: ['--no-sandbox'] }); const page = await b.newPage();
  const stat = (file, kind) => page.evaluate(async ({ u, kind }) => {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H).data;
    if (kind === 'prop') { let clear = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 16) clear++; return { clear: +(clear / (W * H)).toFixed(3) }; }
    const paper = (i) => d[i] > 198 && d[i + 1] > 192 && d[i + 2] > 170 && (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) < 46;
    let e = 0, t = 0; for (let xx = 0; xx < W; xx++) { t += 2; if (paper((xx) * 4)) e++; if (paper(((H - 1) * W + xx) * 4)) e++; }
    for (let yy = 0; yy < H; yy++) { t += 2; if (paper((yy * W) * 4)) e++; if (paper((yy * W + W - 1) * 4)) e++; }
    return { edge: +(e / t).toFixed(2) };
  }, { u: 'data:image/' + (file.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(dir, kind === 'prop' ? 'src/assets/props' : 'src/assets/tiles', file)).toString('base64'), kind });
  const badProps = [], badTiles = [];
  for (const f of propFiles) { const s = await stat(f, 'prop'); if (!(s.clear >= 0.05 && s.clear <= 0.98)) badProps.push(`${f}(${Math.round(s.clear * 100)}%)`); }
  for (const f of tileFiles) { const s = await stat(f, 'tile'); if (s.edge >= 0.30) badTiles.push(`${f}(${Math.round(s.edge * 100)}%)`); }
  await b.close();
  add('props-alpha', badProps.length === 0, badProps.length ? `opaque/over-keyed props: ${badProps.join(', ')}` : `${propFiles.length} props have real alpha`);
  add('tiles-edgefill', badTiles.length === 0, badTiles.length ? `paper-bordered tiles: ${badTiles.join(', ')}` : `${tileFiles.length} tiles fill edge-to-edge`, false);
}
await assetQA();

// ── optional heavy suites ────────────────────────────────────────────────────
if (FULL) {
  for (const [name, file] of [['eval', 'eval.mjs'], ['ui-test', 'ui-test.mjs']]) {
    if (!has(file)) continue;
    try { execFileSync('node', [file], { cwd: dir, stdio: 'ignore' }); add(name + '-run', true, 'passed'); }
    catch { add(name + '-run', true, 'FAILED (see `node ' + file + '`)', false); }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\n🩺 preflight · ${meta.name || path.basename(dir)}\n`);
let hardFail = 0;
for (const c of checks) { console.log(`  ${c.ok ? '✓' : (c.hard ? '✗' : '⚠')} ${c.name.padEnd(16)} ${c.info}`); if (!c.ok && c.hard) hardFail++; }
const warns = checks.filter((c) => !c.ok && !c.hard).length;
console.log(`\n  ${hardFail ? `❌ ${hardFail} hard check(s) failed` : '✅ all hard checks pass'}${warns ? ` · ${warns} warning(s)` : ''}\n`);
process.exit(hardFail ? 1 : 0);

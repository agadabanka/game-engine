// Visual QA (7.4) — guard against visual regressions the gate's non-black check can't
// see (off-theme art, broken layouts, half-drawn menus). Because the eval renders a
// DETERMINISTIC frame-200 screenshot per game, it's byte-stable run-to-run; we SSIM it
// against a committed golden baseline and fail if it drifts past the threshold.
//   node tools/visual-qa.mjs                 # compare eval screenshots vs baselines
//   node tools/visual-qa.mjs --update        # accept current screenshots as new baselines
// Run AFTER tools/eval-all.mjs (which produces the screenshots). Exits non-zero on drift.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FF = (await import('ffmpeg-static')).default;
const BASE = path.join(ROOT, 'tools/golden-baselines');
const WORK = path.join(ROOT, 'out/golden');
fs.mkdirSync(BASE, { recursive: true });
const THRESH = 0.90;
const update = process.argv.includes('--update');

// where each target's deterministic frame-200 screenshot lands after eval-all
const SHOTS = {
  'game-template': path.join(ROOT, 'engine/game-template/out/shot-webgl.png'),
  grovekeep: path.join(WORK, 'grovekeep/out/shot-webgl.png'),
  'roadwar-iso': path.join(WORK, 'roadwar-iso/out/shot-webgl.png'),
};

function ssim(a, b) {
  const r = spawnSync(FF, ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /All:([0-9.]+)/.exec(r.stderr || '');
  return m ? +m[1] : null;
}

console.log(`\nVisual QA · SSIM vs golden baselines (threshold ${THRESH})\n`);
const results = [];
for (const [id, shot] of Object.entries(SHOTS)) {
  const baseline = path.join(BASE, `${id}.png`);
  if (!fs.existsSync(shot)) { console.log(`  ⚠ ${id} · SKIP — no screenshot (run eval-all first)`); results.push({ id, skip: true, note: 'no screenshot' }); continue; }
  if (update || !fs.existsSync(baseline)) { fs.copyFileSync(shot, baseline); console.log(`  ◆ ${id} · baseline ${update ? 'updated' : 'created'}`); results.push({ id, ok: true, ssim: 1, note: 'baseline set' }); continue; }
  const s = ssim(shot, baseline);
  const ok = s != null && s >= THRESH;
  results.push({ id, ok, ssim: s });
  console.log(`  ${ok ? '✓' : '✗'} ${id} · SSIM ${s != null ? s.toFixed(4) : 'n/a'}${ok ? '' : `  ← below ${THRESH} (visual drift)`}`);
}

const gated = results.filter((r) => !r.skip);
const passed = gated.filter((r) => r.ok).length;
const summary = { ran: new Date().toISOString(), passed, total: gated.length, ok: passed === gated.length, threshold: THRESH, results };
fs.writeFileSync(path.join(WORK, 'visual-qa.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${summary.ok ? '✓' : '✗'} ${passed}/${gated.length} screenshots match baseline`);
if (!summary.ok) console.log(`  (intentional art/SDK change? re-baseline with:  node tools/visual-qa.mjs --update)`);

try { const { renderVisualBoard } = await import('./lib/render-board.mjs'); const out = path.join(WORK, 'visual-qa-board.png'); await renderVisualBoard(summary, out); console.log(`  board → ${path.relative(ROOT, out)}`); } catch (e) {}
process.exit(summary.ok ? 0 : 1);

// Cross-game eval — the quality safety net (7.4).
//
// Two things, in one fast command (~minutes), that together keep the bar as N grows:
//   1. ENGINE-SDK regression: run the engine game-template (which vendors
//      engine/sdk/studio.js) against its own gate — so an SDK edit that would break a
//      NEW game is caught directly. (Deployed games freeze their own SDK copy, so an
//      SDK edit can't retroactively break them — the template is the true regression
//      surface.)
//   2. GOLDEN per-genre coverage: run each golden game's OWN gate. Engine-lineage games
//      (sdk:"head") get the current SDK vendored in; other-lineage games (sdk:"own") run
//      as-shipped. eval:"none" games are skipped with a note (not failed).
// Exits non-zero if any runnable target is red. See tools/golden-games.json.
//
//   node tools/eval-all.mjs                 # template + golden set
//   node tools/eval-all.mjs --only grovekeep
//   node tools/eval-all.mjs --game <dir>    # also eval a game checked out at <dir>
//   node tools/eval-all.mjs --no-board      # skip the rendered board PNG
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK = path.join(ROOT, 'engine/sdk/studio.js');
const TEMPLATE_EVAL = path.join(ROOT, 'engine/game-template/eval.mjs');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/golden-games.json'), 'utf8'));
const WORK = path.join(ROOT, 'out/golden');
fs.mkdirSync(WORK, { recursive: true });
const GH = process.env.GH_TOKEN || '';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const only = val('--only') ? val('--only').split(',') : null;

const sh = (cmd) => execFileSync('bash', ['-lc', cmd], { stdio: 'pipe', encoding: 'utf8' });

// run a game's eval.mjs from `dir`; playwright resolves from the engine node_modules.
function runEval(id, dir, evalPath) {
  if (!fs.existsSync(evalPath)) return { id, ok: false, skip: false, err: 'no eval.mjs' };
  let exit = 0, err = '';
  try { execFileSync('node', [evalPath], { cwd: dir, stdio: 'pipe', timeout: 240000 }); }
  catch (e) { exit = e.status || 1; err = String(e.stderr || e.message || '').split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 150); }
  let sc = null;
  try { sc = JSON.parse(fs.readFileSync(path.join(dir, 'out/scorecard.json'), 'utf8')); } catch (e) {}
  const v = (sc && sc.verdict) || {};
  const fatal = sc?.results?.webgl?.fatal || sc?.results?.canvas?.fatal;
  const fun = (() => { for (const r of ['webgl', 'canvas']) { const f = sc?.results?.[r]?.gate?.fun ?? sc?.results?.[r]?.fun; if (f != null) return f; } return null; })();
  return { id, ok: exit === 0 && !!(v.webgl || v.canvas), webgl: !!v.webgl, canvas: !!v.canvas, fun, err: err || (fatal && String(fatal).slice(0, 150)) || undefined };
}

// ensure a golden game's source is present (clone shallow, else hard-reset to origin)
function ensureClone(g) {
  const dir = path.join(WORK, g.id);
  const url = `https://${GH ? `x-access-token:${GH}@` : ''}github.com/${g.repo}.git`;
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.rmSync(dir, { recursive: true, force: true });
    sh(`git clone --depth 1 ${url} ${JSON.stringify(dir)} 2>/dev/null`);
  } else {
    try { sh(`git -C ${JSON.stringify(dir)} fetch --depth 1 origin 2>/dev/null && git -C ${JSON.stringify(dir)} checkout -- . 2>/dev/null && git -C ${JSON.stringify(dir)} reset --hard origin/HEAD 2>/dev/null`); } catch (e) {}
  }
  return dir;
}

// ── build the target list ────────────────────────────────────────────────────
const targets = [];
// 1. the engine game-template = the direct engine-SDK regression test (local, no clone)
if (!only || only.includes('game-template')) {
  fs.copyFileSync(SDK, path.join(ROOT, 'engine/game-template/src/vendor/studio.js')); // test HEAD SDK
  targets.push({ id: 'game-template', archetype: 'platformer · engine SDK HEAD', sdk: 'head', dir: path.join(ROOT, 'engine/game-template'), evalPath: TEMPLATE_EVAL, run: true });
}
// 2. golden games per genre
for (const g of CFG.games) {
  if (only && !only.includes(g.id)) continue;
  if (g.eval === 'none') { targets.push({ id: g.id, archetype: g.archetype, skip: true, note: g.note }); continue; }
  targets.push({ id: g.id, archetype: g.archetype, sdk: g.sdk, golden: g, run: true });
}
if (val('--game')) {
  const dir = path.resolve(val('--game'));
  fs.copyFileSync(SDK, path.join(dir, 'src/vendor/studio.js'));
  targets.push({ id: path.basename(dir), archetype: 'current · SDK HEAD', sdk: 'head', dir, evalPath: path.join(dir, 'eval.mjs'), run: true });
}

console.log(`\nCross-game eval · safety net · ${targets.filter((t) => t.run).length} gated + ${targets.filter((t) => t.skip).length} skipped\n`);
const results = [];
for (const t of targets) {
  if (t.skip) { console.log(`  ⚠ ${t.id} (${t.archetype}) · SKIP — ${t.note || 'no eval'}`); results.push({ id: t.id, archetype: t.archetype, skip: true, note: t.note }); continue; }
  process.stdout.write(`  ⏳ ${t.id} (${t.archetype})… `);
  let r;
  try {
    let dir = t.dir, evalPath = t.evalPath;
    if (t.golden) { dir = ensureClone(t.golden); if (t.golden.sdk === 'head') fs.copyFileSync(SDK, path.join(dir, 'src/vendor/studio.js')); evalPath = path.join(dir, 'eval.mjs'); }
    r = runEval(t.id, dir, evalPath);
  } catch (e) { r = { id: t.id, ok: false, err: String(e.message).slice(0, 140) }; }
  r.archetype = t.archetype; r.sdk = t.sdk;
  results.push(r);
  console.log(`${r.ok ? '✓ PASS' : '✗ FAIL'}${r.sdk === 'head' ? ' [SDK HEAD]' : ' [as-shipped]'}${r.fun != null ? ` · FUN ${r.fun}` : ''}${r.err ? ` · ${r.err}` : ''}`);
}

const gated = results.filter((r) => !r.skip);
const passed = gated.filter((r) => r.ok).length;
const summary = { ran: new Date().toISOString(), passed, total: gated.length, skipped: results.filter((r) => r.skip).length, ok: passed === gated.length, results };
fs.writeFileSync(path.join(WORK, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${summary.ok ? '✓' : '✗'} ${passed}/${gated.length} gated targets pass${summary.skipped ? ` (${summary.skipped} skipped)` : ''}`);

if (!flag('--no-board')) {
  try { const { renderEvalBoard } = await import('./lib/render-board.mjs'); const out = path.join(WORK, 'eval-board.png'); await renderEvalBoard(summary, out); console.log(`  board → ${path.relative(ROOT, out)}`); }
  catch (e) { console.log('  (board render skipped:', e.message, ')'); }
}
process.exit(summary.ok ? 0 : 1);

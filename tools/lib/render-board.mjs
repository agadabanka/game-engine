// Nice visual boards for showcasing the steps — rendered HTML → PNG in the engine's
// "mission-control" style (deep navy, cyan grid, gold/green/violet accents).
//   • renderBuildBoard(status, out)  — the make-game pipeline status (stage checkmarks)
//   • renderEvalBoard(summary, out)  — the cross-game golden-set eval result
//   • renderPipelineBoard(out)       — a static showcase of the 12-stage pipeline
// Used by the stage-runner (7.1) and eval-all (7.4); also handy for docs/showcase.
import path from 'node:path';
import { chromium } from 'playwright';

const PAL = { bg: '#070b16', card: '#0e1730', line: '#25406e', ink: '#eaf1ff', dim: '#9fb3e0',
  ok: '#9bd67a', fail: '#ff6b6b', run: '#ffd166', pend: '#42558a', skip: '#7fa0d6', cyan: '#7fd6ff' };
const GLYPH = { ok: '✓', fail: '✗', run: '⏳', skip: '–', pending: '○', wip: '⏳' };
const COLOR = { ok: PAL.ok, fail: PAL.fail, run: PAL.run, wip: PAL.run, skip: PAL.skip, pending: PAL.pend };
const STAGE_LABEL = { scaffold: 'Scaffold', identity: 'Identity', levels: 'Levels', gate: 'Gate (eval)', feel: 'Feel',
  art: 'Art', music: 'Music', deploy: 'Deploy', videos: 'Videos', shorts: 'Shorts', loop: 'Loop', book: 'Book' };
const ORDER = ['scaffold', 'identity', 'levels', 'gate', 'feel', 'art', 'music', 'deploy', 'videos', 'shorts', 'loop'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const HEAD = `<style>*{margin:0;box-sizing:border-box;font-family:'Segoe UI',Helvetica,Arial,sans-serif}
  body{background:${PAL.bg};color:${PAL.ink};padding:40px 46px}
  .t{font-size:30px;font-weight:800} .sub{color:${PAL.dim};font-size:15px;margin-top:5px}
  .bar{height:12px;border-radius:8px;background:#13203c;overflow:hidden;margin:18px 0 24px}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,${PAL.cyan},${PAL.ok})}
  .row{display:flex;align-items:center;gap:14px;background:${PAL.card};border:1.5px solid ${PAL.line};border-radius:12px;padding:13px 18px;margin-bottom:10px}
  .g{flex:0 0 34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#0a0f1c}
  .nm{font-size:17px;font-weight:700} .meta{color:${PAL.dim};font-size:13px;margin-top:1px}
  .pill{margin-left:auto;font-weight:800;font-size:13px;letter-spacing:1px;padding:5px 12px;border-radius:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .card{background:${PAL.card};border:1.5px solid ${PAL.line};border-radius:14px;padding:16px 18px}
  .card h3{font-size:19px;font-weight:800} .card .a{color:${PAL.cyan};font-size:13px;letter-spacing:2px;text-transform:uppercase}
  .chk{display:inline-block;margin-right:14px;color:${PAL.dim};font-size:13px}</style>`;

async function toPNG(html, width, outPath) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${HEAD}</head><body>${html}</body></html>`, { waitUntil: 'load' });
  await page.waitForTimeout(120);
  await (await page.$('body')).screenshot({ path: outPath });
  await browser.close();
  return outPath;
}

/** Build status board: stage checkmarks for a single game build. @param status {game,stages:{stage:status}} */
export async function renderBuildBoard(status, outPath) {
  const stages = status.stageOrder || ORDER;
  const m = status.stages || {};
  const done = stages.filter((s) => m[s] === 'ok' || m[s] === 'skip' || m[s] === 'done').length;
  const rows = stages.map((s, i) => {
    const st = m[s] === 'done' ? 'ok' : (m[s] || 'pending');
    const c = COLOR[st] || PAL.pend;
    return `<div class="row"><div class="g" style="background:${c}">${GLYPH[st] || GLYPH.pending}</div>
      <div><div class="nm">${i + 1}. ${esc(STAGE_LABEL[s] || s)}</div><div class="meta">${esc((status.detail && status.detail[s]) || '')}</div></div>
      <div class="pill" style="background:${c}22;color:${c}">${st.toUpperCase()}</div></div>`;
  }).join('');
  const html = `<div class="t">🎮 ${esc(status.game || 'game')} — build</div>
    <div class="sub">make-game pipeline · ${done}/${stages.length} stages complete</div>
    <div class="bar"><i style="width:${Math.round((done / stages.length) * 100)}%"></i></div>${rows}`;
  return toPNG(html, 720, outPath);
}

/** Cross-game eval board: the safety net (template + golden set). @param summary from eval-all */
export async function renderEvalBoard(summary, outPath) {
  const cards = (summary.results || []).map((r) => {
    const c = r.skip ? PAL.pend : r.ok ? PAL.ok : PAL.fail;
    const badge = r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
    const mode = r.skip ? '' : `<span class="chk" style="color:${PAL.dim}">${r.sdk === 'head' ? 'SDK HEAD' : 'as-shipped'}</span>`;
    const checks = r.skip ? '' : ['webgl', 'canvas'].map((k) => `<span class="chk">${r[k] ? '✓' : '✗'} ${k}</span>`).join('');
    return `<div class="card" style="border-color:${c}66">
      <div style="display:flex;align-items:center"><div><div class="a">${esc(r.archetype || '')}</div><h3>${esc(r.id)}</h3></div>
        <div class="pill" style="margin-left:auto;background:${c};color:#0a0f1c">${badge}</div></div>
      <div style="margin-top:10px">${mode}${checks}${r.fun != null ? `<span class="chk" style="color:${PAL.cyan}">FUN ${esc(r.fun)}</span>` : ''}</div>
      ${r.err ? `<div class="meta" style="margin-top:6px;color:${PAL.fail}">${esc(r.err)}</div>` : ''}
      ${r.skip && r.note ? `<div class="meta" style="margin-top:6px">${esc(r.note)}</div>` : ''}</div>`;
  }).join('');
  const c = summary.ok ? PAL.ok : PAL.fail;
  const html = `<div class="t">🛡 Cross-game eval — the safety net</div>
    <div class="sub">${esc((summary.ran || '').slice(0, 16).replace('T', ' '))} · game-template vs SDK HEAD (engine regression) + golden games per genre (as-shipped)</div>
    <div class="bar"><i style="width:${Math.round((summary.passed / Math.max(1, summary.total)) * 100)}%;background:${c}"></i></div>
    <div style="font-size:20px;font-weight:800;margin-bottom:16px;color:${c}">${summary.ok ? '✓' : '✗'} ${summary.passed}/${summary.total} gated targets pass${summary.skipped ? ` · ${summary.skipped} skipped` : ''}</div>
    <div class="grid">${cards}</div>`;
  return toPNG(html, 880, outPath);
}

/** Static showcase of the 12-stage pipeline (for docs / decks). */
export async function renderPipelineBoard(outPath) {
  const steps = [['1', 'Scaffold', 'clone base · GitHub · hub'], ['2', 'Identity', 'name · hero · worlds'], ['3', 'Levels', '5 themed biomes'],
    ['4', 'Gate', 'autopilot wins · FUN≥70 · deterministic'], ['5', 'Feel', 'anim · juice · SFX'], ['6', 'Art', 'Gemini backdrops'],
    ['7', 'Music', 'Lyria loops'], ['8', 'Deploy', 'Railway live'], ['9', 'Videos', 'record · YouTube'],
    ['10', 'Shorts', 'mobile feed · auto-wired'], ['11', 'Loop', 'register · push · links']];
  const rows = steps.map(([n, t, d]) => `<div class="row"><div class="g" style="background:${PAL.cyan}">${n}</div>
    <div><div class="nm">${t}</div><div class="meta">${d}</div></div></div>`).join('');
  const html = `<div class="t">🎮 make-game — concept in, shipped game out</div>
    <div class="sub">one line of intent → 11 stages, run for you</div><div class="bar"><i style="width:100%"></i></div>${rows}`;
  return toPNG(html, 720, outPath);
}

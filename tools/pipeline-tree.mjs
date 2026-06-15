// tools/pipeline-tree.mjs — render the make-game pipeline TREE as a polished PNG diagram
// (phases → stages → sub-steps), from the single source of truth tools/lib/pipeline.mjs.
// The diary embeds it; the make-game skill regenerates it. Optionally mark done stages.
//
//   node tools/pipeline-tree.mjs [out.png] [--done scaffold,identity] [--title "…"]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { tree, PIPELINE } from './lib/pipeline.mjs';

const out = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'book/img/pipeline-tree.png';
const doneArg = (process.argv.find((a) => a.startsWith('--done=')) || '').split('=')[1]
  || (process.argv.includes('--done') ? process.argv[process.argv.indexOf('--done') + 1] : '');
const done = new Set(doneArg ? doneArg.split(',').map((s) => s.trim()) : []);
const title = (process.argv.find((a) => a.startsWith('--title=')) || '').split('=')[1] || 'make-game · concept → shipped game';

const num = (s) => PIPELINE.indexOf(s) + 1;
const cols = tree().map((g) => `
  <div class="phase" style="--c:${g.color}">
    <div class="phead"><span class="dot"></span>${g.title}</div>
    ${g.stages.map((s) => `
      <div class="stage${done.has(s.key) ? ' done' : ''}">
        <div class="stitle"><span class="n">${num(s)}</span>${s.title}${done.has(s.key) ? '<span class="chk">✓</span>' : ''}</div>
        <ul>${s.sub.map((x) => `<li>${x}</li>`).join('')}</ul>
      </div>`).join('')}
  </div>`).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;font-family:"Helvetica Neue",Arial,sans-serif}
  body{background:linear-gradient(160deg,#0b1022,#131a33 60%,#0a0f1e);color:#eaf0ff;padding:34px 30px 30px;width:1280px}
  .h{font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#9fd6ff;font-weight:800}
  h1{font-size:30px;margin:3px 0 2px;color:#fff}
  .sub{color:#aab8e0;font-size:13px;margin-bottom:18px}
  .cols{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
  .phase{background:rgba(10,16,34,.5);border:1px solid rgba(255,255,255,.08);border-top:3px solid var(--c);border-radius:13px;padding:11px 11px 13px}
  .phead{font-size:13px;font-weight:800;color:var(--c);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:7px;margin-bottom:9px}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c)}
  .stage{background:rgba(18,26,48,.85);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 10px;margin:8px 0}
  .stage.done{border-color:rgba(6,214,160,.5);background:rgba(8,40,34,.6)}
  .stitle{font-size:13.5px;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;line-height:1.2}
  .n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:6px;background:var(--c);color:#0a0f1e;font-size:11.5px;font-weight:800;flex:none}
  .chk{margin-left:auto;color:#06d6a0;font-weight:800}
  ul{list-style:none;margin:6px 0 0;padding:0}
  li{font-size:11px;color:#cdd8f4;line-height:1.5;padding-left:13px;position:relative}
  li::before{content:"";position:absolute;left:2px;top:8px;width:5px;height:5px;border-radius:50%;background:var(--c);opacity:.7}
  .foot{margin-top:16px;color:#8da0cc;font-size:11.5px;text-align:center}
</style>
<div class="h">Game Engine · the pipeline</div><h1>${title}</h1>
<div class="sub">${PIPELINE.length} stages · ${PIPELINE.reduce((n, s) => n + s.sub.length, 0)} sub-steps · worked strictly in order · each stage is an auto-created GitHub issue</div>
<div class="cols">${cols}</div>
<div class="foot">Single source of truth: <code>tools/lib/pipeline.mjs</code> — drives the issues, this tree, and the diary.</div>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await pg.setContent(html, { waitUntil: 'networkidle' });
const el = await pg.$('body');
await el.screenshot({ path: out });
await b.close();
console.log(`pipeline tree → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB) · ${PIPELINE.length} stages`);

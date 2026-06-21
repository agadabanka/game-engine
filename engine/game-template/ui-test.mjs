/*
 * UI CLICK TEST (all menu cases) — engine template default.
 * Boots the real game on a local server and CLICKS every interactive menu element (mouse + touch),
 * asserting each does what it should:
 *   • each world card → starts THAT level (window.__startLevel + __ready)
 *   • the 📝 note button on the title → opens the note box
 *   • the diary/builder/design links resolve (HTTP 200)
 *   • in-game ⏸ pause → pauses
 * Level count is read from the running game, so this works for any game off the template.
 * Exits non-zero if any case fails.  Run:  node ui-test.mjs  (or: npm run uitest)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(SRC, u);
  if (!f.startsWith(SRC) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function mapper(box) {   // game(960x540) → screen coords, accounting for Scale.FIT letterboxing
  const ga = 960 / 540, ra = box.width / box.height; let gw, gh, ox, oy;
  if (ra > ga) { gh = box.height; gw = gh * ga; ox = box.x + (box.width - gw) / 2; oy = box.y; }
  else { gw = box.width; gh = gw / ga; ox = box.x; oy = box.y + (box.height - gh) / 2; }
  return (gx, gy) => ({ x: ox + gw * (gx / 960), y: oy + gh * (gy / 540) });
}
const boxOf = (p) => p.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
async function title(touch) {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, hasTouch: !!touch });
  const p = await ctx.newPage(); await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.game && window.game.scene.isActive('Title'), { timeout: 15000 });
  await p.waitForTimeout(400); return p;
}

const N = await (async () => { const p = await title(false); const n = await p.evaluate(() => (window.SHELL && window.SHELL.worlds || window.LEVELS || []).length || 1); await p.context().close(); return n; })();
const W = 960, H = 540, gap = 16, cw = Math.min(176, (W - 90) / N - 16), total = N * cw + (N - 1) * gap, x0 = (W - total) / 2 + cw / 2, cy = H - 156;
const results = [];
for (const touch of [false, true]) for (let i = 0; i < N; i++) {
  const p = await title(touch); const m = mapper(await boxOf(p)); const pt = m(x0 + i * (cw + gap), cy);
  if (touch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y);
  const ok = await p.waitForFunction(() => window.__ready === true, { timeout: 6000 }).then(() => true).catch(() => false);
  const lvl = await p.evaluate(() => window.__startLevel);
  results.push([`${touch ? 'touch' : 'mouse'} card ${i + 1} → level ${i + 1}`, ok && lvl === i + 1, 'startLevel=' + lvl]);
  await p.context().close();
}
{ const p = await title(false); const m = mapper(await boxOf(p)); const pt = m(W - 34, 30); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(500);
  const open = await p.evaluate(() => !!document.querySelector('textarea, [contenteditable], input[type=text]'));
  results.push(['note button opens box', open, '']); await p.context().close(); }
{ const p = await title(false); const links = await p.evaluate(() => (window.SHELL && window.SHELL.links) || {});
  for (const [k, href] of Object.entries(links)) { const r = await fetch(BASE + href).then((x) => x.status).catch(() => 0); results.push([`link ${k} (${href})`, r === 200, 'http ' + r]); }
  await p.context().close(); }
{ const ctx = await b.newContext({ viewport: { width: 960, height: 540 } }); const p = await ctx.newPage();
  await p.goto(BASE + '/?level=1', { waitUntil: 'load' }); await p.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  const m = mapper(await boxOf(p)); const pt = m(W - 30, 30); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(400);
  results.push(['in-game ⏸ pause', await p.evaluate(() => !!window.__paused), '']); await ctx.close(); }

await b.close(); server.close();
let fail = 0; for (const [name, ok, info] of results) { console.log(`${ok ? '✓' : '✗'} ${name}${info ? '  [' + info + ']' : ''}`); if (!ok) fail++; }
console.log(`\n${results.length - fail}/${results.length} UI cases passed`);
process.exit(fail ? 1 : 0);

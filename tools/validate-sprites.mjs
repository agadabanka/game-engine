// tools/validate-sprites.mjs — VALIDATE a game's generated sprite atlas so the sprite-SHEET
// pipeline is correct + repeatable EVERY time. Pure image analysis (no WebGL), runs in headless
// Chromium, exits non-zero on any failure — so `tools/art-sprites.mjs` enforces it after every
// generation and the gate can re-check it.
//
//   node tools/validate-sprites.mjs <gameDir>
//
// Per actor (hero + every enemy) it checks the four things that broke before and how we proved
// each fix this session:
//   1. MANIFEST   — every anim's frame indices are inside the packed atlas grid.
//   2. NON-BLANK  — every referenced frame has real content (opaque pixels ≥ 2%); catches a
//                   black-box / failed-key frame.
//   3. MOTION     — in a locomotion CYCLE (run/walk) each ADJACENT frame pair differs (≥3%): the
//                   body/legs actually move frame-to-frame (not a stuck single pose).
//   4. ALTERNATION— the two CONTACT frames (cycle[0] vs cycle[mid]) differ a LOT (≥10%): the legs
//                   SCISSOR left↔right instead of repeating the SAME stride. A same-stride cycle
//                   reads as a HOP — the exact bug we fixed by generating the cycle as ONE sheet.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const THRESH = { nonBlank: 0.02, motion: 0.03, alternation: 0.10 };

/** Run all checks for one game dir using an open Playwright page. Returns { ok, actors:[…] }. */
export async function validateGame(gameDir, page) {
  const spritesJs = fs.readFileSync(path.join(gameDir, 'src/game/sprites.js'), 'utf8');
  const SPRITES = JSON.parse(spritesJs.slice(spritesJs.indexOf('{'), spritesJs.lastIndexOf('}') + 1));
  const actors = [];
  const one = async (name, m) => {
    if (!m || !m.sheet) return;
    const file = path.join(gameDir, 'src/assets', m.sheet);
    if (!fs.existsSync(file)) { actors.push({ name, ok: false, fails: ['sheet missing: ' + m.sheet] }); return; }
    const b64 = fs.readFileSync(file).toString('base64');
    const res = await page.evaluate(async ({ b64, m, TH }) => {
      function load(u) { return new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = u; }); }
      const im = await load('data:image/png;base64,' + b64);
      const fw = m.frameWidth, fh = m.frameHeight, cols = Math.round(im.naturalWidth / fw), rows = Math.round(im.naturalHeight / fh);
      const cap = cols * rows;
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const cell = (i) => x.getImageData((i % cols) * fw, ((i / cols) | 0) * fh, fw, fh).data;
      const opaque = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 32) n++; return n; };
      const diff = (a, b) => { let dd = 0, un = 0; for (let i = 0; i < a.length; i += 4) { const oa = a[i + 3] > 32, ob = b[i + 3] > 32; if (oa || ob) un++; if (oa !== ob) dd++; else if (oa && ob && (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) > 60) dd++; } return un ? dd / un : 0; };
      const total = fw * fh, fails = [];
      // 1 MANIFEST + 2 NON-BLANK
      const allIdx = new Set();
      for (const k of Object.keys(m.anims || {})) for (const i of m.anims[k]) allIdx.add(i);
      for (const i of allIdx) {
        if (i >= cap) { fails.push(`frame ${i} out of grid (cap ${cap})`); continue; }
        const r = opaque(cell(i)) / total;
        if (r < TH.nonBlank) fails.push(`frame ${i} blank (opaque ${(r * 100).toFixed(1)}%)`);
      }
      // 3 MOTION + 4 ALTERNATION on locomotion cycles
      for (const k of ['run', 'walk']) {
        const seq = m.anims && m.anims[k]; if (!seq || seq.length < 4) continue;
        const cells = seq.map((i) => cell(i));
        let minAdj = 1; for (let i = 0; i < cells.length; i++) { const d = diff(cells[i], cells[(i + 1) % cells.length]); if (d < minAdj) minAdj = d; }
        if (minAdj < TH.motion) fails.push(`${k}: adjacent frames too similar (min ${(minAdj * 100).toFixed(1)}% < ${(TH.motion * 100)}%) — looks frozen`);
        const altD = diff(cells[0], cells[(seq.length / 2) | 0]);
        if (altD < TH.alternation) fails.push(`${k}: contact frames don't alternate (${(altD * 100).toFixed(1)}% < ${(TH.alternation * 100)}%) — legs HOP, not scissor`);
      }
      return { fails, grid: cols + '×' + rows, frames: allIdx.size };
    }, { b64, m, TH: THRESH });
    actors.push({ name, ok: res.fails.length === 0, ...res });
  };
  await one('hero', SPRITES.hero);
  for (const k of Object.keys(SPRITES.enemies || {})) await one('enemy:' + k, SPRITES.enemies[k]);
  return { ok: actors.every((a) => a.ok), actors };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const gameDir = process.argv[2];
  if (!gameDir) { console.error('usage: node tools/validate-sprites.mjs <gameDir>'); process.exit(2); }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const rep = await validateGame(gameDir, page);
  await browser.close();
  console.log(`\nsprite validation · ${path.basename(gameDir)}`);
  for (const a of rep.actors) {
    console.log(`  ${a.ok ? '✓' : '✗'} ${a.name.padEnd(14)} ${a.grid || ''} ${a.frames || ''}f` + (a.ok ? '' : '\n      - ' + a.fails.join('\n      - ')));
  }
  console.log(`\n${rep.ok ? '✅ sprites VALID' : '❌ sprite validation FAILED'}`);
  process.exit(rep.ok ? 0 : 1);
}

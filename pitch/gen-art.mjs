// Parallel art generator for the Claystone pitch deck — Gemini Nano Banana Pro
// (gemini-3-pro-image-preview). Consistent "mission-control / glowing-blueprint"
// house style, 16:9, NO text in art. Usage:
//   node pitch/gen-art.mjs            # all plates (parallel)
//   node pitch/gen-art.mjs cover hero # only named plates
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { generateImage } from '../scripts/gemini.js';
import { JOBS, STYLE } from './jobs.mjs';

mkdirSync('pitch/img', { recursive: true });
const only = process.argv.slice(2);
const jobs = only.length ? JOBS.filter(j => only.includes(j[0])) : JOBS;
const CONC = 5;
let i = 0, ok = 0, fail = 0;
async function worker() {
  while (i < jobs.length) {
    const [name, ar, scene] = jobs[i++];
    const out = `pitch/img/${name}.jpg`;
    try {
      const { base64 } = await generateImage(`${STYLE} ${scene}`, { aspectRatio: ar, refs: [] });
      writeFileSync(out, Buffer.from(base64, 'base64'));
      ok++; console.log(`ok   ${name}  (${(Buffer.from(base64,'base64').length/1024).toFixed(0)}kb)`);
    } catch (e) { fail++; console.error(`FAIL ${name}: ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\ndone — ${ok} ok, ${fail} fail`);

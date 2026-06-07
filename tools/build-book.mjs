import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const file = 'file://' + path.resolve('book/book.html');
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(file, { waitUntil: 'networkidle', timeout: 60000 });
await pg.waitForTimeout(800);
const out = 'book/game-engine-playbook.pdf';
await pg.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await b.close();
// count real page sections only — `class="page"` / `class="page cover"` etc.,
// NOT the `class="pageno"` footers (which also start with "page").
const pages = (fs.readFileSync('book/book.html','utf8').match(/class="page[ "]/g)||[]).length;
console.log(`PDF: ${out} (${(fs.statSync(out).size/1024/1024).toFixed(1)} MB) · ${pages} pages · errors ${errs.length}`);

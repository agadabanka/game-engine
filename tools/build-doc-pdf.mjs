// tools/build-doc-pdf.mjs — render a Markdown doc → a clean "regular" PDF (headless Chromium).
// Self-contained: a focused Markdown→HTML converter (headers, bold, inline+fenced code, lists, tables,
// blockquotes, rules, links, paragraphs) + print CSS + page numbers. No external markdown dependency.
//   node tools/build-doc-pdf.mjs <input.md> [output.pdf]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const inPath = process.argv[2];
if (!inPath) { console.error('usage: node tools/build-doc-pdf.mjs <input.md> [output.pdf]'); process.exit(2); }
const outPath = process.argv[3] || inPath.replace(/\.md$/i, '.pdf');
const md = fs.readFileSync(inPath, 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function mdToHtml(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = []; let i = 0;
  while (i < lines.length) {
    let ln = lines[i];
    // fenced code
    if (/^```/.test(ln)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    // table (header | sep | rows)
    if (/^\|/.test(ln) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(ln); i += 2; const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    // headings
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    // hr
    if (/^---+\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }
    // blockquote (possibly multi-line)
    if (/^>\s?/.test(ln)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue; }
    // list
    if (/^\s*[-*]\s+/.test(ln)) { const buf = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*[-*]\s+/, '')); out.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>`); continue; }
    // blank
    if (/^\s*$/.test(ln)) { i++; continue; }
    // paragraph (gather until blank / block start)
    { const buf = []; while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|```|>|\s*[-*]\s|\||---+\s*$)/.test(lines[i])) buf.push(lines[i++]); out.push(`<p>${inline(buf.join(' '))}</p>`); }
  }
  return out.join('\n');
}

const body = mdToHtml(md);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 20mm 18mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 10.6pt/1.6 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c2230; max-width: 100%; }
  h1 { font-size: 22pt; line-height: 1.15; margin: 0 0 2pt; color:#141b2e; letter-spacing:-.2px; }
  h1 + p em { color:#5b657a; }
  h2 { font-size: 14pt; margin: 22pt 0 6pt; padding-bottom: 4pt; border-bottom: 2px solid #e7ebf3; color:#1b2440; }
  h3 { font-size: 11.6pt; margin: 14pt 0 3pt; color:#243056; }
  p { margin: 6pt 0; }
  ul { margin: 6pt 0; padding-left: 18pt; }
  li { margin: 3pt 0; }
  strong { color:#0f1626; }
  em { color:#3a4660; }
  a { color: #2456c9; text-decoration: none; }
  code { font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; font-size: 9pt; background: #eef1f7; padding: 1px 4px; border-radius: 4px; color:#243056; }
  pre { background: #0f1424; color: #d7def0; padding: 11pt 13pt; border-radius: 8px; overflow-x: auto; margin: 8pt 0; line-height: 1.45; }
  pre code { background: none; color: inherit; padding: 0; font-size: 8.5pt; white-space: pre; }
  blockquote { margin: 8pt 0; padding: 7pt 13pt; border-left: 3px solid #2456c9; background: #f3f6fc; border-radius: 0 6px 6px 0; color:#27314a; font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.4pt; }
  th, td { border: 1px solid #dde3ee; padding: 5pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f0f3fa; color:#1b2440; }
  hr { border: none; border-top: 1px solid #e2e7f1; margin: 16pt 0; }
  h1,h2,h3 { break-after: avoid; } pre, table, blockquote { break-inside: avoid; }
</style></head><body>${body}</body></html>`;

const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 794, height: 1123 } });   // A4 @96dpi for an optional preview
await pg.setContent(html, { waitUntil: 'load' });
if (process.argv.includes('--png')) { await pg.screenshot({ path: outPath.replace(/\.pdf$/i, '.preview.png') }); }
await pg.pdf({
  path: outPath, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font:8pt -apple-system,Arial;color:#9aa3b5;text-align:center;padding:0 14mm;"><span class="title"></span> &nbsp;·&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: '20mm', bottom: '16mm', left: '18mm', right: '18mm' },
});
await b.close();
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`✅ ${path.basename(outPath)} (${kb} KB) ← ${path.basename(inPath)}`);

// ── PDF → text · optional helper for REWRITING existing PDFs ──────────────────
// Dump a PDF's text so you can re-author it as LaTeX and rebuild through the TeX
// backend (tools/pdf/tex-build.mjs). For most PDFs you can instead just open the
// file with the Read tool; this helper is for long / text-heavy sources.
//
//   npm i -D pdfjs-dist          # one-time (optional dependency)
//   node tools/pdf/pdf-to-text.mjs <input.pdf> [> input.txt]
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/pdf/pdf-to-text.mjs <input.pdf>'); process.exit(2); }
if (!fs.existsSync(src)) { console.error(`no such file: ${src}`); process.exit(2); }

let pdfjs;
try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); }
catch {
  try { pdfjs = await import('pdfjs-dist'); }
  catch { console.error('pdfjs-dist not installed — run:  npm i -D pdfjs-dist'); process.exit(3); }
}

const data = new Uint8Array(fs.readFileSync(src));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
let out = '';
for (let p = 1; p <= doc.numPages; p++) {
  const content = await (await doc.getPage(p)).getTextContent();
  let text = '';
  for (const it of content.items) text += it.str + (it.hasEOL ? '\n' : '');
  out += `${text}\n\n----- page ${p} of ${doc.numPages} -----\n\n`;
}
process.stdout.write(out);

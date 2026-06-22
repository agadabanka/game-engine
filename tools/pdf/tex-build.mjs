// ── TeX → PDF · the engine's standard PDF backend ────────────────────────────
// Compile a LaTeX (.tex) document to PDF with Tectonic — one self-contained
// engine that fetches packages on demand (no full TeX Live, no root). This is
// the STANDARD backend for all new and rewritten PDFs on the engine; the
// HTML+Chromium path (tools/build-book.mjs) stays ONLY for the image-heavy
// Gemini-art illustrated book.
//
//   node tools/pdf/tex-build.mjs <doc.tex> [--out <doc.pdf>]
//
// On first use it bootstraps tectonic into ~/.local/bin if it isn't already on
// PATH, and the first compile downloads the package bundle (~30s; cached after).
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
if (!src) { console.error('usage: node tools/pdf/tex-build.mjs <doc.tex> [--out <doc.pdf>]'); process.exit(2); }
if (!fs.existsSync(src)) { console.error(`no such file: ${src}`); process.exit(2); }
const oi = args.indexOf('--out');
const out = oi >= 0 && args[oi + 1] ? args[oi + 1] : src.replace(/\.tex$/i, '.pdf');

// ── ensure the engine is present (bootstrap on first use, no root needed) ──
function onPath(bin) { try { return execSync(`command -v ${bin}`, { encoding: 'utf8' }).trim(); } catch { return ''; } }
function tectonicBin() {
  const found = onPath('tectonic'); if (found) return found;
  const local = path.join(os.homedir(), '.local', 'bin', 'tectonic');
  if (fs.existsSync(local)) return local;
  console.error('tectonic not found — bootstrapping into ~/.local/bin …');
  fs.mkdirSync(path.dirname(local), { recursive: true });
  execSync('curl --proto "=https" --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh', { cwd: path.dirname(local), stdio: 'inherit' });
  if (!fs.existsSync(local)) { console.error('could not install tectonic — see https://tectonic-typesetting.github.io'); process.exit(1); }
  return local;
}
const tectonic = tectonicBin();

// ── compile ──
const outdir = path.dirname(path.resolve(out));
fs.mkdirSync(outdir, { recursive: true });
console.error(`tex → pdf: ${src}  (engine: ${tectonic})`);
try {
  execFileSync(tectonic, [path.resolve(src), '--outdir', outdir], { stdio: 'inherit' });
} catch { console.error('compile failed — see the LaTeX errors above'); process.exit(1); }

// tectonic writes <basename>.pdf into outdir; rename to the requested --out
const produced = path.join(outdir, path.basename(src).replace(/\.tex$/i, '.pdf'));
if (path.resolve(produced) !== path.resolve(out)) fs.renameSync(produced, out);

const buf = fs.readFileSync(out);
// page objects are usually inside compressed object streams, so a plaintext
// count only works for some PDFs — report it when we can, stay quiet otherwise.
const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`PDF: ${out} (${(buf.length / 1024 / 1024).toFixed(2)} MB)${pages ? ` · ~${pages} pages` : ''}`);

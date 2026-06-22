---
name: tex-pdf
description: Make or rewrite PDFs with the TeX (LaTeX) backend — the engine's STANDARD for all new and rewritten PDFs. Compiles .tex → PDF with Tectonic (self-bootstrapping, no root, no full TeX Live). Use when the user asks to make/generate/write/rewrite/regenerate a PDF — a report, doc, one-pager, spec, handout, paper — or says "use the TeX/LaTeX backend". The Gemini-art Chromium path (the `book` skill) is reserved ONLY for image-heavy illustrated books.
---

# /tex-pdf — make & rewrite PDFs with the TeX backend

**Standing convention:** all new and rewritten PDFs on the engine go through the
**TeX backend** (Tectonic). The HTML+Chromium path (`tools/build-book.mjs`, the
`book` skill) stays ONLY for the image-heavy, Gemini-art illustrated playbook.

## The backend
- **Tectonic** — one self-contained binary that fetches LaTeX packages on demand
  (no full TeX Live, no root). `tools/pdf/tex-build.mjs` bootstraps it into
  `~/.local/bin` on first run if it isn't already on PATH.
- Build:  `node tools/pdf/tex-build.mjs <doc.tex> [--out <doc.pdf>]`
  (or `npm run pdf -- <doc.tex>`). Prints output path, size, and ~page count.
- Tectonic runs **XeTeX** — UTF-8 native, so no `inputenc`/`fontenc` needed. The
  template deliberately avoids `fontspec`/system fonts so it compiles anywhere.

## Make a PDF (from scratch)
1. Copy the house-style template `tools/pdf/template.tex` to your doc, e.g.
   `docs/pdf/myreport.tex`. It's self-contained — palette, headings, footer,
   code listings, tables, math, links — and compiles with no system fonts.
2. Write the content in LaTeX (keep the preamble; edit `\doctitle` and the body).
3. Build:  `node tools/pdf/tex-build.mjs docs/pdf/myreport.tex`
4. **Verify the render** — open the PDF with the Read tool (or screenshot page 1)
   and eyeball it. Commit the `.tex` **and** the built `.pdf` together.

## Rewrite an existing PDF
"Rewrite" = re-typeset a source PDF cleanly through the TeX backend.
1. **Read the source.** Open it with the Read tool (use `pages:`) to take in the
   content and structure. For long / text-heavy PDFs, dump the raw text instead:
   `npm i -D pdfjs-dist` (one-time), then
   `node tools/pdf/pdf-to-text.mjs source.pdf > source.txt`.
2. **Re-author as LaTeX** starting from `tools/pdf/template.tex` — reconstruct
   headings, lists, tables, and math; drop scan noise; keep the house style.
3. **Build** with `tex-build.mjs` and **verify** against the original.
   Re-typesetting reflows text — it won't pixel-match the source layout (that's
   the point). For pixel-faithful, image-heavy docs, use the `book` path instead.

## Notes
- First compile downloads the package bundle (~30s); later compiles are fast
  (the bundle is cached under `~/.cache`).
- This is an authoring/CLI step (like `book`) — keep TeX out of any deployed
  app's runtime. Commit `.tex` + `.pdf`.

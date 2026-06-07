---
name: book
description: Rebuild the illustrated PDF playbook ("Game Engine — Hit New Game and Go") from book/book.html, optionally regenerating chapter/backdrop art with Gemini. Use when the user asks to update/rebuild the book or PDF, add a chapter, fix the cover, or refresh its art.
---

# /book — rebuild the illustrated PDF playbook

The book is one self-contained HTML (`book/book.html`) of art-backed `.page`
sections, rendered to **`book/game-engine-playbook.pdf`** by headless Chromium
(`tools/build-book.mjs`).

## Structure
- Each page = a `<section class="page" style="background-image:url('img/art/NAME.jpg')">`
  with a `.scrim` (gradient for legibility) + a `.card` of content. Copy an existing
  section as a template; keep new pages before the BACK page. Each section is exactly
  one A4 page (`.page` is 210×297mm).
- The **cover** uses `.cover .titlebox`. The architecture spread overlays the
  `docs/ENGINE.md` tier-stack on the dark `stack` backdrop.
- Art lives in `book/img/art/`. This book is **not** character-conditioned (no model
  sheet) — it's a meta-book about the engine, so all plates generate free-form with a
  consistent "mission-control / glowing-blueprint" style. **No text in the art.**

## How to run
1. (Optional) Generate art — needs `GEMINI_SA_JSON` (or `GOOGLE_APPLICATION_CREDENTIALS`):
   ```
   node scripts/gen-book-art.mjs            # all plates
   node scripts/gen-book-art.mjs cover      # one plate
   ```
2. Edit `book/book.html` to add/update pages.
3. Rebuild the PDF:
   ```
   node tools/build-book.mjs                # → book/game-engine-playbook.pdf
   ```
   It prints page count + size + pageerror count. Commit the HTML, any new art,
   AND the rebuilt PDF.
4. **Verify the render** — open the PDF (or screenshot page 1) and eyeball it; the
   PDF can differ from a browser.

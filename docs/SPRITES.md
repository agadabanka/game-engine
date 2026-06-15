# Character sprites — the sprite-SHEET pipeline (and how it's validated)

Every actor (the hero **and** every enemy) is animated from generated **sprite sheets**, not
per-pose images. This doc is the repeatable recipe: what the pipeline does, the validations that
guarantee it, and how to verify the result with your own eyes.

> TL;DR — run/walk is generated as **one coherent 6-frame cycle image** so the legs **alternate**.
> Per-pose generation can NOT keep a cycle consistent: it returns two "stride" frames with the
> **same** leg forward, which animates as a **hop**, not a run. The fix is to draw the whole cycle
> at once. `tools/art-sprites.mjs` does this and then **validates** that the legs actually scissor.

## The pipeline (`tools/art-sprites.mjs <gameDir>`)

1. **Model sheet** — one identity reference per character (nano-banana-pro / `gemini-3-pro-image`),
   so the run sheet and the action sheet stay on-model (same colours, eyes, mustache, proportions).
   The hero's look (e.g. "…with a small curly mustache") comes from `GAME_META.hero` — keep the tool
   generic; put per-game features in the metadata.
2. **Cycle sheet** — a **6-frame run (hero) / walk (enemy) CYCLE in ONE image**, a 2×3 grid on flat
   chroma green, with **explicit per-frame leg choreography** (contact → recoil → passing → mirror
   contact → recoil → passing) so the forward leg visibly **swaps sides**. Be thorough in the prompt:
   exact grid, even spacing, common baseline, side view facing right, flat `#00d800` background, and
   "NO text / numbers / grid lines / shadow".
3. **Action sheet** — a grid of distinct poses (hero: idle/idle2/jump/fall/land/land2/hurt/cheer×2;
   enemy: idle/hurt/hop/happy/turn/jump), one per cell, in a known row-major order.
4. **Key + slice** — chroma-key the green to transparent (with green-spill suppression on edges), then
   segment frames by **connected-component labelling** (robust to imperfect grids — it finds each
   character blob, not a fixed grid), order them **row-major** (rows top→bottom, cols left→right), and
   trim each to its bounding box.
5. **Pack** — grid-pack all frames into ONE uniform atlas per actor (capped ≈3600 px/side so it never
   exceeds the GPU max-texture-size and goes black), feet-aligned per cell.
6. **Manifest** — `src/game/sprites.js` (`window.SPRITES`) maps anim → frame indices. The run/walk
   anim is the **6 cycle frames**; `Studio.Hero` plays it.

`Studio.Hero` keeps its procedural layer **minimal** — just a gentle lean into travel + an idle
breathe + an impact squash spring. The bob/scissor lives in the **art**; a big procedural bob on top
double-bounces back into the "hop" we just removed.

## The validations (`tools/validate-sprites.mjs <gameDir>`, also run at the end of art-sprites)

Pure image analysis (no WebGL, so it's reliable), per actor. Exits non-zero on any failure, so the
art tool and the gate enforce it. Thresholds live in `THRESH`.

| Check | What it proves | Rule |
| --- | --- | --- |
| **Manifest** | no anim points outside the packed grid | every index `< cols*rows` |
| **Non-blank** | no black-box / failed-key frame | each referenced frame ≥ **2%** opaque |
| **Motion** | the cycle isn't a frozen single pose | every adjacent cycle pair differs ≥ **3%** |
| **Alternation** | the legs SCISSOR (run), not repeat (hop) | the two CONTACT frames (`cycle[0]` vs `cycle[mid]`) differ ≥ **10%** |

The **alternation** check is the one that matters: a same-stride "hop" cycle has `cycle[0] ≈ cycle[mid]`
(low diff → FAIL); a real run has mirror contacts (high diff → PASS). This is the exact bug it guards.

**Auto-retry:** during generation, each cycle is scored inline; if alternation is weak the sheet is
**regenerated** (cache-busted, with a stronger "swap the forward leg" nudge) up to 3× and the best is
kept. So a one-off weak generation self-corrects instead of shipping a hop.

## How to verify by eye (what was actually done)

- **Slice montage** — extract the 6 cycle frames from the atlas and look: frame 1 should have one
  foot forward, frame 3 (the mirror) the **other** foot forward. (This is how the truffle hop and the
  hero fix were both caught.)
- **Real-game run** — the hero only moves on real input. Boot `?level=1`, hold `ArrowRight` via
  Playwright keyboard (the harness `setInput` does NOT feed `manual()` — that reads keyboard/touch),
  let the RAF loop run, and capture a tight crop of the hero: confirm `anim=hero_run` is cycling and
  the legs read as alternating.
- **Gate** — `node eval.mjs` renders the whole game on both renderers and checks non-black + win +
  felt-fun + menu. (Headless software-GL can get flaky after many runs in one session and time out a
  screenshot; the canvas renderer pass + a fresh re-run confirm it's environmental, not the game.)

## Adding it to a new game

`tools/art-sprites.mjs` runs as part of `tools/full-art.mjs`. Nothing per-game is needed beyond
`GAME_META.art` (style + enemies). The validation runs automatically; if it fails, just re-run the
tool — the flagged cycle regenerates.

---
name: art-from-image
description: Turn a USER-PROVIDED character image (a drawing, sketch, or photo) into a fully-animated, VALIDATED sprite SHEET and wire it into a game — the optional "bring your own art" path. Use when the owner uploads/points to an image and says "use this as the hero/character", "turn my drawing into a sprite", "make a sprite sheet from this image/photo", "use my own art", or hands you a kid's drawing of a creature. Optional — games can also generate art from a text description (the add-character skill).
---

# art-from-image — bring your own art, get it animated in the game

The owner provides an **image** of a character (often a child's drawing). This seeds the proven
sprite-SHEET pipeline with **that exact art** so the generated run/idle/jump frames look like
*their* character — not a redesign — then validates the movement and wires it into a game. It
rides the same pipeline as `docs/SPRITES.md`, so the run/walk legs **alternate** instead of hopping.

This is the **optional** "bring-your-own-art" counterpart to `add-character` (which generates art
from a text description). Everything downstream — slicing, packing, the 0-death gate, deploy — is
identical. Nothing requires a user image; this is the opt-in alternative when the owner has art.

## Inputs (ask only if missing)
- The **image** — an uploaded file path or a URL (PNG/JPEG/WebP). Best input: one clear character,
  full body, simple background.
- **Which game** (the game dir, e.g. `out/rainbow-run`) and the **role**: `hero` (default) or `enemy`.
- A one-line **description** + house **style** — infer them from the image if not given; they keep
  the model on-model.
- A short **key** (slug) for an enemy — infer from the description.

## Do this

1. **Set the identity in `GAME_META.json`.**
   - hero → set `hero` to the description; set `art.style` to the house style.
   - enemy → push `{ key, desc }` onto `art.enemies`.

2. **Generate + VALIDATE the sheet FROM the image** (the heart of it):
   ```bash
   node tools/art-sprites.mjs <gameDir> --ref <imagePath> --force
   ```
   `--ref` makes the uploaded image the **identity reference** (it replaces the generated model
   sheet), so nano-banana-pro draws animation frames of THAT art. It produces a 6-frame run CYCLE
   (legs scissor) + an action grid (idle/jump/fall/land/hurt/cheer), chroma-keys, segments by
   connected components, packs one atlas, and runs the **alternation validator** — auto-retrying up
   to 3× if a cycle comes out as a hop. Double-check independently:
   ```bash
   node tools/validate-sprites.mjs <gameDir>
   ```
   `--ref` seeds the **hero** identity. For an **enemy** from an image, generate it as the hero in a
   throwaway dir (`cp -r engine/game-template /tmp/x`, set its `hero`, run `--ref`) and copy the
   packed `src/assets/sprites/hero.png` into the game's enemy slot + manifest — or use the IDE flow.

3. **(optional) Show the movement.** Slice the run frames from the packed atlas and assemble a
   looping GIF (Playwright to draw each `anims.run` cell, `ffmpeg-static` to encode) so the owner
   can SEE the character move before committing.

4. **Wire it into the game** (same as `add-character`):
   - **hero** → automatic: `Studio.Hero` prefers `window.SPRITES.hero`, so the player becomes the
     new character with no code change.
   - **enemy** → add placements to the worlds in `src/game/levels.js` (each level's `enemies`
     references the `key`); keep the autopilot able to win 0-death (don't wall off the path).

5. **Re-gate and ship.** `node eval.mjs` (0-death, both renderers) → deploy.

## In the Studio IDE (the no-CLI path)
The same operation is first-class in the IDE: open a game → **Art** tool → **Bring your own art
(upload → sprite sheet)** → **🎞 Make sprite sheet from my art**. That calls `POST /api/ide/art/sheet`,
which runs `art-sprites.mjs --ref` server-side and returns the packed sheet; the upload also rides on
the **suggested note** so `tools/handle-art-note.mjs` rebuilds it in the target game's repo.

## Optional by design
This skill never has to run. The default art path generates from a text description
(`add-character` / `tools/full-art.mjs`). Reach for `art-from-image` only when the owner brings
their own drawing or photo.

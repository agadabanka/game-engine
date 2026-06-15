---
name: add-character
description: Add a new character (enemy, hero, or NPC) to an existing game on the engine — generate its animations as validated sprite SHEETS (legs that alternate, not hop), wire it into the roster/levels, re-gate, and deploy. Use when the user says "add a character", "add an enemy", "give the game a <creature>", "new boss", or describes a creature they want in a specific game.
---

# add-character — describe it, get it animated and in the game

The owner describes a character ("a grumpy marshmallow with stubby legs"); this turns it into a
fully-animated, **validated** actor wired into the game. It rides the sprite-SHEET pipeline
(`docs/SPRITES.md`) so the new character's run/walk legs actually **alternate** instead of hopping.

## Inputs (ask only if missing)
- **Which game** (the game dir / repo, e.g. `lovelump`).
- **A description** — look, colour, vibe ("a chubby cobalt slime with one big eye").
- **Role** — `enemy` (default), `hero` (replaces the player), or `npc`.
- A short **key** (slug) — infer one if not given (`cobalt-slime` → `slime`).

## Do this

1. **Add it to the metadata.** Edit the game's `GAME_META.json`:
   - enemy/npc → push `{ key, desc }` onto `art.enemies`.
   - hero → set `hero` to the description (keep per-game traits like a mustache here, not in the tool).

2. **Generate + VALIDATE the animations** (the heart of it):
   ```bash
   node tools/art-sprites.mjs <gameDir>
   ```
   This is content-addressed, so only the NEW character is generated (the rest hit the cache). It
   creates the character as coherent sheets — a **6-frame run/walk CYCLE** (legs scissor) + an action
   grid (idle/hurt/hop/happy/turn/jump for enemies; idle/jump/fall/land/hurt/cheer for a hero), slices
   them by connected components, packs an atlas, and **runs the alternation validator**. If a cycle
   comes out as a hop it **auto-retries** (cache-busted, stronger nudge) up to 3×; if it still fails the
   command exits non-zero — just run it again. Double-check independently with:
   ```bash
   node tools/validate-sprites.mjs <gameDir>
   ```

3. **Wire it into the game.**
   - **enemy** → add placements to the relevant worlds in `src/game/levels.js` (each level's `enemies`
     array references the `key`). Keep the autopilot able to win 0-death (don't wall off the path).
   - **hero** → it's loaded automatically by `Studio.Hero` from the manifest; no level edits needed.
   - **npc** → place it as a non-colliding decorative actor where it fits the world.

4. **Re-gate.** `node eval.mjs` from the game dir — autopilot still WINS every level 0-death, both
   renderers non-black, felt-gate + menu green. (Headless software-GL can flake on the webgl screenshot
   after many runs; the canvas pass + a fresh re-run confirm it's environmental.)

5. **Deploy + commit.** `railway up --detach --service <game>`, verify `/health` live, then commit the
   regenerated `src/assets/sprites/*`, `src/game/sprites.js`, `GAME_META.json`, and `src/game/levels.js`
   to the game repo `main`. If the engine itself was improved along the way, mirror it to the work
   branch + `main` and keep the three `studio.js` copies byte-identical.

## Notes
- The whole point is **repeatability**: never eyeball-approve a character. The validation
  (`tools/validate-sprites.mjs`) is the gate — alternation ≥10%, frames non-blank, motion present.
- Want it to FEEL alive? Pair with `Studio.Atmosphere` (drifting parallax) and `Studio.Juice` (juice on
  every hit/stomp) — see `docs/SPRITES.md` and the engine FX surface.

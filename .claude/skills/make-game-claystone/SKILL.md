---
name: make-game-claystone
description: Make a new game on the CLAYSTONE engine instead of the Phaser base — the determinism-first, zero-dependency option. Reuses the standard new-game / make-game pipeline and swaps ONLY the engine (new-game.mjs --engine claystone). Use when the user says "new game with claystone", "make a claystone game", "build on claystone", or asks for the engine option set to claystone. Phaser stays the default; this is the opt-in alternative.
---

# make-game-claystone — the Claystone engine option

This skill does **not** replace `new-game` or `make-game`. It **reuses** them and
flips one choice: the engine. Phaser 4 + Studio stays the default; pick this when the
user wants the game on **Claystone** — the determinism-first, zero-dependency rebuild
of the same Studio base (`agadabanka/claystone-engine`). The `Studio.*` seam and the
0-death gate contract are identical, so the rest of the pipeline carries over.

## The one thing that changes: pass `--engine claystone`

Everywhere `new-game` scaffolds the Phaser base:
```bash
node scripts/new-game.mjs "<Name>" --tagline "…" --hero "…" --verb "…"          # DEFAULT: Phaser
```
…this skill adds the engine flag:
```bash
node scripts/new-game.mjs "<Name>" --engine claystone --tagline "…" --hero "…" --verb "…"
```
With `--engine claystone`, `new-game.mjs` clones `claystone-engine` and delegates to its
scaffolder (`scripts/new-claystone-game.mjs`), which writes a **self-contained, playable**
game: a vendored engine (`engine/`), a Canvas2D `index.html`, the game glue (`game.js` —
a level-as-data spec + ~40 lines on the `Studio.*` seam), and a headless `eval.mjs`. It
**self-verifies the deterministic 0-death gate before anything is pushed**. The rest of
`new-game` (GitHub repo, push, hub register, pipeline issues) runs unchanged.

> Think of it as `new-game` with the engine swapped. Everything else is the same skill.

## How to run this skill (reuse, don't duplicate)

1. **Get the concept** exactly as `new-game` / `make-game` say (name, tagline, hero,
   verb). Infer sensible defaults; don't block.
2. **Scaffold on Claystone** — the only changed step:
   ```bash
   node scripts/new-game.mjs "<Name>" --engine claystone \
        --tagline "<…>" --hero "<…>" --verb "<…>"            # --dry-run to preview locally
   ```
   Confirm the printed scorecard shows `✓ GATE PASSED` (won, 0 deaths, deterministic).
3. **Reuse the rest of `make-game`** stage by stage, adapting only where the engine
   genuinely differs:
   - **Levels / design** — same data-driven idea (`Studio.Level.build`). Edit `SPEC`
     in the game's `game.js`; keep pit gaps inside the autopilot's hop envelope (the
     scaffolder's generator already does). Re-gate with `node eval.mjs` after edits.
   - **Gate** — the game's `node eval.mjs` IS the gate: boots headless, runs the seeded
     autopilot to win/dead/timeout, asserts **won, 0 deaths, two-run determinism**, and
     writes `out/scorecard.json`. Accept a stage only on `pass:true`.
   - **Art / Music** — Claystone is vector-first (no external art needed); `Studio.Textures`
     bakes procedural art. The sprite-sheet / Lyria stages are OPTIONAL here — use them
     only if the concept needs bitmap characters/music; otherwise skip and note in the diary.
   - **Diary / GAME_META / hub** — identical. `GAME_META.json` already carries
     `"engine":"claystone"`. Register on the hub exactly as `new-game` describes.
   - **Deploy** — a Claystone game is a **static site** (no Phaser, no server needed to
     play; cf. `agadabanka/claystone-platformer`). Reuse the deploy skill; note there's
     no server tier required just to play it.

## What's the same / what differs (vs. the Phaser base)

| Stage | Phaser base (default) | Claystone option |
|---|---|---|
| Scaffold | `new-game.mjs` (clone studio-game-template) | `new-game.mjs --engine claystone` (clone claystone-engine) |
| Seam | `Studio.*` on Phaser 4 | `Studio.*` on Claystone (`src/sdk.js`) |
| Gate | game `eval.mjs` (0-death) | game `eval.mjs` (0-death **+ determinism check**) |
| Play | Phaser canvas/WebGL + server | static `index.html` (Canvas2D; `?r=webgl` too) |
| Deps | Phaser 4 vendored | **zero** |
| Art / Music | full sprite/Lyria pipeline | vector-first; sprite/Lyria optional |

## Acceptance bar
In the scaffolded dir, `node eval.mjs` prints `✓ GATE PASSED` and `out/scorecard.json`
has `"pass": true` (`won:true`, `dead:false`, `deterministic:true`). Then continue the
normal make-game stages (levels/feel/diary/hub) against it.

## Notes
- Keep Phaser the default. Only use this skill when the engine is explicitly Claystone.
- All gameplay randomness comes from the engine's seeded RNG — never `Math.random`
  (a repo test enforces it; it's the determinism contract).
- Claystone implements the load-bearing Studio subset (`Level`, `Actors`, `Juice`,
  `Cam`, `Audio`, `harness`); richer Phaser-only surfaces (`Studio.Mechanics`,
  `Studio.Toon` rigs, Lyria) degrade gracefully — skip the stage and note it, don't fake it.

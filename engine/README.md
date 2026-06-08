# engine/ — the vendored Phaser 4 base + Studio SDK

This directory closes the gap noted in [`docs/ENGINE.md`](../docs/ENGINE.md)
("The fast-follow"): **game-engine now owns a local `engine/`**, a de-branded
copy of the Phaser 4 base and the Studio SDK, so a new game depends on nothing
external to bootstrap.

## What's here

- **`sdk/studio.js`** — the **source of truth** for the Studio SDK: the
  deterministic stepper, observability bridge, generic autopilot, Level DSL,
  procedural texture bakery, JuiceKit (tweens / particles / GPU filters),
  procedural WebAudio SFX, and the follow camera. When the SDK changes, update
  it here first; the base ships a vendored copy at
  `game-template/src/vendor/studio.js` (kept byte-identical).

- **`game-template/`** — the local copy of the Phaser 4 + Studio SDK base game,
  mirroring [`agadabanka/studio-game-template`](https://github.com/agadabanka/studio-game-template).
  It is self-contained and AI-evaluable: `npm i && node eval.mjs` passes the
  0-death autopilot gate on both WebGL and Canvas (`out/scorecard.json`).
  Phaser 4 (sourced from `agadabanka/phaser-private`) is vendored at
  `game-template/src/vendor/phaser.min.js`.

## How `scripts/new-game.mjs` uses it

- **Default (remote):** `new-game` clones
  [`agadabanka/studio-game-template`](https://github.com/agadabanka/studio-game-template)
  — the published clone target — then rebrands it. Override with `--base <owner>/<repo>`.
- **`--local`:** instead of cloning, `new-game` copies `engine/game-template/`
  as the new game's starting tree, then runs the same rebrand + meta steps. Use
  this to scaffold from the vendored base with no network dependency.

The remote default and the local vendored copy are the same base; keep them in
sync (this `engine/` is the canonical local copy).

# The game-engine — architecture

This is the platform field-map from the Jazz playbook, made real. Read it
**bottom-up**: each tier only needs the one beneath it, so a hard problem (a good
game) becomes a stack of small, swappable parts — and a *second* game reuses the
bottom while replacing the top.

```
        ┌──────────────────────────────────────────────────────────┐
   ▲    │  PUBLISH & SHIP        YouTube playlists · Railway deploy  │
   │    ├──────────────────────────────────────────────────────────┤
   b    │  FEEDBACK LOOP         in-game notes → /api/notes →        │
   u    │                        notes-to-issues (GitHub) · DIARY    │
   i    ├──────────────────────────────────────────────────────────┤
   l    │  EVALUATION            wincheck (0-death GATE) · feel      │
   d    │  (the AI playtester)   (felt-fun) · record · judge         │
   s    │                        (vision) · game-diff + feel-judge   │
   │    ├──────────────────────────────────────────────────────────┤
   o    │  CONTENT & AUTHORING   art pipeline (model sheet → refs →  │
   n    │                        chroma-key) · Lyria music · builder  │
   │    ├──────────────────────────────────────────────────────────┤
   │    │  ENGINE (Phaser)       Boot/Title/Play/UI · materials/     │
   │    │                        elements · controls · levelkit ·    │
   │    │                        merge (mergeGroup/shapeArc/vert.)   │
   │    ├──────────────────────────────────────────────────────────┤
   │    │  PLATFORM (shared rig) server.js · store.js (volume KV) ·  │
   │    │                        gemini.js · Lyria · Railway          │
   │    ├──────────────────────────────────────────────────────────┤
  base  │  FOUNDATIONS           the-harness (method) ·               │
        │                        the-platformer/the-rig (game+skel.)  │
        └──────────────────────────────────────────────────────────┘
```

## The tiers

**Foundations — the base.** `the-harness` is the *method*: build levels as
stories, make an AI beat each one at 0 deaths before it ships, score the fun,
record the proof. `the-platformer / the-rig` is a *working* Phaser game on a
click-to-deploy Railway skeleton. Inherited whole, never rebuilt.

**Platform — the shared rig.** The always-on services every feature leans on: an
Express server, volume-backed persistence that survives redeploys (`store.js`),
one Gemini helper for image/vision/text (`gemini.js`) plus Vertex Lyria for music,
and Railway for deploy.

**Engine — Phaser, AI-first.** Four scenes (Boot/Title/Play/UI); a
materials/element model where every surface declares its look + footing +
machine-readable *grounding* together; the controls; the level DSL (`levelkit.js`);
and the campaign-merge tools (`merge.js`).

**Content & authoring.** Where worlds and assets come from: the art pipeline (lock
a model sheet, generate everything reference-conditioned, chroma-key it), the Lyria
per-world score, and the canvas level builder (`/build.html`) — paint a level on an
(x,y) grid and live-test it.

**Evaluation — the AI playtester.** The robot QA team that lets one person ship
with confidence: the 0-death gate (`wincheck`, the ship bar), the felt-fun score
(`feel`), the deterministic recorder (`record`), the vision art-director (`judge`),
and game-diff + feel-judge that prove a new game is its own game.

**Feedback loop.** The channel from "I felt something" to "it's fixed": leave a
pinned note in-game, file each as a GitHub issue on session start, fix them one by
one, and record the why in the build diary (`/diary.html`).

**Publish & ship.** The recorder's clips become YouTube playlists; a push to `main`
auto-deploys the live game on Railway.

## The hub (this repo's deployed app)

The one tier that's *new* here: a meta-layer above all games. It doesn't run any
game — it **observes** them. Because every game exposes the same surface
(`/api/notes`, `/api/diary`, `/api/meta`), the hub pulls them all into one board:
per-game cards, an aggregated notes-triage feed, and the combined diary timeline.
Games that aren't deployed yet still show up — the hub reads `DIARY.md` and
`GAME_META.json` straight from their GitHub repo.

```
hub ──pull──> game A  /api/{notes,diary,meta}   (live)
    ──pull──> game B  GitHub: DIARY.md, GAME_META.json   (pre-deploy)
```

## How a new game is born
`scripts/new-game.mjs` clones the base (a complete game), rebrands it, writes
`GAME_META.json`, creates the GitHub repo, pushes, and registers with the hub. The
new game inherits every tier above; you then re-skin the top (hero, verb, art,
music, worlds) via the content pipeline and deploy it as its own Railway project.

## The fast-follow
Today the scaffolder's base is `the-platformer` (the canonical clean game). The
next step is to lift a *de-branded* copy of the engine (platform + engine +
evaluation tiers) into this repo as `engine/`, so game-engine owns the base
outright and a new game depends on nothing else.

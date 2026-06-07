# game-engine

> The reusable rig that ties together everything learned building
> [`the-platformer`](https://github.com/agadabanka/the-platformer) (a working
> game) and [`jazz`](https://github.com/agadabanka/jazz) (a second game off it).
> **Hit "new game" and go** — then watch every game from one place.

This is the consolidation the Jazz playbook recommended: lift the **platform**,
**engine**, and **evaluation** tiers into one place so a new game starts wired to
the whole stack on day one, and a **mission-control hub** keeps an eye on every
game's notes and diaries.

## Two things live here

### 1. `new-game` — the button
```bash
node scripts/new-game.mjs "My Game" --tagline "one-liner" --hero "a robot ninja" --verb "dash · slash"
```
One command: clones the proven base (a complete, playable platformer wired to the
full stack), rebrands it, writes its `GAME_META.json`, creates its GitHub repo,
pushes, and registers it with the hub. Add `--dry-run` to scaffold locally without
touching GitHub. Needs `GH_TOKEN`. (Deploy is one Railway project per game — the
command prints the steps; see `BOOTSTRAP.md` in the scaffolded repo.)

What a new game inherits, already wired:
- **Platform** — Express server, volume-backed store, Gemini (image/vision/text) + Lyria.
- **Engine** — Phaser scenes, the material/element model, the level DSL + campaign merge, controls.
- **Authoring** — the canvas level builder (`/build.html`).
- **Evaluation** — the 0-death gate, the felt-fun model, the deterministic recorder, the vision judge, game-diff + feel-judge.
- **Feedback loop** — in-game notes → diary → GitHub issues.

### 2. The hub — mission control (deployed on Railway)
A dashboard at `/` that **monitors every game built on the engine**: their live
playtest **notes**, their build **diaries**, and per-game **meta** (hero, verb,
worlds, level count, controls, art, music, uniqueness/feel scores). It's
*pull-model* — it reads each game's standard `/api/notes` + `/api/diary` +
`/api/meta` (and falls back to `DIARY.md` / `GAME_META.json` on GitHub for games
that aren't deployed yet), so it works with existing games unchanged.

```bash
npm install
GH_TOKEN=… npm start          # hub on :3000  (or PORT)
node hub/refresh.mjs          # CLI: snapshot every game, print a summary
```

The registry persists on the Railway volume (key `games` in the store) and is
seeded from `hub/games.json`. Register a game from the dashboard ("+ register
game") or let `new-game` do it via `--hub <url>`.

## Layout
```
hub/            the mission-control app (Railway-deployed)
  server.js       express: dashboard + registry + aggregation API
  lib/aggregate.js pulls /api/notes + /api/diary + /api/meta (+ GitHub fallback)
  lib/store.js    volume-backed KV (the registry)
  public/         the dashboard UI
  games.json      seed registry
scripts/new-game.mjs   the scaffolder
book/           the engine's illustrated PDF playbook
docs/ENGINE.md  the architecture (the platform field-map, in prose)
```

## The stack, bottom-up
`foundations` (the-harness method + the-platformer game) → `platform` (server ·
store · gemini · lyria · railway) → `engine` (scenes · materials · levelkit ·
merge · controls) → `content & authoring` (art pipeline · Lyria · builder) →
`evaluation` (gate · felt-fun · recorder · vision judge · game-diff) → `feedback
loop` (notes → issues · diary) → `publish` (youtube · railway). See
[`docs/ENGINE.md`](docs/ENGINE.md) and the PDF playbook.

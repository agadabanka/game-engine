---
name: make-game
description: Build and SHIP a complete game on the engine from a one-line concept — scaffold, design, gate, art, music, deploy, videos, diary, hub. Use when the user describes a game they want made end-to-end ("let's make a brawler/racer/puzzler…"), names a theme, or says "make the next game". The user only needs to give the concept; everything else is standing instruction.
---

# make-game — concept in, shipped game out

The user gives a CONCEPT (genre + theme + any wishes). Everything below is
standing instruction — do NOT ask for it again. Deliver the whole arc in one
session and end with links.

## Standing preferences (from the owner — apply to every game)
- **Polished toony look** by default: bold outlines, big eyes, squash-and-stretch.
  Characters should be procedural rigs (`Studio.Toon`) so they animate richly
  (15+ states: idle/run/jump/fall/flip/land/attacks/hit/KO/victory/defeat…).
- **Lots of juice**: particles on every event (hits, pickups, KOs, landings),
  rings/sparks/confetti/popups (`Studio.Juice`), procedural SFX (`Studio.Audio`).
- **Variety as a theme**: levels/arenas should each be a distinct biome/world
  (clouds, jungle, volcano, glacier, neon city…) unless the concept says otherwise.
- **5 levels** unless specified.
- **Single player first**: the player drives one hero; ALL other actors are CPU
  (`Studio.Brawl.cpu` / archetype policies). Difficulty via iq presets.
- **Evolve the engine as you build**: anything reusable goes into
  `engine/sdk/studio.js` (game-engine repo, the session's work branch), kept
  byte-identical with `engine/game-template/src/vendor/studio.js` and the game's
  `src/vendor/studio.js`. Note every engine investment in the diary.
- **The diary is the deliverable the owner reads.** Write DIARY.md as you go:
  what was built, engine investments, gotchas + fixes, the scorecard, links.

## Operating model — issue-driven, one stage at a time (DO THIS, don't skip)
The pipeline is NOT prose to self-police — it is a set of enforced work items. The failure
mode this prevents: rushing to a visible end-state (deployed + a short) while silently
skipping the hard creative stages (character art, rich levels, feel, music, videos).

**Step 0 — log the pipeline as issues on the game repo:**
```
node scripts/make-game-issues.mjs <owner/repo> --game-dir <dir>
```
This opens one GitHub issue per stage, each with a sharp ACCEPTANCE CRITERION (the bar),
and closes the stages GAME_META already marks `done`. Then:
- **Resolve the OPEN issues in order, ONE AT A TIME.** Finish a stage fully before the next.
- **Close an issue only with EVIDENCE that meets the bar** — a screenshot, the green
  scorecard, the live link, the playlist. Never self-declare a stage done by skimping.
- An open issue = an unfinished step the owner can see. The owner can also drop notes as
  issues; treat them as work items. Re-run the command anytime to re-sync.
- Update `GAME_META.stages` to `done` as each issue closes (the runner + this command read it).

## Build it with the runner — one command, observable
Drive the whole arc with the autonomous runner instead of running stages by hand:
```
node scripts/make-game.mjs "<Name>" [--spec spec.json] [--from <stage>] [--retries 2]
```
It executes the 11 stages with **checkpoints** (resume from `GAME_META.stages`),
**auto-retry**, **stop-on-fail** (+ a resume hint), and live **observability**: per-stage
checkmarks (`tools/lib/buildlog.mjs`), a rendered build board, and a generated `### Build
log` appended to DIARY.md. Mechanical stages invoke the tools below; credential-gated ones
skip cleanly when the secret is absent; creative stages (identity/levels/feel) verify you
authored the content. `--dry-run` to rehearse the orchestration.

## Where each capability lives (ENGINE-level — every game inherits these)
The tools are engine-level (operate on a game id/dir); a new game does NOT carry its own copies.
| Stage | Tool (engine) | Notes |
|---|---|---|
| scaffold | `scripts/new-game.mjs` | clone base · GitHub repo · hub register |
| gate | game `eval.mjs` + `tools/lib/mirth.mjs` | FUN (`Studio.Brawl.fun`) + optional funny gate (`Studio.Mirth`) |
| art | `tools/art.mjs` → `scripts/gemini.js` | themed backdrops/keyart per world; cached via `tools/lib/gencache.mjs` |
| music | `tools/music.mjs` → `lib/lyria.js` | Lyria loop per world (or procedural `Studio.Audio` fallback) |
| shorts | `tools/trailer/make-shorts.mjs` + `host-shorts.mjs` | mobile vertical feed, auto-wired (see ENGINE.md) |
| videos | `tools/record.mjs` + `tools/youtube-upload.mjs` | per-level MP4 → YouTube (YT_* secrets) |
| safety net | `tools/eval-all.mjs` | run the golden set + this game before merge |
Anything still scattered in a game repo is a migration target — lift it here and update this table.

## The pipeline (all stages must land; update GAME_META.json stages as you go)
1. **Scaffold** — `node scripts/new-game.mjs "<Name>" --local --tagline … --hero … --verb …`
   from the game-engine repo root (needs GH_TOKEN; creates + pushes the GitHub repo).
2. **Identity** — name, tagline, roster/hero defs, worlds list → GAME_META.json.
3. **Levels** — 5 themed levels/arenas as data (`src/game/levels.js`).
4. **Gate** — extend `eval.mjs` to the genre's win contract. The bar:
   **the eval must exercise the human path too, not just `?level=N` gameplay**:
   a menu smoke-test (Title → Select → Play + real keyboard movement, 0 page
   errors) — the autopilot boots straight into a level and will happily pass a
   game whose menus are broken (Phaser 4 does NOT bind plain-object scene config
   methods to the instance; put menu logic in `create()` closures). Beyond that:
   deterministic (two identical runs), the autopilot WINS every level, AND the
   run **maximizes fun, not perfection** — score the match/run with a felt-fun
   model (`Studio.Brawl.fun` pattern: action/flow/arc/closeness/variety) and
   gate on FUN ≥ 70. **Optional felt-gates compose** — e.g. a comedy game also
   gates on `Studio.Mirth.score(events)` (the funny gate: exaggeration/density/
   variety/timing/surprise, threshold ~65; canonical node scorer in
   `tools/lib/mirth.mjs`, tested). Invent new felt-gates the same way: a scorer in
   the SDK + a mirror in `tools/lib/`, the game emits the events, eval gates on it.
   Owner's standing rule: losing a few times is fine —
   comebacks beat sweeps; never gate on 0-death alone when a fun score fits the
   genre better. Non-black readback, BOTH renderers (webgl + canvas). Iterate
   with trace/autopsy tooling; for rng-driven genres, seed-scan (`scan.mjs`
   pattern) and bake the highest-FUN winning seeds into level data —
   determinism makes them reproducible forever. **Scan in headless**
   (`?r=headless`, `Studio._headless`): sim-only, no render pass, ~70x faster —
   a full multi-arena scan drops from hours to minutes, and the sim is
   byte-identical to a rendered run, so winning seeds reproduce exactly.
5. **Feel** — animation states on every actor, hitstop/shake/flash tuned, HUD.
6. **Art** — Gemini backdrops per world + title keyart via `tools/art.mjs`
   (GEMINI_SA_JSON). Bottom third must stay gameplay-clean. NO text in images.
7. **Music** — one Lyria loop per world + title via `tools/music.mjs`
   (Vertex lyria-002, GEMINI_SA_JSON project), mp3 loops in src/assets/music.
8. **Deploy** — Railway, one project per game:
   `env -u RAILWAY_TOKEN RAILWAY_API_TOKEN="$RAILWAY_TOKEN" railway init|up|domain`
   (the env token is an ACCOUNT token; the CLI misreads it as a project token
   under its default name). Then verify `/health`, `/api/meta`, `/api/diary`
   live, and confirm a headless page renders non-black off the live URL.
9. **Videos — the ultimate step, never skip.** `tools/record.mjs` renders each
   level's autopilot run to MP4 off the deterministic stepper with the level's
   music muxed in; build a montage; upload ALL of them to YouTube
   (`tools/yt-upload.mjs`, YT_CLIENT_ID/SECRET/REFRESH_TOKEN in env) and create
   the playlist (`tools/yt-playlist.mjs`). Links go into GAME_META.json
   (`videos` + `playlist`), the diary, and the hub registry. Also capture a few
   gameplay stills into `src/diary-shots/` and add a `screenshots` array (deployed
   URLs) to the hub registry entry — the hub detail shows a screenshot gallery and
   the diary embeds them. If a real playlist can't be created (the saved token may
   be upload-scoped only), that's fine — the hub falls back to the montage link
   (never the retired `watch_videos` endpoint).
10. **Loop closed** — register the game in `hub/games.json` (game-engine repo)
    with meta/stages/videos; push the game repo (main) AND the engine branch;
    final reply lists: repo · live URL · playlist · diary path.

## Conventions that keep it shippable
- All gameplay randomness through `Studio.RNG` (seeded) — never Math.random.
- All timing in fixed frames; visuals may tween (the stepper drives the clock).
- No persistent Phaser Graphics objects and no GPU filters when Containers are
  in the display list (this Phaser 4 build crashes); bake panels/strokes to
  textures (`BAKE_CARD` pattern). `Studio.Toon.bake` is idempotent — never
  re-bake textures live rigs are using.
- Snapshot contract keys for eval: x,y,vx,vy,frame,deaths,won,coins (+extras).
- `?level=N` is the engine's uniform level-jump contract (1-based; 100+N also
  accepted) — every game must honor it (the template does) so levels can be
  deep-linked and recorded distinctly. Don't gate it behind a clickable menu only.
- `?level=N` boots straight into gameplay for eval/recording; menus otherwise.
  PITFALL (cost a re-record): loading the level but STILL drawing the title menu
  on top films the menu, not the level. If a game has a level-select shell, gate
  the title on `mode !== 'play'` — the `?level` boot sets `mode='play'`, so the
  title is skipped and you start in-game. (Brawl/Toon template is already clean;
  the legacy `Studio.Game.boot` shell needed this fix in ember/nimbus.)
- A menu game must also expose `window.__game.gotoLevel(i)` (0-based): clear the
  menu, `mode='play'`, `loadLevel(i)`. The shorts recorder calls it as a belt-and-
  suspenders so a stale deploy still records the right level; it's a no-op (guarded)
  on template games where `?level` alone suffices.
- "Unlock all levels": a level-select shell should open EVERY card (set the
  selectable count to `LEVELS.length`), not gate behind progression — players and
  deep-links can jump anywhere. Keep the default cursor on the highest reached.
- Shorts subsystem (engine ability — see `docs/ENGINE.md` "The shorts subsystem").
  A new game gets the whole vertical-shorts feed for FREE; you just run two commands:
  ```
  node tools/trailer/make-shorts.mjs <id>     # records levels 1/3/5 off the LIVE
                                              # deploy, mobile-encoded (~2MB each)
  node tools/trailer/host-shorts.mjs <id>     # uploads to a GitHub Release AND wires
                                              # hub/games.json → then deploy the hub
  ```
  - **Auto-plan**: no per-game config needed (defaults to levels 1/3/5). To customize,
    add a `meta.shorts` block to the game's `hub/games.json` entry:
    `{ mode, levels, music:"assets/music/level-{l}.mp3", menuStart, platformer, skip }`.
  - The recorder honours `?level`, dismisses menus (`gotoLevel`/`menuStart`), muxes the
    game's music, and encodes mobile-small — all inherited. The player
    (`hub/public/shorts.html`) gives every game reliable iOS sound + buffering +
    variety with zero work.
  - VERIFY before hosting: grab a mid-clip frame per level (`ffmpeg -ss 14`) and
    confirm it shows GAMEPLAY (not a menu/title). A menu frame means the game's
    `?level` boot is gated wrong (see the `mode !== 'play'` rule above).

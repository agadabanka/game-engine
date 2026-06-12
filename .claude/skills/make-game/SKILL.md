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

## The pipeline (all stages must land; update GAME_META.json stages as you go)
1. **Scaffold** — `node scripts/new-game.mjs "<Name>" --local --tagline … --hero … --verb …`
   from the game-engine repo root (needs GH_TOKEN; creates + pushes the GitHub repo).
2. **Identity** — name, tagline, roster/hero defs, worlds list → GAME_META.json.
3. **Levels** — 5 themed levels/arenas as data (`src/game/levels.js`).
4. **Gate** — extend `eval.mjs` to the genre's win contract. The bar:
   deterministic (two identical runs), the autopilot WINS every level
   (0 deaths / flawless / plan-complete — genre-appropriate), non-black readback,
   BOTH renderers (webgl + canvas). Iterate with trace/autopsy tooling; for
   rng-driven genres, seed-scan (`scan.mjs` pattern) and bake authored seeds
   into level data — determinism makes a clean seed reproducible forever.
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
   (`videos` + `playlist`), the diary, and the hub registry.
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
- `?level=N` boots straight into gameplay for eval/recording; menus otherwise.

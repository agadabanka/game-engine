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
   **the eval must exercise the human path too, not just `?level=N` gameplay**:
   a menu smoke-test (Title → Select → Play + real keyboard movement, 0 page
   errors) — the autopilot boots straight into a level and will happily pass a
   game whose menus are broken (Phaser 4 does NOT bind plain-object scene config
   methods to the instance; put menu logic in `create()` closures). Beyond that:
   deterministic (two identical runs), the autopilot WINS every level, AND the
   run **maximizes fun, not perfection** — score the match/run with a felt-fun
   model (`Studio.Brawl.fun` pattern: action/flow/arc/closeness/variety) and
   gate on FUN ≥ 70. Owner's standing rule: losing a few times is fine —
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
- Shorts pipeline (engine ability): `tools/trailer/make-shorts.mjs <id|all>` records
  per-level vertical clips off the LIVE deploy (honors `?level`, muxes each game's
  real music), `host-shorts.mjs <id...>` uploads them as GitHub Release assets
  (`shorts` tag) and emits api.github.com asset URLs for the hub `/v` proxy. Record
  DISTINCT levels (1/3/5) and verify a mid-clip frame per level shows GAMEPLAY (not
  a menu) before hosting.

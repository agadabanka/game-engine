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
- **Animate characters from SPRITE SHEETS** (`tools/art-sprites.mjs`, nano-banana-pro):
  generate the run/walk as a **6-frame CYCLE in ONE image** so the legs visibly
  ALTERNATE (per-pose generation can't keep a cycle consistent — it reads as a
  HOP, not a run), plus an action-pose grid (idle/jump/fall/land/hurt/cheer). Slice
  by connected components, pack, and let `Studio.Hero` play them. Keep the procedural
  layer MINIMAL (a gentle lean only) — the bob/scissor lives in the art, so adding a
  big procedural bob double-bounces into a hop. `Studio.Toon` is the rig FALLBACK when
  no generated sheet is present. Be THOROUGH + specific in the Gemini prompt (exact
  grid, per-frame leg choreography, flat chroma-green background, no text).
- **Bring-your-own-art (optional — the image flow).** If the owner provides a character
  IMAGE (a drawing, sketch, or photo — kids' drawings are a great fit), seed the SAME
  sprite-sheet pipeline with it so the animation IS that art, not a redesign:
  `node tools/art-sprites.mjs <gameDir> --ref <image> --force` — the `--ref` flag makes
  the upload the hero IDENTITY reference (it replaces the generated model sheet). It is
  validated · sliced · packed exactly like generated art. This is the **`art-from-image`**
  skill; reach for it at the **character** stage whenever the owner hands you art (one
  image per character; for an enemy, generate it as the hero in a throwaway dir and copy
  the packed sheet into the enemy slot). It is also first-class in the Studio IDE (Art
  tool → "Make sprite sheet from my art"). Default stays text-described art — opt-in only.
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
- **Log engine changes for traceability + rollback.** After shipping engine
  changes, run `node scripts/engine-change-issues.mjs --since <ref>` — it logs each
  engine-code commit as a labeled GitHub issue on `agadabanka/game-engine` with the
  files, the commit, and the EXACT deterministic rollback (incl. re-propagating
  `studio.js` to consumer game repos), plus a pinned ledger. Print any one plan with
  `--rollback <sha>`. So "undo whatever was changed in the engine" is programmatic.
- **The diary is the deliverable the owner reads.** Write DIARY.md as you go:
  what was built, engine investments, gotchas + fixes, the scorecard, links.

## Operating model — issue-driven, one stage at a time, IN ORDER (DO THIS, don't skip)
The pipeline is NOT prose to self-police — it is a set of enforced, ORDERED work items. The
failure mode this prevents: rushing to a visible end-state (deployed + a short) while silently
skipping the hard creative stages (character art, rich levels, feel, music, videos).

**Step 0 — log the pipeline as issues on the game repo:**
```
node scripts/make-game-issues.mjs <owner/repo> --game-dir <dir>
```
> **Auth + where game tracking lives.** These scripts use **`GH_TOKEN`** (a PAT in the env) to hit
> `api.github.com` directly — so they create and write to the **GAME'S OWN repo** (any repo, NOT
> limited to one, and NOT dependent on any restricted MCP scope). **ALL game tracking — the stage
> issues, the pinned Build tracker, and notes→issues — lives on the GAME repo.** **Never write
> game-related issues or content to `agadabanka/game-engine`** — that repo is for ENGINE / SDK /
> tooling / skills only (engine-change traceability uses `engine-change-issues.mjs`, above).

This opens one GitHub issue per stage, each with a sharp ACCEPTANCE CRITERION (the bar), plus a
single **pinned "Build tracker" meta-issue** that always names the NEXT step; it closes the stages
GAME_META marks `done`. Then:
- **Don't choose the next stage from memory — ASK the repo.** Run
  `node scripts/make-game-issues.mjs <owner/repo> --game-dir <dir> --next`; it prints the ONE
  lowest-numbered open stage. That is the ONLY stage you may work on right now. (The pinned
  Build tracker shows the same 👉 NEXT pointer for the owner.) This is the ORDER GUARD — it's
  how you ensure the steps happen in order instead of jumping to the fun/visible ones.
- **Resolve the OPEN issues strictly in number order, ONE AT A TIME.** Finish a stage fully
  before the next. Never start a higher-numbered stage while a lower one is open.
- **Close an issue only with EVIDENCE that meets the bar** — a screenshot, the green
  scorecard, the live link, the playlist. Never self-declare a stage done by skimping. Then set
  `GAME_META.stages` to `done` and **re-run the command** (it closes the issue, advances the
  tracker's NEXT pointer, and flags any out-of-order completion).
- An open issue = an unfinished step the owner can see. The owner also drops **notes in-game**
  (Pause → 📝) and **every note auto-becomes a GitHub issue** — the server (`POST /api/notes`)
  promotes it when `NOTES_GH_REPO` + `NOTES_GH_TOKEN` are set in the Railway env (set these at
  deploy time, every game). Treat owner notes as first-class work items: investigate, fix, and
  close the issue with evidence. NEVER tell the owner to file an issue themselves.

**Private by default (standing owner rule):** every created game repo is PRIVATE. `new-game.mjs`
defaults to `--private`; only `--public` opts out. Shorts therefore host as Release assets via
`api.github.com` asset URLs (the hub `/v` proxy adds the auth token) — never jsDelivr/raw, which
can't read a private repo.

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
| art | `tools/full-art.mjs` (orchestrator) → `art.mjs`+`art-sprites.mjs`+`art-tiles.mjs`+`art-props.mjs` | backdrops/keyart · generated hero+enemy **sprite sheets** (model-sheet→keyed→packed) · clay **tile** materials · **props** — all from `GAME_META.art.{style,enemies,tiles,props}`, chroma-keyed, merged into one `sprites.js` manifest, cached via `gencache`. `Studio.Hero` renders the sprite or falls back to the `Studio.Toon` rig |
| music | `tools/music.mjs` (**Lyria 3 via the Gemini API**) | a Lyria track per world + title — `models/lyria-3-clip-preview:generateContent` with `responseModalities:[AUDIO]` (returns MP3) on the SAME `GEMINI_SA_JSON` that powers nano-banana-pro. **NOT** Vertex `lyria-002` (that path soft-denies — "Music generation failed, try modifying your prompt" — unless the GCP project is allow-listed). Procedural `Studio.Audio.bgm` chiptune is the in-engine fallback (no external file). |
| shots | `tools/shots.mjs <dir>` | per-level menu THUMBNAILS — boots the game's own server, drives the autopilot a couple seconds in, writes `src/assets/shots/level<N>.jpg`. `Studio.Shell.title` auto-loads them (convention `assets/shots/level<N>.jpg`) so the level-select shows real screenshots, not flat color. Commit + redeploy. |
| shorts | `tools/trailer/ship-shorts.mjs <id>` (record→host→wire→commit→push→verify, ONE program) — wraps `make-shorts.mjs` + `host-shorts.mjs` | mobile vertical feed. Use ship-shorts so the registry edit can never be left staged/uncommitted (the bug that left a game with no visible shorts). It pushes branch+main (auto-deploys the hub) and POLLS the live hub until the shorts appear. |
| videos | `tools/record.mjs` + `tools/trailer/yt-upload.mjs` | per-level landscape MP4 (music muxed) + montage → YouTube (YT_* secrets; write the refresh token to /tmp/yt-creds.json). Playlist needs the broader `youtube` scope — an upload-scoped token 403s, so fall back to the montage link. |
| safety net | `tools/eval-all.mjs` | run the golden set + this game before merge |
Anything still scattered in a game repo is a migration target — lift it here and update this table.

## Platformer engine reference (BUILD from this — don't rediscover it each time)
The level is DATA fed to `Studio.Level.build(scene, spec)`; it returns `{platforms, hazards, coins, enemies, spawn, goalX}`. Spec fields:
- `ground: [[x0,x1,mat], …]` — solid floor spans. The **gaps are the spans BETWEEN segments.**
- `walls: [{x,tiles,mat}]` — vertical steps (≤2 tiles so a hop clears them).
- `platforms: [{x,y,w,mat}]` — **FLOATING platforms** (real footholds at any height → verticality). They're added to the same `platforms` group, so the autopilot's `groundAt` probe lands on them like ground.
- `coins:[{x,y}]` · `enemies:[{x,patrol}]` (patrol = ± px) · `pads:[{x}]` (bounce-pads, handled in game.js) · `spawn:{x,y}` · `goal` · `sky` · `width` · `groundY` · `tile` · `height`.
- **Materials** (`Studio.Materials.table`): each has `{color, top, friction, deadly, ground}`. `Textures.kit` auto-bakes a `grad_<mat>` strip for EVERY table entry, so **add a game's palette to the table** (precedent: the "biome set (funded by Biome Bash)", "confection set (funded by Lovelump)"). A material with `deadly:true` routes its segment to the **hazards** group (overlap = death), NOT platforms.

**The autopilot is the gate (`Studio.Autopilot.platformer`)** — it must WIN every level 0-death, deterministically. It runs RIGHT and jumps when `onGround && (!safeGroundAhead || blockedRight || enemyAhead || hazardAhead)`. Its hop envelope (see `tools/lib/levelkit` PLATFORMER_RULES): **≈200px across, ≈3 tiles / ~138px up.** Design every world so the *critical path* stays inside that envelope, then it wins for free.

**Techniques that turn "flat ground + gaps" into rich, VARIED structure (the owner wants real variety — different mechanics AND structure per world, not recolors):**
- **Hazard = a jumpable gap with deadly visuals.** A `deadly` segment isn't in `platforms`, so the autopilot reads it as a gap and hops it; the player only dies on an under-jump. Recolor jumpable gaps as lava/water/thorn/fudge pools → real hazards, same 0-death path. Keep each ≤200px.
- **Verticality via floating `platforms`** — island chains, ascending ledges, descending staircases, sky-hops. Put footholds within the hop envelope and the autopilot climbs them; put bonus perches ABOVE the path for high coins + manual play.
- **Bounce-`pads`** launch to upper routes (vertical traversal + slapstick).
- **Per-world STRUCTURE, not just palette:** e.g. island-archipelago over water · up-and-over hedge climb · cascading descent over a fudge river with pads back up · airy cloud-to-cloud hopping. Vary hazard type, foothold rhythm, enemy/pad density, and the vertical profile so each world *plays* differently.
- **If the structure you want needs a smarter gate, EVOLVE the autopilot** (it's engine code in `studio.js`) — e.g. explicit hazard look-ahead, foothold-seeking, climb-to-ledge — keep it deterministic (no `Math.random`, fixed frames) and re-verify 0-death across all golden games. A richer autopilot is a reusable engine win, not a per-game hack.
- **The landing-settle guard (proven fix for "autopilot overshoots a pit and dies").** After an enemy-hop / pad-launch / wall-hop, the autopilot can fire a *spurious jump on the very frame it lands* (the foot-probe reads stale before the body settles) → an oversized arc that sails over the next edge into the void. Fix in the game's `update()`: on touchdown (`onGround && wasAir`) set a 2–3 frame `landCool`; suppress the autopilot jump while `landCool > 0`. Also: keep **one kinetic feature (enemy/pad/wall) per ground segment** with a safe runway before the next pit, and note that **physical step-walls** are the most fragile primitive for this AI (a wall-hop landing on an adjacent enemy chains badly) — prefer bridging stepping-stones over wide gaps. Always **per-frame-trace** a 0-death failure (`window.__trace` / snapshot `x,y,vy,onGround` + the probe) before guessing — it shows the exact takeoff/landing.
- **Character/visual decoupling:** the physics body is invisible; a separate visual sprite follows it; squash-and-stretch scales the VISUAL only — never the body — so collision/sensing stay rock-stable.
- **Determinism:** never `Math.random`; gate gags/variation on counters (`coins%2`) or `Studio.RNG`. Lint every level with `lintLevel` before gating (gaps ≤200, walls ≤2 tiles & ≥200px from gaps, spawn/goal/enemy on ground).

## Mechanics SPEC + build levels in STEPS (for skill-demanding genres — Celeste-likes)
The stock autopilot (`Studio.Autopilot.platformer`) is a *dumb* solver — "move right, jump when blocked/gap/enemy" — and every `Studio.Mechanics` contraption is engineered "**autopilot-transparent**" so that dumb bot still wins. That's a great shipping guarantee for runner-platformers, but it **caps mechanical depth at what a move-right bot can do** — the opposite of a precision game whose levels *require* chaining tech (dash→wall→jump). When the concept needs real depth, use this pipeline instead of the stock one:
- **The mechanics SPEC is the missing input.** "Clone Celeste" underspecifies the game; `node tools/deconstruct.mjs <dir>` writes **`mechanics.json`** — the six load-bearing parts: **verbs+tuning · tech/chains (the depth) · contraptions · room-grammar · curve · failure-model** (`tools/lib/mechspec.mjs`, genre templates). A human edits the numbers / adds game-specific tech. Every later step reads it.
- **Build levels in STEPS, not as one monolith.** A level = an ordered list of single-screen **rooms** (`tools/lib/rooms.mjs`); author one room, verify it, then the next. Each room declares an `idea` (the verb it teaches/demands).
- **The verb-aware SOLVER is the new gate.** `tools/lib/solver.mjs` forward-simulates the hero (`tools/lib/platforming.mjs` — the shared movement core, configured from the spec) between footholds to (a) prove a room solvable **with the declared verbs incl. dash/wall-jump chains**, (b) report which verbs are **load-bearing** (remove one → unsolvable, i.e. the room genuinely *requires* the dash — the depth a dumb gate can't certify), (c) score tightness/difficulty, and (d) **emit the autopilot path** the game replays — so verification and the gate are the same act, and the painful hand-tuning of waypoints is automated. `chainRooms(rooms, spec)` stitches verified rooms into a renderable+gateable level.
- **What's still scoped:** the solver covers run/jump/dash/wall-jump/**spring** + spikes; richer contraptions (dream-block/bumper/mover) are the **contraption-registry** follow-up — each contraption needs (a) runtime behavior, (b) a solver model, (c) an authoring builder. Add models as you add gadgets.
- **Retrofit an EXISTING game** (not just new ones): `node tools/upgrade-mechanics.mjs <dir> [--write]` (or the **`/upgrade-mechanics`** skill) ensures the spec, adapts the game's levels (`tools/lib/leveladapt.mjs` reads the solids format + the stock DSL), solver-audits each, and writes `MECHANICS-AUDIT.md` — telling you which levels have *required* depth vs. garnish. Audit read-only first; `--write` to save + deepen thin levels with new rooms.

## Beyond platformers — the RHYTHM / DANCE genre (engine support)
Not every concept is a runner. A **dance/rhythm game** keeps the engine's shell · mobile/Scale.FIT ·
menu/song-select · deploy · notes loop · art-sprites · **Lyria music** · backdrops · shorts/videos —
but **replaces the platformer Play scene with a custom scene**, because the 0-death autopilot doesn't apply.
- **`Studio.Rhythm`** is the genre core: `Studio.Rhythm.attach(scene, { bpm, onBeat })` → a beat clock that
  fires `onBeat(n)`, tracks `.phase`/`.beat`, **judges taps** (`.tap()` → `perfect|good|miss` by distance to
  the nearest beat), and keeps `.score`/`.combo`/`.bestCombo`. **`Studio.Juice.confetti(scene)`** is a festive
  pool (`.burst(n,x,y)` + `.rain()` + `.update()`). Dancers are normal sprite-sheets — cycle expressive
  action-pose frames (cheer/jump/idle) on each beat + a phase-driven bob.
- **"Levels" = songs**: each a Lyria track (per-world prompt) + a backdrop + a BPM. `?level=N` picks the song.
- **SYNC taps to the actual audio, not wall-time.** A naive beat clock keyed off `scene.time.now` drifts from
  the music (play-latency) and a *guessed* BPM makes it worse — taps feel "off." So: (1) **measure** each mp3's
  real tempo **and** the offset to its first downbeat (decode PCM → energy-onset envelope → autocorrelation,
  fold to 90–150 BPM); Lyria clips are rarely the BPM you asked for (one tagged 96 was really 129). (2) Pass
  `Studio.Rhythm.attach(scene, { bpm, offset, onBeat, clock })` where `clock()` returns the live audio position
  in ms (`music.seek*1000`) with a **scene-time fallback** (`scene.time.now - t0play`) so headless recording
  still animates. Then PERFECT = on the beat you *hear*. Make a PERFECT feel special (shockwave rings + spark
  burst + flash), per playtest notes.
- **The gate is a RHYTHM SMOKE** (not 0-death): all songs boot (`__ready`), the beat clock advances, taps
  score, the menu/song-select works, **0 page errors**. Parity's ≥mechanics/≥enemy-kinds are platformer-specific —
  N/A; document the adaptation in the diary and close the gate stage on the smoke evidence.
- **Videos**: the deterministic `record.mjs` stepper doesn't fit a real-time scene — capture with Playwright
  `recordVideo` for ~12s/song and mux the song mp3 (the canonical bollywood-beats recorder). Shorts: convert to
  blurred-fill 1080×1920, host on the Release, register via the hub `/api/games` shorts field.
_(Precedent: **Bollywood Beats** — two dancers, 3 Lyria songs, festive backdrops, built on `Studio.Rhythm`.)_

## The pipeline (all stages must land; update GAME_META.json stages as you go)
1. **Scaffold** — `node scripts/new-game.mjs "<Name>" --local --tagline … --hero … --verb …`
   from the game-engine repo root (needs GH_TOKEN; creates + pushes the GitHub repo).
   Clones the **rich base** `engine/game-template` — already fullscreen + mobile +
   menued + art-ready (shell · Scale.FIT/full-bleed · touch · HUD/world-select · the
   `Studio.Mechanics` runtime + a sample · `Studio.Enemies` · manifest-driven `Studio.Hero`).
2. **Identity** — name, tagline, roster/hero defs, worlds list → GAME_META.json.
3. **Levels + the DESIGN TOOLKIT** — 5 themed levels (`src/game/levels.js`), built
   with the engine's analytics (`tools/lib/*`, all unit-tested). These are STANDING
   steps — the difference between a rich game and a shallow one — and map 1:1 to the
   finer pipeline stages (`scripts/make-game-issues.mjs`):
   - **Design** `tools/design-pass.mjs` — per-level FUN (engagement/dynamics/arc/flow)
     + interest sparklines + intent → DESIGN.md/`src/design.json`; no level dead-air.
   - **Story** `tools/story.mjs --write` — premise/protagonist/named antagonist/per-
     world beats → STORY.md + `src/story.json` (SHELL beats → intro cards · title arc).
   - **Cast** `tools/lib/cast` — a named roster (hero + per-world adversaries + boss),
     each a role + look + personality → CAST.md (drives the art pipeline + HUD portraits).
   - **Mechanics** — teach ONE signature verb per level (`Studio.Mechanics`: conveyor/
     dashpad/crumble/one-way/updraft/lowgrav/spring) placed via the builders
     (`tools/lib/builders`, `signatureFor`) ramped by `tools/lib/difficulty`.
   - **Fun-tune** `tools/fun-max.mjs --write` — hill-climb each level's FUN under the
     0-death safety proxy, then RE-GATE. Keep coins reachable (`tools/lib/reach`).
   - **Narrative** `tools/lib/narrative` — map every used primitive → the world's
     fiction → NARRATIVE.md (none generic; "void replaces the pit").
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
   **AND the PARITY GATE** (`node tools/parity.mjs <dir>`) must pass — it fails the
   build (exit 1) if the game lacks a menu, mobile Scale.FIT + full-bleed, touch, real
   art, ≥3 distinct mechanics, ≥2 enemy kinds, or a story. Run it alongside `eval.mjs`.
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
6. **Art** — one command: `node tools/full-art.mjs <dir>` (orchestrates backdrops +
   title keyart + hero/enemy sprite sheets + clay tiles + props from `GAME_META.art`,
   chroma-keyed + packed into `sprites.js`, `gencache`d). GEMINI_SA_JSON. Bottom third
   stays gameplay-clean; NO text in images. `Studio.Hero` auto-prefers the generated sheet.
7. **Music** — a Lyria track per world + title via `tools/music.mjs`
   (**Lyria 3 via the Gemini API** — `lyria-3-clip-preview:generateContent`, returns MP3;
   NOT Vertex `lyria-002`, which soft-denies). mp3 loops in src/assets/music; the game prefers
   the world's mp3 and falls back to the procedural `Studio.Audio.bgm` chiptune.
8. **Deploy** — Railway, one project per game:
   `env -u RAILWAY_TOKEN RAILWAY_API_TOKEN="$RAILWAY_TOKEN" railway init|up|domain`
   (the env token is an ACCOUNT token; the CLI misreads it as a project token
   under its default name). Then verify `/health`, `/api/meta`, `/api/diary`
   live, and confirm a headless page renders non-black off the live URL.
   - **ALWAYS attach a persistent volume** so in-game notes survive redeploys
     (the server writes `/api/notes` to `RAILWAY_VOLUME_MOUNT_PATH`, else an
     EPHEMERAL container dir — without a volume, every redeploy WIPES the
     owner's notes, which violates "don't lose changes"):
     ```
     railway link -p <game> -e production -s <game>   # link the service first
     railway volume add -m /data                       # Railway sets RAILWAY_VOLUME_MOUNT_PATH=/data
     railway redeploy --yes                            # mount it
     ```
     Verify with `railway volume list` (Attached to: <game>, Mount path: /data).
   - **Wire notes → issues** so in-game notes auto-become GitHub issues (the server
     promotes each `POST /api/notes`): set `NOTES_GH_REPO=<owner/repo>` and
     `NOTES_GH_TOKEN=<PAT with issues:write>` in the Railway env
     (`railway variables --set … --skip-deploys`; pipe the token via `--set-from-stdin`).
9. **Videos — the ultimate step, never skip.** `tools/record.mjs` renders each
   level's autopilot run to MP4 off the deterministic stepper with the level's
   music muxed in; build a montage; upload ALL of them to YouTube
   (`tools/yt-upload.mjs`, YT_CLIENT_ID/SECRET/REFRESH_TOKEN in env) and create
   the playlist (`tools/yt-playlist.mjs`). Links go into GAME_META.json
   (`videos` + `playlist`), the diary, and the hub registry. Also capture a few
   gameplay stills into `src/diary-shots/` (use `tools/diary-shots.mjs <game-dir>`:
   it boots the game, runs autopilot, taps **on-beat** via a `__beatPhase` hook so the
   frame catches the celebratory flourish, and writes full 960×540 frames via the
   **compositor** screenshot — WebGL canvases read back black through `toDataURL`) and
   add a `screenshots` array (deployed URLs) to the hub registry entry — the hub detail
   shows a screenshot gallery and the diary embeds them via `![](src/diary-shots/…)`. If a real playlist can't be created (the saved token may
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
  A new game gets the whole vertical-shorts feed for FREE. Prefer the ONE-command
  shipper so the flow can never be left half-done (the bug that left a game with no
  visible shorts: the registry edit sat staged-but-uncommitted):
  ```
  node tools/trailer/ship-shorts.mjs <id>     # record → host (GitHub Release) → wire
                                              # hub/games.json → commit → push branch+main
                                              # (auto-deploys hub) → POLL hub till shorts live
  ```
  (The underlying steps `make-shorts.mjs <id>` + `host-shorts.mjs <id>` still exist if
  you need to run them piecemeal; ship-shorts just guarantees the loop closes.)
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

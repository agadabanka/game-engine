// scripts/engine-upgrade-issues.mjs — log the "bring the deployed games' richness into the
// ENGINE base" epic as fine-grained, ordered issues on agadabanka/game-engine.
//
// WHY: make-game scaffolds from engine/game-template/ — a 2-file stub (game.js + levels.js).
// The richness the earlier games accumulated (deepfin's ~30 src/game files: scenes/, art.js,
// assets.js, elements.js, themes.js, design.js, levelgen.js, feelmodel.js, reach.js, evolve.js,
// uistate.js, …) was never lifted back into the template/SDK. So every new game starts near-zero
// and the coarse 13-stage pipeline can't rebuild it. This epic lifts that capability into the
// engine so EVERY future game inherits a real shell, mobile/touch, real art, and rich levels.
//
// Each issue: a sharp ACCEPTANCE bar + the deepfin reference to copy from. Idempotent (matches by
// an [eng:<key>] marker), grouped by label, with a pinned epic tracker. Then we work them in order.
//   node scripts/engine-upgrade-issues.mjs            (needs GH_TOKEN)
//   node scripts/engine-upgrade-issues.mjs --next     (prints the next open issue to work)
import process from 'node:process';

const REPO = 'agadabanka/game-engine';
const GH = process.env.GH_TOKEN;
const NEXT = process.argv.includes('--next');
if (!GH) { console.error('needs GH_TOKEN'); process.exit(2); }

const D = 'out/golden/deepfin/src/game';   // the gold-standard reference root (local)

// GROUPS: [label, colour, blurb]
const GROUPS = {
  shell:    ['eng:shell',    '8957e6', 'Boot→Title→Play→UI scenes, menu/level-select, story cards, pause, win/lose, in-game links, notes'],
  mobile:   ['eng:mobile',   '2bb6a6', 'responsive scale, full-bleed CSS, on-screen joystick/d-pad, backdrop cover'],
  art:      ['eng:art',      'ff8fc8', 'real generated character + enemy sprites, themed tiles/props/parallax, asset manifest'],
  level:    ['eng:level',    'ffd166', 'mechanic library, enemy archetypes, feel model, reachability, design loop, difficulty curve'],
  story:    ['eng:story',    'ff7b3a', 'design + story/campaign stages: design-intent, narrative beats, world map, ending'],
  pipeline: ['eng:pipeline', '4cc9f0', 'restructure the make-game pipeline: finer stages, parity gate, richer base template'],
};

// ISSUES: { group, key, title, gap, accept, ref }
const ISSUES = [
  // ── A · SHELL & NAVIGATION ───────────────────────────────────────────────
  { group: 'shell', key: 'scene-framework',
    title: 'SDK scene framework: Boot → Title → Play → UI (not one Play scene)',
    gap: 'The template runs a single `Play` scene that boots straight into a level. Deepfin runs four scenes (Boot bakes assets, Title is the menu, Play is gameplay, UI is the HUD/overlay layer) wired in `main.js`.',
    accept: 'The SDK exposes a reusable multi-scene shell (Boot/Title/Play/UI) a game opts into; the template uses it by default; `?level=N` still boots straight to Play for eval/recording. A game with no menu code still gets Title+UI for free.',
    ref: `${D}/main.js, ${D}/scenes/{Boot,Title,Play,UI}.js, ${D}/uistate.js` },
  { group: 'shell', key: 'title-select',
    title: 'Title scene with world/level select (cards + thumbnails, unlock-all)',
    gap: 'No title/level-select exists. Deepfin Title shows clickable world cards with thumbnails, keyboard 1-5 + mouse nav, a feature-line per world, and persists choice via ?level.',
    accept: 'A reusable Title/Select reads the game’s worlds/levels and renders selectable cards (with a thumbnail per level, captured by the recorder), opens EVERY level (unlock-all), keyboard+mouse+touch navigable, starts the chosen level.',
    ref: `${D}/scenes/Title.js (lines 19-158)` },
  { group: 'shell', key: 'intro-cards',
    title: 'Story intro-card system (per-level non-blocking beat)',
    gap: 'No story surface at all. Deepfin shows a non-blocking intro card per fresh level entry: "WORLD N", level name, and a one-line story beat from a BEATS map (not on death-retry).',
    accept: 'The SDK has `Studio.IntroCard`/equivalent: given {world,n,name,beat} it fades a card in/hold/out over gameplay, shown once per fresh entry. Beats come from a per-game story map (see story stage).',
    ref: `${D}/scenes/Play.js (BEATS dict + intro card, ~lines 162-182)` },
  { group: 'shell', key: 'pause-menu',
    title: 'Pause menu (resume · controller · leave-note · diary · exit-to-menu)',
    gap: 'No pause/menu. Deepfin UI has a pause button → overlay with RESUME, controller toggle, leave-a-note, diary link, exit-to-menu.',
    accept: 'A reusable pause overlay (P/ESC and an on-screen button) with resume / controller-toggle / leave-note / diary / exit-to-menu. Deterministic; does not break the eval (paused state is a no-op under the stepper).',
    ref: `${D}/scenes/UI.js (pause + makeOverlay, ~lines 247-452)` },
  { group: 'shell', key: 'win-lose',
    title: 'Win / lose overlays with rank + stats + next-level',
    gap: 'Win just sets a flag; there is no end screen, rank, stats, or next-level UI; final-level "campaign complete" is absent.',
    accept: 'Reusable Win/GameOver overlays: rank (S/A/B/C/D) from the run, stat rows (score/coins/time/…), NEXT▶ / RETRY / EXIT-TO-MENU, and a CAMPAIGN COMPLETE state on the last level.',
    ref: `${D}/scenes/UI.js (showWin/showGameOver, ~lines 369-415)` },
  { group: 'shell', key: 'hud-layer',
    title: 'HUD as a reusable UI layer (pills: score/coins/time/lives)',
    gap: 'The template hacks a text HUD into Play. Deepfin has a dedicated UI scene with score/coins/time/hearts pills + a mute button.',
    accept: 'A reusable HUD component (separate UI scene/overlay) showing the game’s tracked stats as pills, plus a mute toggle; a game declares which stats it tracks.',
    ref: `${D}/scenes/UI.js (HUD, ~lines 8-33)` },
  { group: 'shell', key: 'inapp-links',
    title: 'In-game links + server routes for /diary /build /design',
    gap: 'A new game has no in-game way to reach the builder, diary, or design lens. Deepfin Title + pause link to /diary.html /build.html /design.html, served by server.js.',
    accept: 'The shell surfaces links to /diary, /build (level builder), /design; the base server serves those pages; the builder + diary pages ship in the template (today only a stub exists).',
    ref: `${D}/../server.js, ${D}/../index.html, deepfin src/{diary,build,design}.html` },
  { group: 'shell', key: 'uistate-machine',
    title: 'uistate machine + eval coverage of the menu/human path',
    gap: 'No validated scene-state machine. Deepfin has `uistate.js` (boot→menu→play⇄pause→won) and the eval should exercise Title→Select→Play via real input (today the autopilot boots straight in and can pass a game with broken menus).',
    accept: 'A `Studio` state machine validates transitions; the eval gates a menu smoke-test (Title→Select→Play with real keyboard/touch, 0 page errors) in addition to the autopilot.',
    ref: `${D}/uistate.js` },
  { group: 'shell', key: 'leave-note',
    title: 'In-game leave-a-note → /api/notes → diary/issues loop',
    gap: 'The owner asked "no link to builder, diary or anything I can look at". Deepfin lets a player drop a pinned note in-world from the pause menu, POSTed to /api/notes, surfaced in the diary and the notes→issues loop.',
    accept: 'From pause, "leave a note" places a world-pin + text, POSTs to /api/notes (base server route), shows in /diary; wired to the existing notes→issues tooling.',
    ref: `${D}/scenes/UI.js (notes, ~lines 269-347)` },

  // ── B · MOBILE / FULLSCREEN / TOUCH ──────────────────────────────────────
  { group: 'mobile', key: 'scale-fit',
    title: 'Bake Phaser Scale.FIT + autoCenter into the template/SDK config',
    gap: 'Lovelump/template hard-code `width:960,height:540` with NO scale config → "oddly positioned, does not resize". deepfin/grovekeep/roadwar-iso all use `scale:{mode:Phaser.Scale.FIT, autoCenter:CENTER_BOTH}`.',
    accept: 'The template Phaser config (and SDK boot) include `scale:{mode:FIT, autoCenter:CENTER_BOTH, width, height}`; the canvas letterboxes/centres on any viewport. Verified on a phone-sized viewport.',
    ref: `${D}/main.js (lines 36-39); out/golden/grovekeep/src/vendor/studio.js (~line 2397)` },
  { group: 'mobile', key: 'fullbleed-html',
    title: 'Full-bleed index.html (viewport-fit=cover, 100dvh, touch-action:none)',
    gap: 'The template index.html has only `width=device-width, initial-scale=1`. Deepfin uses `viewport-fit=cover, user-scalable=no`, `100dvh`, fl/exbox centring, `touch-action:none`, `-webkit-tap-highlight-color:transparent`.',
    accept: 'The template index.html matches deepfin best-practice (notch-safe, no pinch-zoom, fills 100dvh, no browser gesture interference).',
    ref: `${D}/../index.html (lines 3-24)` },
  { group: 'mobile', key: 'touch-controls',
    title: 'Reusable on-screen joystick + d-pad module in the SDK',
    gap: 'Lovelump has keyboard only → no way to play on a phone ("I do not see the joystick"). Deepfin has a switchable analog joystick / d-pad in its UI scene: multi-touch, localStorage preference, visual press feedback.',
    accept: '`Studio.Touch.create(scene,opts)` adds an analog joystick (+ optional action buttons) or d-pad, switchable + persisted, multi-pointer, with input-viz; feeds the same input object the manual path reads. Shown on touch devices, hidden otherwise.',
    ref: `${D}/scenes/UI.js (_buildJoystick/_buildDpad/switchController, ~lines 106-219)` },
  { group: 'mobile', key: 'backdrop-cover',
    title: 'Responsive backdrop cover (scene.scale, not a hard-coded ×1.15)',
    gap: 'Lovelump sizes its backdrop `setDisplaySize(width*1.15, height)` so it does not fully cover ("level screen does not fully cover the background"). `Studio.Backdrop` already uses scene.scale; the image path must too.',
    accept: 'Backdrop images cover the full (resizable) canvas via `scene.scale.width/height` with proper aspect-fill; verified no gaps on a portrait + landscape viewport.',
    ref: `out/golden/grovekeep/src/vendor/studio.js (Studio.Backdrop, ~lines 346-358); /home/user/lovelump/src/game/game.js (lines 92-98)` },
  { group: 'mobile', key: 'touch-input-contract',
    title: 'Wire touch input into the input/eval contract',
    gap: 'The eval only drives keyboard + the autopilot; touch is unverified. Touch must feed the same input the autopilot/manual path consumes.',
    accept: 'Touch joystick state maps to {left,right,jump,…}; the eval includes a touch smoke-test (a simulated drag/tap moves the hero) with 0 errors.',
    ref: `${D}/scenes/UI.js (touch state → game input)` },

  // ── C · REAL ART PIPELINE ────────────────────────────────────────────────
  { group: 'art', key: 'character-sprites',
    title: 'Character sprite-sheet generator (Gemini, model-sheet-conditioned)',
    gap: 'tools/art.mjs only makes backdrops+title. Characters are procedural Studio.Toon rigs → the owner sees "SVG". Deepfin generates real hero sprite sheets (idle, run×8, jump, fall, fire) via gen-pearl.mjs conditioned on a locked model sheet.',
    accept: 'An engine generator produces a hero sprite sheet (idle/run/jump/fall/land + reactions) from GAME_META.art (style + a generated/locked model sheet), transparent PNG frames, cached; the game animates from frames.',
    ref: `out/golden/deepfin/scripts/gen-pearl.mjs; ${D}/assets.js (preloadHero)` },
  { group: 'art', key: 'enemy-sprites',
    title: 'Enemy sprite generator (an on-model "army" + boss + tint variants)',
    gap: 'Enemies are procedural blobs. Deepfin has 8 bot chassis + a boss, Gemini-generated on a cohesive style sheet, with per-biome tint variants.',
    accept: 'A generator produces N enemy sprite sheets (walk frames) + a boss from an "army" description + the locked style, plus deterministic tint variants; frame metadata emitted.',
    ref: `out/golden/deepfin/scripts/gen-pearl.mjs (enemy jobs); ${D}/assets.js (preloadEnemies, ~lines 74-102)` },
  { group: 'art', key: 'material-tiles',
    title: 'Themed material/tileset generator (bold-outline cartoon tiles)',
    gap: 'Ground is flat gradient slabs ("very flat"). Deepfin bakes 11 distinct materials (grass/stone/metal/lava/wood/sand/coral/…) as cartoon tiles with outlines/rim-light, per-biome recolour.',
    accept: 'A generator (or richer `Studio.Textures` baker) produces themed top+fill tiles per material with bold outlines + style detail (cracks/rivets/glow/grain), recoloured per biome; levels reference them by material.',
    ref: `${D}/materials.js, ${D}/scenes/Boot.js (_matTile/bakeMaterials, ~lines 242-287), ${D}/themes.js` },
  { group: 'art', key: 'world-props',
    title: 'Themed world-prop generator (pipes/crates/decorations/hazard markers)',
    gap: 'No themed props/decorations — only ground+sky. Deepfin draws pipes, coins, crates, bushes, decorations, recoloured per biome.',
    accept: 'A generator/baker produces themed props (platforms decor, pipes/poles, collectibles, hazard markers, foliage) recoloured per biome; the level builder can place them.',
    ref: `${D}/scenes/Boot.js (procedural props), ${D}/elements.js` },
  { group: 'art', key: 'parallax-layers',
    title: 'Parallax background-layer generator (multi-depth)',
    gap: 'Backdrop is a single image. Deepfin composes parallax depth (sky/mountains/hills/clouds) per biome.',
    accept: 'A generator/baker yields 2-3 parallax layers per world (with scroll factors) for real depth; wired into the backdrop system.',
    ref: `${D}/scenes/Boot.js (hillRow/parallax); out/golden/grovekeep Studio.Backdrop layers` },
  { group: 'art', key: 'asset-manifest',
    title: 'Asset manifest + manifest-driven loader (no hard-coded frame tables)',
    gap: 'Deepfin hard-codes frame sizes per enemy in assets.js. The engine should emit a manifest (frames/w/h/variants) and load from it.',
    accept: 'The art pipeline writes `src/assets/manifest.json`; a reusable loader populates sprite/anim tables from it; adding art needs no code edit.',
    ref: `${D}/assets.js (ENEMY_SPRITES tables)` },
  { group: 'art', key: 'full-art-orchestrator',
    title: 'tools/full-art.mjs — one orchestrator (char→enemies→materials→props→backdrops→manifest)',
    gap: 'tools/art.mjs only does backdrops. Deepfin used 3 one-off gen-*.mjs scripts. There is no single "make all the art for this game" command.',
    accept: '`node tools/full-art.mjs <gameDir> [--char|--enemies|--world|--all]` runs the whole art pipeline from GAME_META.art, caches each piece, writes the manifest, and skips cleanly without GEMINI_SA_JSON.',
    ref: `tools/art.mjs; out/golden/deepfin/scripts/gen-*.mjs` },
  { group: 'art', key: 'art-cache',
    title: 'Cache expensive character/enemy generation (gencache)',
    gap: 'gencache only covers backdrops. Character/enemy gen is the most expensive call and must be content-addressed.',
    accept: 'Character/enemy/material generation is cached by (style, model-sheet, prompt, seed); re-running full-art is free when nothing changed.',
    ref: `tools/lib/gencache.mjs` },
  { group: 'art', key: 'sprite-rig-fallback',
    title: 'Loader prefers generated sprites, falls back to Studio.Toon',
    gap: 'A game should use real sprite art when present and the procedural rig only as a fallback — today it is rig-only.',
    accept: 'The character loader uses generated sprite sheets when the manifest has them, else the Studio.Toon rig; both honour the same state machine (idle/run/jump/fall/land).',
    ref: `/home/user/lovelump/src/game/characters.js, game.js (rig wiring)` },

  // ── D · LEVEL DESIGN & MECHANICS ─────────────────────────────────────────
  { group: 'level', key: 'element-library',
    title: 'Element library with interest weights + MDA feelings + placement rules',
    gap: 'levelkit has helpers but no curated taxonomy. Deepfin elements.js has 21+ elements, each with an interest weight (1-9), aesthetic, MDA feeling, placement guidance, AI-handling tag.',
    accept: 'An engine ELEMENT_LIBRARY (lifted from deepfin) lists every mechanic with interest/feeling/placement/AI-handling; the feel model + builders read it.',
    ref: `${D}/elements.js, ${D}/mechanics-invented.json` },
  { group: 'level', key: 'mechanics-runtime',
    title: 'Implement the mechanic RUNTIME in the SDK (springs, movers, crumble, conveyor, fire bars, dashpad, wind/updraft, ice, water, one-way, qblock/brick, rising hazard)',
    gap: 'Lovelump has gaps/pads/walls/one-enemy only. Deepfin runs ~20 playable mechanics. These are runtime behaviours, not just data.',
    accept: 'The SDK implements a library of reusable mechanics (each: data + physics behaviour + visual), opt-in per level; documented; deterministic; the autopilot can clear levels using them 0-death.',
    ref: `${D}/elements.js, ${D}/levelgen.js, ${D}/powerup.js` },
  { group: 'level', key: 'enemy-archetypes',
    title: 'Enemy archetypes: walker / flyer / boss / piranha + kinds + behaviours',
    gap: 'One walk-and-turn enemy. Deepfin has walker (6 kinds), flyer (6 kinds, sine bob), boss (multi-HP, phases), piranha (cyclic) — selectable, with kind-rotation by difficulty.',
    accept: 'An engine enemy-archetype system: archetype→kind→behaviour spec (patrol/fly/stompable/shielded/boss), kind-rotation helpers, a boss template; the autopilot handles each.',
    ref: `${D}/levelgen.js (DRONE_KINDS/FLY_KINDS, ~lines 28-66), ${D}/elements.js` },
  { group: 'level', key: 'signature-mechanic',
    title: 'Per-level signature-mechanic pattern (teach one new mechanic per level)',
    gap: 'All 5 lovelump levels use the same mechanics → "all alike and boring". Deepfin introduces ONE new mechanic per level via a `mechanic(k,c0,c1,t,seg)` callback.',
    accept: 'Builders accept a per-level mechanic callback; a documented pattern + helper for "introduce + ramp one signature mechanic per level"; a novelty/fatigue rule (first use +interest, repeat ×0.84).',
    ref: `${D}/levelgen.js (mechanic callback ~line 68), ${D}/level{,2,3,4,5}.js` },
  { group: 'level', key: 'difficulty-curve',
    title: 'Difficulty-curve helpers (ramp enemy density / gap width / hazard density)',
    gap: 'Lovelump has a fixed rhythm. Deepfin ramps enemy count 1→3, widens gaps, raises hazard density as progress t advances.',
    accept: 'Engine helpers `rampEnemies(t)`, `rampGap(seg)`, `rampHazard(t)` (and a late-climax placement rule) used by the builders; produces a rising difficulty arc.',
    ref: `${D}/levelgen.js (lines 34, 59, 75)` },
  { group: 'level', key: 'reach-model',
    title: 'Reachability model (coinReach / playReach)',
    gap: 'No reachability check — coins/rewards may be unreachable. Deepfin has reach.js (geometric jump/spring/mover reachability).',
    accept: 'Engine `reach.js`: coinReach/playReach flag unreachable rewards for the design loop + lint.',
    ref: `${D}/reach.js` },
  { group: 'level', key: 'feel-model',
    title: 'Feel model — interest-curve prediction (engagement/dynamics/arc/flow → fun)',
    gap: 'No felt-fun model for platformers. Deepfin feelmodel.js predicts a per-window interest curve from element placement and scores engagement/dynamics/arc/flow → fun, instantly in the editor.',
    accept: 'Engine feel model: `predict(level)`→interest curve, `score()`→FUN with the 4 components + an ideal-arc target; a tested node mirror (like mirth.mjs) the eval can gate on (FUN≥70).',
    ref: `${D}/feelmodel.js (INTEREST, predict, score, ~lines 9-67)` },
  { group: 'level', key: 'design-intent',
    title: 'Design-intent schema (MDA + Schell lenses, per level)',
    gap: 'Levels are bare code with no recorded intent. Deepfin design.js records per-level essence/fun(MDA)/mechanics/aesthetics/lenses/interest-curve/puzzle/twist for all 13 levels.',
    accept: 'An engine design-intent schema + a per-game DESIGN doc (essence, MDA aesthetics, signature mechanic+adversary, interest curve, core puzzle, lenses); the build reads it and the eval can check the shipped level matches.',
    ref: `${D}/design.js (DESIGN/FUN/LENSES, ~lines 1-259)` },
  { group: 'level', key: 'evolve-ops',
    title: 'Design loop: edit operators + critic + fallback',
    gap: 'No way to iterate a level. Deepfin evolve.js has applyOp (add/remove/relocate), a Gemini critique prompt, and a deterministic fallback chooser.',
    accept: 'Engine `evolve` module: deterministic edit ops + a critic prompt + a fallback heuristic that picks one fun-improving edit per loop.',
    ref: `${D}/evolve.js (applyOp/critiquePrompt/chooseFallback)` },
  { group: 'level', key: 'fun-max',
    title: 'Fun-max loop tool (gate-constrained hill-climb)',
    gap: 'No optimisation pass. Deepfin funmax iterates edit→re-score→0-death-gate→keep-if-better-else-rollback, lifting campaign fun 51→70.',
    accept: '`tools/fun-max.mjs <gameDir>`: hill-climbs levels by the feel model (and optional Gemini ground-truth), always re-running the 0-death gate, rolling back gate-breaking edits; writes the improved levels + an edit log.',
    ref: `${D}/funmax.js; out/golden/deepfin/tools/eval/` },
  { group: 'level', key: 'levelgen-builders',
    title: 'Procedural builders in the engine (buildLong / buildAscending / vertical-tower)',
    gap: 'Lovelump has one bespoke Track builder. Deepfin has reusable deterministic, gate-safe builders for different topologies (horizontal long, ascending climb).',
    accept: 'Engine builders (long/ascending/tower) — deterministic, gate-safe-by-construction, mechanic-callback-driven, lint-clean — usable by any game.',
    ref: `${D}/levelgen.js (buildLong/buildAscending)` },
  { group: 'level', key: 'autopilot-mechanics',
    title: 'Autopilot must clear the new mechanics 0-death (springs/movers/etc.)',
    gap: 'The gate autopilot only runs-right-and-hops. Rich mechanics (moving platforms, springs as traversal, one-ways, water) need an autopilot that can use them, or the gate cannot certify rich levels.',
    accept: 'The engine autopilot is extended (deterministically) to ride movers, use springs/updrafts, swim, take one-ways — verified 0-death across the golden set AND a rich new level using each mechanic.',
    ref: `engine/sdk/studio.js (Studio.Autopilot); ${D}/levelgen.js` },

  // ── E · STORY / DESIGN / CAMPAIGN (the missing front-half of the pipeline) ──
  { group: 'story', key: 'design-stage',
    title: 'A DESIGN stage + design-pass tool (MDA + lenses + interest curve, per-level FUN report)',
    gap: 'The pipeline jumps from identity → levels with no design thinking. Deepfin has design.js (13 levels × essence/MDA-fun/mechanics/aesthetics/Schell-lenses/interest-curve/puzzle/twist) and a design-pass tool that reports per-level FUN + dead-air. That discipline lives in one game, not the engine.',
    accept: 'Engine `tools/design-pass.mjs` (lifted from deepfin) reports per-level FUN (engagement/dynamics/arc/flow), the interest sparkline, weakest/strongest, dead-air flags; a per-game design-intent doc/schema is produced and read by the build. A DESIGN stage runs it before art/music.',
    ref: `${D}/design.js (DESIGN/FUN/LENSES), deepfin tools/eval/design-pass.mjs` },
  { group: 'story', key: 'story-beats',
    title: 'A STORY stage: premise + protagonist/antagonist + per-world beats → STORY.md + BEATS',
    gap: 'Identity asks name/hero/worlds but there is no STORY. Jazz/Deepfin/Starsweeper each wrote a rescue/journey arc with a protagonist, a named antagonist, and a one-line beat per world surfaced on the intro card.',
    accept: 'A STORY stage produces STORY.md (premise: who/what/why · protagonist arc · named antagonist/boss · 5 world beats) and a BEATS map the intro-card system (shell A3) consumes; the title surfaces the tagline + arc.',
    ref: `${D}/scenes/Play.js (BEATS); deepfin/jazz/starsweeper DIARY.md story arcs` },
  { group: 'story', key: 'campaign-arc',
    title: 'A CAMPAIGN stage: WORLDS struct + arc-shaping (calm open → late climax) + world map',
    gap: 'The pipeline never validates that the worlds form a rising arc. Deepfin shapes the arc (calms the opening, places the climax ~84% in) via merge.js/merge-levels.mjs and a WORLDS struct with per-world theme + narrative tag.',
    accept: 'Engine arc-shaping (lift `shapeArc`/merge) + a WORLDS schema (name/theme/tag/difficulty/boss); a CAMPAIGN stage validates the interest arc (calm ≤~10%, climax late) and produces the world-select layout (tags + thumbnails).',
    ref: `${D}/merge.js (shapeArc), ${D}/merged.js (WORLDS), ${D}/scenes/Title.js (WORLD_TAGS)` },
  { group: 'story', key: 'boss-template',
    title: 'A BOSS stage: a final antagonist + multi-phase boss-fight template + win contract',
    gap: 'No boss vocabulary. Deepfin/Jazz/Starsweeper climax on a named multi-phase boss (Warden of the Maw / Tin Tyrant / the Warden) with telegraphed phases — a different win-contract than "reach the goal".',
    accept: 'A reusable boss template (multi-HP, telegraphed phases, a beat-the-boss win contract) in the SDK; the gate certifies the boss is winnable (0-death/contract) and fun; victory/defeat + closure surfaced.',
    ref: `${D}/design.js (level 13 boss), ${D}/scenes/Play.js (boss)` },
  { group: 'story', key: 'cast-roster',
    title: 'Extend CHARACTER → a named CAST with roles + personality (enemies, NPCs, portraits)',
    gap: 'The character stage covers only the hero. Deepfin/BiomeBash/Grovekeep ship a named cast (crab/moray/.../the Warden; 20 named rootlings; a 17-state rig + live HUD mood portraits) — every actor is a character with a narrative role.',
    accept: 'A CAST schema (hero + named enemies/NPCs/boss, each a role + look + personality), the 17-state animation machine + HUD mood portraits in the SDK, and art generated per cast member (art C1/C2).',
    ref: `${D}/assets.js (cast), biome-bash/grovekeep DIARY.md (rosters), engine Studio.Toon` },
  { group: 'story', key: 'narrative-coherence',
    title: 'NARRATIVE coherence: map engine primitives → the game’s fiction (and validate it)',
    gap: 'New games can read like a re-skinned platformer. Starsweeper’s diary maps each primitive to the fiction ("void replaces the pit", "drone replaces the goomba") so it feels invented-for-world. The pipeline never asks for this.',
    accept: 'A NARRATIVE.md per game mapping each used primitive → its fiction, surfaced on /design; a check/flag that every mechanic + biome carries the world’s fiction (not generic).',
    ref: `starsweeper DIARY.md (primitive→fiction table), deepfin design.js` },

  // ── F · PIPELINE RESTRUCTURE ─────────────────────────────────────────────
  { group: 'pipeline', key: 'rich-base-template',
    title: 'Upgrade engine/game-template from a 2-file stub to a real base',
    gap: 'game-template/src/game is just game.js + levels.js. New games inherit nothing. It must ship the shell + scale + touch + manifest-driven assets so the BASE is rich.',
    accept: 'The template includes (via the SDK) the scene shell, Scale.FIT + full-bleed html, touch controls, the HUD/menu, manifest-driven assets, and a sample mechanic set — a new scaffold is fullscreen+mobile+menued+art-ready out of the box.',
    ref: `engine/game-template/; out/golden/deepfin/src` },
  { group: 'pipeline', key: 'finer-stages',
    title: 'Split the 13 coarse stages into the finer pipeline (≈ the stages above)',
    gap: 'The make-game pipeline’s "levels"/"character"/"art" stages are too coarse and got skimped. They must split (design → mechanics → level-build → difficulty/feel-tune; art-gen → rig-wire; + new shell/mobile/story stages).',
    accept: 'make-game-issues.mjs STAGES is expanded to the finer set with deepfin-referenced bars; the skill + runner updated; the pinned tracker reflects the new order.',
    ref: `scripts/make-game-issues.mjs; .claude/skills/make-game/SKILL.md` },
  { group: 'pipeline', key: 'parity-gate',
    title: 'A "parity checklist" gate: menu + mobile + touch + real art + N mechanics + M enemies + story',
    gap: 'Nothing fails a build for missing a menu, mobile scale, touch, real art, enough mechanics/enemies, or a story. That is how a shallow game shipped.',
    accept: 'An engine parity check (extend eval-all/visual-qa) verifies a game has: a working menu/human path, FIT scale + touch controls, generated character+enemy art, ≥K distinct mechanics, ≥E enemy kinds, and a story arc — and FAILS the build if not.',
    ref: `tools/eval-all.mjs, tools/visual-qa.mjs` },
  { group: 'pipeline', key: 'skill-scaffold-rich',
    title: 'Update make-game/new-game skills to drive the rich base + generators by default',
    gap: 'The skills describe stages but do not force the shell/mobile/art/mechanics work. They must scaffold from the rich base and run full-art + the design loop by default.',
    accept: 'The skills scaffold the rich template, run `tools/full-art.mjs` and the design/fun-max loop as standing steps, and document the finer stages + parity gate.',
    ref: `.claude/skills/{make-game,new-game}/SKILL.md` },
];

// ── runner ──────────────────────────────────────────────────────────────────
async function gh(route, method = 'GET', body) {
  const r = await fetch(`https://api.github.com${route}`, {
    method, headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'engine-upgrade' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && r.status !== 422) console.error(`  gh ${method} ${route} → ${r.status}`);
  return r.json();
}

// existing engine-upgrade issues by [eng:<key>] marker
const existing = {};
for (let page = 1; page <= 6; page++) {
  const list = await gh(`/repos/${REPO}/issues?state=all&per_page=100&page=${page}&labels=engine-upgrade`);
  if (!Array.isArray(list) || !list.length) break;
  for (const i of list) { const m = /\[eng:([a-z0-9-]+)\]/.exec(i.title + ' ' + (i.body || '')); if (m) existing[m[1]] = i; }
}

if (NEXT) {
  for (let n = 0; n < ISSUES.length; n++) { const it = ISSUES[n], iss = existing[it.key];
    if (!iss || iss.state === 'open') { console.log(`${n + 1}. [${it.group}] ${it.title}${iss ? `  (#${iss.number})` : ''}`); process.exit(0); } }
  console.log('ALL ENGINE-UPGRADE ISSUES CLOSED.'); process.exit(0);
}

// labels
await gh(`/repos/${REPO}/labels`, 'POST', { name: 'engine-upgrade', color: '5319e7', description: 'lift the deployed games’ richness into the engine base' });
for (const [, [label, color, blurb]] of Object.entries(GROUPS)) await gh(`/repos/${REPO}/labels`, 'POST', { name: label, color, description: blurb });

console.log(`\nengine-upgrade · ${REPO}\n`);
const rows = [];
for (let n = 0; n < ISSUES.length; n++) {
  const it = ISSUES[n];
  const body = `**${it.title}**  \n\`[eng:${it.key}]\`  ·  group: \`${GROUPS[it.group][0]}\`\n\n### Gap\n${it.gap}\n\n### Acceptance (the bar)\n${it.accept}\n\n### Reference (copy from the gold standard)\n\`${it.ref}\`\n\n_Engine-level: the fix lands in the SDK/template/tools so every future game inherits it. Work the epic in order; close with evidence._`;
  const title = `[${it.group}] ${it.title}  [eng:${it.key}]`;
  let iss = existing[it.key];
  if (!iss) iss = await gh(`/repos/${REPO}/issues`, 'POST', { title, body, labels: ['engine-upgrade', GROUPS[it.group][0]] });
  else await gh(`/repos/${REPO}/issues/${iss.number}`, 'PATCH', { body, labels: ['engine-upgrade', GROUPS[it.group][0]] });
  rows.push({ n: n + 1, ...it, number: iss.number, state: iss.state || 'open' });
  console.log(`  ${iss.state === 'closed' ? '✓' : '○'} #${iss.number} [${it.group}] ${it.title}`);
}

// epic tracker
const byGroup = {};
for (const r of rows) (byGroup[r.group] ||= []).push(r);
const next = rows.find((r) => r.state !== 'closed');
let trackerBody = `# 🏗️ Engine upgrade — bring the deployed games’ richness into the base\n\n`
  + `**Why:** make-game scaffolds from \`engine/game-template/\` — a 2-file stub. Deepfin’s ~30 src/game files (scenes, art pipeline, element library, feel model, design loop, …) were never lifted into the template/SDK, so every new game starts near-zero. This epic lifts that capability into the ENGINE so future games inherit a real shell, mobile/touch, real art, and rich levels.\n\n`
  + `Work **in order**, one at a time; close each with evidence. ${next ? `**👉 NEXT: #${next.number} — ${next.title}**` : '**✅ all done.**'}\n`;
for (const [g, [label, , blurb]] of Object.entries(GROUPS)) {
  const list = byGroup[g] || [];
  if (!list.length) continue;
  trackerBody += `\n### ${label} — ${blurb}\n` + list.map((r) => `- [${r.state === 'closed' ? 'x' : ' '}] #${r.number} ${r.title}`).join('\n') + '\n';
}
trackerBody += `\n_Regenerate / re-sync: \`node scripts/engine-upgrade-issues.mjs\`. Next step: \`--next\`._`;

let tracker = existing['epic'];
if (!tracker) tracker = await gh(`/repos/${REPO}/issues`, 'POST', { title: `🏗️ EPIC — engine upgrade (lift the games’ richness into the base)  [eng:epic]`, body: trackerBody, labels: ['engine-upgrade'] });
else await gh(`/repos/${REPO}/issues/${tracker.number}`, 'PATCH', { body: trackerBody });
if (tracker && tracker.node_id) {
  await fetch('https://api.github.com/graphql', { method: 'POST', headers: { Authorization: `bearer ${GH}`, 'User-Agent': 'engine-upgrade' },
    body: JSON.stringify({ query: `mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{number}}}`, variables: { id: tracker.node_id } }) }).catch(() => {});
}

console.log(`\n${rows.length} engine-upgrade issues across ${Object.keys(byGroup).length} groups.`);
if (next) console.log(`👉 NEXT: #${next.number} — ${next.title}`);
if (tracker && tracker.number) console.log(`📌 EPIC (pinned): https://github.com/${REPO}/issues/${tracker.number}`);

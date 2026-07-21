// Art plates for the Claystone pitch deck — one 16:9 background per slide.
// House style: premium tech-brand key art. Obsidian-slate ground, warm clay-amber
// glow + cool cyan blueprint light — "engineered from clay and light." No text in art.
// Text-heavy slides use DARK, mostly-empty plates so the overlaid HTML stays legible.

export const STYLE =
  'Cinematic, premium tech-brand key art. Deep obsidian-slate background, warm terracotta / clay-amber glow meeting cool cyan blueprint grid light. The feeling of something engineered from raw clay and light — molten clay cooling into precise, glowing machinery. Volumetric glow, soft depth, crisp painterly-but-clean digital illustration, awe-inspiring and modern. Absolutely NO text, NO words, NO letters, NO numbers, NO captions, NO labels, NO UI text anywhere.';

// A reusable suffix for slides carrying heavy text/tables — keep them dark & empty.
const DARK = ' The CENTER and lower two-thirds are calm, near-empty dark slate for a text overlay; a quiet dark band across the very top for a title. Minimal, abstract, lots of negative space, soft vignette.';
const TOPBAND = ' Keep a calm darker band across the top third for a title.';

export const JOBS = [
  // ——— Act I: problem & thesis ———
  ['cover', '16:9',
    'A hero shot: a single glowing brick/tablet of translucent clay-stone floating on a pedestal in a dark studio, its interior alive with a luminous cyan clockwork lattice and a fixed grid of tiny identical light-pulses ticking in perfect unison — a machine that runs the same way every time. Warm clay-amber rim light, cool cyan core. Grand, iconic, product-launch energy. Keep the upper third calm dark for a title.'],
  ['agenda', '16:9',
    'A clean architectural flat-lay seen from above: five glowing clay-and-cyan chapter-monoliths standing in a row on a dark grid floor, each a different height, connected by a thin luminous path — a roadmap of a journey. Calm and orderly.' + DARK],
  ['problem', '16:9',
    'A dramatic scene of chaos vs order: on the left, many ghostly game-worlds flickering and glitching, each replay landing DIFFERENTLY — divergent tangled light-trails scattering unpredictably, a red warning glow. A wall of uncertainty. Dark, tense, entropic.' + TOPBAND],
  ['thesis', '16:9',
    'One large glowing arcade "GO" button on a clay pedestal; the instant it is pressed a complete little game-world blooms out of it as a luminous bubble and immediately begins polishing/improving itself in a gentle self-repairing loop of light. Hopeful, powerful, single-press magic.' + TOPBAND],

  // ——— Act II: Claystone deep dive ———
  ['meet', '16:9',
    'A reveal shot of the Claystone engine as a beautiful cutaway object: a rounded slab of glowing clay-stone opened like a geode to show a spotless, minimal cyan mechanism inside — few parts, no clutter, obviously self-contained, nothing plugged into it from outside. Purity and zero-dependence made visual.' + TOPBAND],
  ['crown', '16:9',
    'THE crown jewel: a giant glowing metronome/escapement of cyan light over a dark stage, freezing a game-world one crisp frame at a time — a hand of light reaching in to advance a single identical tick, each tick perfectly cloned from the last. A seeded-RNG spiral of light feeds it. Precision, control of time, bit-exact repetition.' + TOPBAND],
  ['arch', '16:9',
    'A majestic exploded tier-stack: seven horizontal luminous strata hovering in dark space, stacked and slightly offset, each a glowing layer of a technology cross-section, thin cyan beams connecting each tier only to the one beneath it. A cathedral of layers.' + DARK],
  ['loop', '16:9',
    'A closed luminous ring of exactly-spaced identical light-pulses orbiting a dark core clock at a fixed cadence, a seeded spiral of deterministic sparks feeding in — fixed-timestep simulation as a perfect, unwavering heartbeat. Cyan and clay light.' + TOPBAND],
  ['physics', '16:9',
    'Glowing wireframe boxes (axis-aligned bounding boxes) resolving cleanly against a stepped platform of clay — one box passing UP through a one-way ledge of light and landing exactly on top, swept motion-trails showing crisp collision separation. Elegant, geometric, exact.' + TOPBAND],
  ['render', '16:9',
    'One game-world shown three ways side by side, fanned like cards: a bare invisible wireframe ghost (headless), a clean flat canvas painting, and a lush GPU-lit version glowing with bloom — the same scene, three renderers, one identical simulation underneath. Cyan-to-amber gradient.' + TOPBAND],
  ['fx', '16:9',
    'A gorgeous atmospheric game vista rendered in one declarative breath: volumetric godrays, drifting fog, rain streaks, a lightning flash, glowing point-lights casting long raycast shadows, a shimmering water line — all painted as luminous weather over a dark platformer silhouette. Rich, cinematic, painterly.' + TOPBAND],
  ['levels', '16:9',
    'A level being assembled out of pure DATA: glowing translucent data-cards and coordinate rows streaming in from the left and snapping into a solid playable platformer world of clay ledges, coins and a goal on the right — level-as-data materialising into geometry. Cyan grid, clay blocks.' + TOPBAND],
  ['editor', '16:9',
    'An AI ghost playthrough: a translucent luminous figure sprints an invisible instant test-run across a level the moment an edit is placed, leaving a bright predicted trail with a checkmark of light, while a floating law-book of glowing rules validates each block placement. Proof-carrying editing, as light.' + TOPBAND],
  ['eval', '16:9',
    'A robot QA gate made of light: an autopilot spark runs a level flawlessly and passes through a glowing pass/fail gateway that stamps a large cyan checkmark and "0 deaths" energy; a filmstrip recorder of light captures every frame beside it. Automated evaluation, triumphant and clean.' + TOPBAND],
  ['zerodep', '16:9',
    'A featherlight glowing clay tile floating effortlessly high, weightless, with almost nothing attached to it — contrasted with a distant heavy tangled ball of external chains sinking in shadow. Lightness and self-containment vs bloat. Mostly dark, minimal.' + DARK],

  // ——— Act III: comparison & rationale ———
  ['vs1', '16:9',
    'A calm symmetrical split-arena down the middle: LEFT a precise minimal cyan clockwork engine (exact, self-running), RIGHT a large mature glowing machine-city of many parts (broad, established), a soft luminous seam between them. A fair, respectful face-off.' + DARK],
  ['vs2', '16:9',
    'A weighing-scale of light in a dark hall balancing two glowing orbs — one a sharp exact cyan crystal (determinism / AI-fit), one a warm vast amber sphere full of community constellations (ecosystem / maturity) — held in honest balance. Thoughtful, editorial.' + DARK],
  ['whyworks', '16:9',
    'A single elegant keystone brick of glowing clay locking a soaring luminous arch into place — everything above it held up by one well-placed foundational piece. "Why the design works" as structural inevitability. Warm and reassuring.' + TOPBAND],

  // ——— Act IV: templates ———
  ['tpl-intro', '16:9',
    'A glowing master-template blueprint hovering over a clay press; from it, fresh identical game-world tiles stamp out one after another down a luminous conveyor, each ready-to-play — "hit new game and go." Fast, industrial, joyful.' + TOPBAND],
  ['tpl-box', '16:9',
    'An open glowing kit/toolbox of clay and cyan light, its compartments each holding a small luminous module-icon (a level builder, a gate, a recorder, a camera, a chat brain, a deploy rocket) — everything-in-the-box, neatly arranged. Inviting, generous.' + DARK],
  ['tpl-flavors', '16:9',
    'Three glowing template monoliths standing together on a dark grid — one warm amber (a cartoon run-and-gun bunny), one cool cyan crystalline (the determinism build), one balanced studio-grey — a family of three flavors of the same base. Clean product line-up.' + DARK],
  ['pipeline', '16:9',
    'A luminous assembly pipeline flowing left to right across dark space: a spark of an idea → a scaffolded world → an AI-gated checkmark → a deployed rocket to the cloud → little video-shorts and glowing analytics graphs flowing back around in a loop. One continuous river of light.' + TOPBAND],

  // ——— Act V: Rainbow Run ———
  ['rr-intro', '16:9',
    'A joyful hero shot of a chunky cheerful rainbow-striped creature with long floppy rainbow bunny-ears mid-leap across glowing rainbow-striped clay platforms, bright crayon-bold rainbow world, sparkles — but rendered with the same premium cinematic glow and a dark sky for a title. Bright, delightful, alive.' + TOPBAND],
  ['rr-worlds', '16:9',
    'A vast constellation of many small glowing biome-worlds floating in dark space — a sunny meadow, frost peaks, a lava foundry, clockwork towers, candy kingdom, an aqua reef, a haunted hollow, a cosmic rainbow — connected by a single luminous running path threading through them all. Epic scope.' + DARK],
  ['rr-art', '16:9',
    'A creative forge: on the left a glowing paintbrush/AI conjuring a bright rainbow character sprite-sheet frame by frame; on the right glowing musical waveforms and notes blooming into a soundtrack — art and music being generated by light. Warm, magical, generative.' + TOPBAND],
  ['rr-loop', '16:9',
    'Glowing sticky-notes (a player\'s in-game feedback) peel off a game screen, stream along a luminous arc into a funnel that turns them into neat glowing fix-tickets with checkmarks, which file themselves into an open glowing diary book. The notes-to-fixes-to-diary loop as flowing light.' + TOPBAND],
  ['rr-migration', '16:9',
    'A dramatic before/after of speed: a slow heavy amber hourglass draining over many minutes on the left, transforming into a single instantaneous blinding cyan flash on the right — the same work, minutes collapsing into one bit-exact second. Motion, acceleration, triumph.' + TOPBAND],

  // ——— Added: evaluation deep-dive + drag-drop editor ———
  ['why0death', '16:9',
    'A single unbroken, continuous ribbon of cyan light tracing one flawless path from a glowing start flag, across a gauntlet of spikes, pits and hazards, to a goal flag — not one break, not one gap in the line, a large calm checkmark of light glowing above it. Beneath, a faint safety-net of light that never has to catch anything. Proof of a clean, deathless run. Warm clay platforms, dark stage.' + TOPBAND],
  ['evals', '16:9',
    'A dark control-room panel of several distinct glowing instruments side by side, each measuring a different quality of a small game-world hovering in the middle: a pass/fail gate, a glowing heart-meter (fun), a filmstrip recorder, a watching eye/lens, a compare/diff scale, and a live graph of player heat-dots. A row of different evaluators, each a different shape of light. Cyan and clay.' + DARK],
  ['editor-dragdrop', '16:9',
    'The Incredible Machine toybox moment: a frozen game-world with a collapsible glowing parts-tray drawer along the bottom edge holding little luminous part-icons; a hand/finger lifts one glowing part out of the tray and a translucent preview of it follows, snapping onto a bright grid with a green "legal" glow, while a faint ghost trail of light replays the level to prove the placement works. Drag-and-drop level building, as light. Warm clay blocks, cyan grid.' + TOPBAND],

  // ——— Added: the platform stack diagram backdrop (dark, empty, for an overlaid block diagram) ———
  ['platform-stack', '16:9',
    'A very DARK, calm engineering blueprint backdrop: deep navy-black field with faint glowing cyan grid lines and a subtle sense of horizontal layered strata / tiers stacked and receding into shadow, like a cross-section of a technology stack, a whisper of warm clay-amber glow low at the bottom rising to cool cyan at the top. Lots of empty dark space, soft vignette, the whole CENTER almost pure dark navy so a diagram can sit on top. Minimal, abstract, no characters, no objects, no text.'],

  // ——— Closing ———
  ['closing', '16:9',
    'A serene wide vista: a whole constellation of glowing game-worlds floating in deep space, all connected by soft beams of light to a single bright central clay-stone core — a benevolent, growing network. Calm, hopeful, vast. A peaceful closing image.' + TOPBAND],
];

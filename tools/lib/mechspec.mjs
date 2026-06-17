// tools/lib/mechspec.mjs — the MECHANICS SPEC: the missing input when you say "clone <game>".
//
// A one-line concept ("clone Celeste") underspecifies a game. This is the contract that captures
// what the concept leaves out, so every later stage (solver, room builder, difficulty) can read it
// instead of re-inventing it. Six parts:
//   1. verbs      — the moveset + EXACT tuning (the solver simulates from these numbers)
//   2. tech       — the emergent CHAINS that are the depth (hold-jump, dash→wall→jump, …)
//   3. contraptions — the gadget set (spring, dash-crystal, crumble, …) the rooms draw from
//   4. grammar    — how a level is composed (room size, one-idea-per-room, teach→vary→combine→exam)
//   5. curve      — the teaching order + difficulty ramp
//   6. failure    — the death/respawn model (and therefore what the GATE should certify)
//
// The deconstruct stage writes a starter spec from genreTemplate(); a human edits; the rest reads it.

/** Known-genre starter specs. Generic, uncopyrightable mechanic descriptions — no game's assets/story. */
const GENRES = {
  // The precision air-dash climber (the Celeste genre): jump + one air-dash + wall-cling.
  'precision-dash-platformer': {
    summary: 'A precision platformer: tight jumps, ONE air-dash (8-way, refreshes on land/crystal), wall-slide + wall-jump. Vertical rooms; death is cheap and expected.',
    verbs: {
      run:   { speed: 200, accel: 'instant' },
      jump:  { v: 570, coyoteFrames: 6, bufferFrames: 6, variable: true, minCutV: 180 },
      dash:  { speed: 430, frames: 10, dirs: 8, charges: 1, refillOn: ['land', 'crystal'], keep: 0.55 },
      wall:  { slideMax: 96, jumpVX: 260, jumpVY: 500, stamina: Infinity },
      fall:  { gravity: 1200, fastFall: 760, terminal: 900 },
    },
    // tech = chains the SOLVER and the design may REQUIRE (this is the depth a dumb gate can't verify)
    tech: [
      { id: 'hold-jump',   how: 'hold jump for full height', gain: 'reach a ledge ~135px up' },
      { id: 'apex-dash',   how: 'jump, then dash up near the apex', gain: 'stack height to clear a ~190px gap' },
      { id: 'dash-walljump', how: 'dash into a wall, then immediately wall-jump', gain: 'an extra height boost off the wall' },
      { id: 'dash-extend', how: 'dash sideways then keep momentum', gain: 'cross a flat gap a jump arc would fall into' },
    ],
    contraptions: ['spring', 'dash-crystal', 'crumble', 'spike', 'mover', 'wisp'],
    grammar: { roomSize: 'single-screen (≈960×540)', oneIdeaPerRoom: true, arc: ['teach', 'vary', 'combine', 'exam'], checkpointPerRoom: true, entranceExit: true },
    curve: { kind: 'teaching-order', ramp: 'each room adds ONE demand on the room before it', deathsExpected: true },
    failure: { onHazard: 'instant death', respawn: 'last room entrance, instant', gate: 'solvable-with-fair-deaths' },
  },
  // generic horizontal runner-platformer (the engine's stock genre) — kept so the spec degrades gracefully.
  'runner-platformer': {
    summary: 'Run RIGHT to the goal; hop gaps/walls/enemies. The stock autopilot envelope (≈200px gap / 3 tiles up).',
    verbs: { run: { speed: 220, accel: 'instant' }, jump: { v: 600, coyoteFrames: 4, variable: false }, fall: { gravity: 1300, terminal: 900 } },
    tech: [{ id: 'gap-hop', how: 'jump a gap', gain: 'cross ≤200px' }],
    contraptions: ['spring', 'conveyor', 'dashpad', 'crumble', 'oneway', 'updraft', 'spike'],
    grammar: { roomSize: 'wide scrolling track', oneIdeaPerRoom: false, arc: ['intro', 'develop', 'twist'], checkpointPerRoom: false, entranceExit: false },
    curve: { kind: 'gentle', ramp: 'more gaps/hazards per world' },
    failure: { onHazard: 'instant death', respawn: 'level start', gate: '0-death-autopilot' },
  },
};

/** Return a STARTER spec for a genre (deep-cloned so callers can edit freely). */
export function genreTemplate(genre = 'precision-dash-platformer') {
  const g = GENRES[genre] || GENRES['precision-dash-platformer'];
  return JSON.parse(JSON.stringify({ genre: GENRES[genre] ? genre : 'precision-dash-platformer', ...g }));
}
export function listGenres() { return Object.keys(GENRES); }

/** Map a free-text concept to the closest known genre (cheap keyword routing; the human can override). */
export function genreFor(concept = '') {
  const c = concept.toLowerCase();
  if (/celeste|dash|precision|climb|cling|wall-?jump|air-?dash/.test(c)) return 'precision-dash-platformer';
  if (/run|runner|mario|platformer|jump/.test(c)) return 'runner-platformer';
  return 'precision-dash-platformer';
}

/** Validate a spec has the six load-bearing parts + a usable verb-set. Returns {ok, problems[]}. */
export function validate(spec = {}) {
  const problems = [];
  for (const k of ['verbs', 'tech', 'contraptions', 'grammar', 'curve', 'failure']) if (spec[k] == null) problems.push(`missing "${k}"`);
  if (spec.verbs && !spec.verbs.jump) problems.push('verbs.jump is required (every platformer jumps)');
  if (spec.verbs && spec.verbs.jump && !(spec.verbs.jump.v > 0)) problems.push('verbs.jump.v must be a positive impulse');
  if (Array.isArray(spec.tech) && spec.tech.length === 0) problems.push('tech is empty — no chains means no depth to gate');
  return { ok: problems.length === 0, problems };
}

/** Derive the SOLVER/movement physics config from a spec's verbs (the numbers the simulator runs on). */
export function physicsConfig(spec = {}) {
  const v = spec.verbs || {}, j = v.jump || {}, d = v.dash || {}, w = v.wall || {}, f = v.fall || {}, r = v.run || {};
  return {
    RUN: r.speed ?? 200, GRAV: f.gravity ?? 1200, TERMINAL: f.terminal ?? 900, FAST_FALL: f.fastFall ?? 760,
    JUMP_V: j.v ?? 570, COYOTE: j.coyoteFrames ?? 6, BUFFER: j.bufferFrames ?? 6, VAR_CUT: j.variable ? (j.minCutV ?? 180) : 0,
    DASH: d.speed ? { speed: d.speed, frames: d.frames ?? 10, charges: d.charges ?? 1, keep: d.keep ?? 0.55, refillOn: d.refillOn || ['land'] } : null,
    WALL: w.slideMax ? { slideMax: w.slideMax, jumpVX: w.jumpVX ?? 260, jumpVY: w.jumpVY ?? 500 } : null,
  };
}

/** The verb-set the solver is allowed to use (so a room can REQUIRE only declared moves). */
export function verbSet(spec = {}) {
  const v = spec.verbs || {}, set = ['run', 'jump'];
  if (v.dash) set.push('dash');
  if (v.wall) set.push('walljump');
  return set;
}

export default { genreTemplate, listGenres, genreFor, validate, physicsConfig, verbSet };

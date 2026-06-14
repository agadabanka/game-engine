// ELEMENT LIBRARY (#29) — the engine's selectable, FEELING-mapped catalog of level elements.
// Lifted from the deepfin gold standard (src/game/elements.js) into a self-contained ENGINE module
// so every game shares one taxonomy. "Pick the feeling, get the elements."
//
// Each element maps to:
//   feeling      — the MDA aesthetic it evokes (a key of FUN below)
//   aesthetic    — the felt experience in one phrase
//   interest     — its pull on the felt-interest curve (0–10); structural/vertical verbs + threats
//                  score high, loose coins barely move the needle. The bridge from "what I place"
//                  to "how it will feel / score" (read by the feel model, #35).
//   ai           — how the 0-death autopilot must interact with it (the gate contract)
//   note         — the placement LAW it must respect to stay gate-safe
//   implemented  — true if the ENGINE runtime + autopilot handle it TODAY; false = the #30 backlog
//                  (the gap is explicit, exactly as deepfin marks aspirational elements).
//
// Authors (and the design loop, #37/#38) select by feeling — byFeeling('Challenge') — and the
// feel model (#35) verifies the realized interest curve.

// The 8 MDA aesthetics ("kinds of fun", Hunicke/LeBlanc/Zubek + Schell) — the feelings to design for.
export const FUN = {
  Sensation:  'pleasure of the senses — kinetic joy, speed, juice',
  Fantasy:    'make-believe — being someone/somewhere else',
  Narrative:  'the unfolding story / dramatic arc',
  Challenge:  'an obstacle course — mastery through difficulty',
  Fellowship: 'social play — co-op, rivalry, community',
  Discovery:  'exploration — finding the new',
  Expression: 'self-expression — choices, routes, style',
  Submission: 'pastime — comfortable flow, low-stakes rhythm',
  Reward:     'mystery → payoff — the empowerment beat',
};

export const ELEMENT_LIBRARY = {
  // ── structure (the canvas; low intrinsic interest, high enabling value) ──
  ground:    { implemented: true,  feeling: 'Submission', aesthetic: 'solid footing / flow',           interest: 1, ai: 'walk',           note: 'The safety net. Continuous ground under springs/coins keeps detours 0-death.' },
  ledge:     { implemented: true,  feeling: 'Expression', aesthetic: 'a perch to aim for',             interest: 4, ai: 'land-on',        note: 'Floating platform over air; adds relief. Keep open sky above for clean bounces.' },
  stairUp:   { implemented: false, feeling: 'Challenge',  aesthetic: 'the ascent → triumph',          interest: 5, ai: 'hop-steps',      note: 'Rising steps = vertical relief; a tall ascent to the goal makes a strong LATE peak.' },
  stairDown: { implemented: false, feeling: 'Sensation',  aesthetic: 'the rush downhill',             interest: 4, ai: 'hop-steps',      note: 'Descent; pairs with stairUp to form a mound/dune.' },

  // ── traversal verbs (rhythm-changers; place where the arc is weak) ──
  gap:       { implemented: true,  feeling: 'Challenge',  aesthetic: 'commitment / risk',             interest: 5, ai: 'leap',           note: 'The base verb. ≤ hop envelope (~200px); segregate from guards/pads.' },
  hazard:    { implemented: true,  feeling: 'Challenge',  aesthetic: 'a deadly pit with a face',      interest: 6, ai: 'leap',           note: 'A deadly-material segment — the autopilot hops it like a gap; obeys maxGapPx. Lava/water/thorn/fudge.' },
  bridge:    { implemented: true,  feeling: 'Sensation',  aesthetic: 'stepping stones across',        interest: 5, ai: 'hop-stone',      note: 'A low foothold mid-gap (≤80px up) → island→stone→island; tames overshoot.' },
  spring:    { implemented: true,  feeling: 'Sensation',  aesthetic: 'exhilaration — flung skyward',  interest: 8, ai: 'ride+collect',   note: 'A bounce pad — a VERTICAL verb. Needs >=SAFE_AFTER runway before a pit (a launch must not carry into a fall).' },
  oneway:    { implemented: false, feeling: 'Expression', aesthetic: 'choose your layer / route',     interest: 6, ai: 'land-on',        note: 'Land from above, jump up through from below — stacked routes (Triangularity).' },
  ice:       { implemented: false, feeling: 'Challenge',  aesthetic: 'loss of control — momentum',    interest: 6, ai: 'walk-careful',   note: 'Low friction; place over CONTINUOUS ground so a slide cannot overshoot into a fall.' },
  pipe:      { implemented: false, feeling: 'Challenge',  aesthetic: 'a wall to surmount',            interest: 5, ai: 'launch-clear',   note: 'Tall obstacle; running launch. A flat runway before it. (Walls exist but break the AI — see #40.)' },

  // ── rewards (greed; individually low interest — clusters > singles) ──
  coin:      { implemented: true,  feeling: 'Sensation',  aesthetic: 'greed / a lure',                interest: 2, ai: 'grab',           note: 'Single coins are near-noise; arrange in ARCS/columns over springs so collecting is an act.' },
  coinRow:   { implemented: true,  feeling: 'Sensation',  aesthetic: 'a trail to follow',             interest: 2, ai: 'grab',           note: 'Leads the eye rightward; filler if used as the only content.' },
  qblock:    { implemented: false, feeling: 'Reward',     aesthetic: 'mystery → payoff (power-up)',   interest: 5, ai: 'bump',           note: 'Reserve ONE empowerment beat at a peak (atop a spring arc).' },
  brick:     { implemented: false, feeling: 'Discovery',  aesthetic: 'a hidden route when powered',   interest: 4, ai: 'none',           note: 'Smash-through route for the powered hero; pairs with a power qblock.' },

  // ── timed / dynamic verbs (the #30 backlog — high interest, AI standoff rules) ──
  conveyor:  { implemented: false, feeling: 'Expression', aesthetic: 'fight or ride the current',     interest: 6, ai: 'auto (push<accel)', note: 'Belt surface (dir ±1). Push < runAccel so the AI always wins. Over continuous ground.' },
  spout:     { implemented: false, feeling: 'Challenge',  aesthetic: 'time the burst',                interest: 8, ai: 'observe+dash',   note: 'Periodic floor flame. LONG grounded runway before it; AI stands off, learns the cycle, dashes a dormant window.' },
  dropper:   { implemented: false, feeling: 'Challenge',  aesthetic: 'pass between the drops',        interest: 8, ai: 'observe+dash',   note: 'Periodic ceiling rockfall. Same grounded-runway + AI standoff rule.' },
  crumble:   { implemented: false, feeling: 'Challenge',  aesthetic: 'the floor betrays you',         interest: 7, ai: 'leap/cross-fast', note: 'Collapses ~0.6s after touch. Over a leapable gap (AI leaps; a lingerer drops) or over ground.' },
  fireBar:   { implemented: false, feeling: 'Challenge',  aesthetic: 'don’t leap into the wheel of fire', interest: 8, ai: 'pass-under (overhead)', note: 'A rotating bar of fireballs — mount OVERHEAD (lowest sweep ≥2 tiles up): grounded AI strolls under, a jumping player dodges. No coins/gaps under it.' },

  // ── adversaries (one distinct kind per level + a boss) ──
  walker:    { implemented: true,  feeling: 'Challenge',  aesthetic: 'threat → mastery (stomp)',      interest: 6, ai: 'stomp/clear',    note: 'Stompable ground patroller. One kind in the engine today (kind-rotation = #31). Keep off pit edges (SAFE_AFTER).' },
  flyer:     { implemented: false, feeling: 'Challenge',  aesthetic: 'an overhead threat you duck under', interest: 6, ai: 'passes-under', note: 'Deadly high patroller. Place at a row above max jump and off spring columns → AI-safe over anything.' },
  piranha:   { implemented: false, feeling: 'Challenge',  aesthetic: 'patience — timing the gap',     interest: 7, ai: 'time-the-gap',   note: 'Pipe plant on a cycle; ONE per stretch with a long runway (never back-to-back).' },
  boss:      { implemented: false, feeling: 'Challenge',  aesthetic: 'the climactic duel',            interest: 9, ai: 'multi-stomp',    note: 'Finale: a multi-HP brute gating the exit; flat enemy-free arena. (#44 boss template.)' },

  // ── physics fields & pads (AI-TRANSPARENT helpers — none trap, so the autopilot reads through) ──
  // LAW: a field changes traversal speed/arc, shifting the phase of any downstream periodic hazard —
  // so place fields over SAFE ground with NO timed hazard between them and the goal.
  dashpad:   { implemented: false, feeling: 'Sensation',  aesthetic: 'turbo launch — speed!',         interest: 8, ai: 'auto (faster)',  note: 'Floor strip → one-shot burst to ~1.45× (capped, lands safe). Over CONTINUOUS flat ground only.' },
  wind:      { implemented: false, feeling: 'Expression', aesthetic: 'lean into the current',         interest: 6, ai: 'auto (push<accel)', note: 'A horizontal air current. Push < runAccel; place WITH travel over safe ground.' },
  updraft:   { implemented: false, feeling: 'Sensation',  aesthetic: 'caught on a thermal',           interest: 7, ai: 'auto (gentle lift)', note: 'An upward fan column (counter-gravity, capped). Over a climb/flat; never over a gap the AI must clear.' },
  lowgrav:   { implemented: false, feeling: 'Sensation',  aesthetic: 'moon-jump float',               interest: 7, ai: 'auto (floaty)',  note: 'A bubble that scales gravity down. Over flat solid ground; keep pit edges clear.' },
  water:     { implemented: false, feeling: 'Discovery',  aesthetic: 'sink slow, swim up',            interest: 7, ai: 'auto (buoyant)', note: 'A buoyant pool: capped sink + swim-strokes. Over solid ground, fenced from chasm edges.' },
  sticky:    { implemented: false, feeling: 'Challenge',  aesthetic: 'trudge through the mud',        interest: 6, ai: 'auto (slower)',  note: 'Mud (inverse of ice): capped speed + drag. Not right before a gap that needs run-up speed.' },
  bounceTile:{ implemented: false, feeling: 'Sensation',  aesthetic: 'auto-bounce floor',             interest: 6, ai: 'auto (rides arcs)', note: 'A trampoline floor (a low permanent spring); over a continuous flat net.' },

  // ── kinematic platforms (the highest-value structural verbs — can GATE a level) ──
  movPlatformH: { implemented: false, feeling: 'Challenge', aesthetic: 'ride the moving island',      interest: 8, ai: 'board/ride/hop-off', note: 'A horizontal ferry that CARRIES the hero (deterministic). Over a too-wide gap with a dwell at each extreme; the AI waits→boards→rides idle→steps off.' },
  movPlatformV: { implemented: false, feeling: 'Discovery', aesthetic: 'the lift into the unknown',   interest: 7, ai: 'board/ride/hop-off', note: 'A vertical lift carrying the hero up/down — same rider branch (board on an unjumpable wall, ride, step off at the exit ledge).' },
};

export const FEELINGS = Object.keys(FUN);

/** "I want this stretch to feel X — what can I place?" (implemented, by interest desc) */
export function byFeeling(feeling) {
  return Object.entries(ELEMENT_LIBRARY)
    .filter(([, e]) => e.implemented && e.feeling === feeling)
    .sort((a, b) => b[1].interest - a[1].interest)
    .map(([k, e]) => ({ key: k, ...e }));
}

/** The verbs worth reaching for when a stretch is flat (implemented, interest ≥ 6). */
export function highInterestVerbs() {
  return Object.entries(ELEMENT_LIBRARY)
    .filter(([, e]) => e.implemented && e.interest >= 6)
    .sort((a, b) => b[1].interest - a[1].interest)
    .map(([k, e]) => ({ key: k, feeling: e.feeling, interest: e.interest, aesthetic: e.aesthetic }));
}

/** The #30 backlog — high-value mechanics not yet in the engine runtime (build these next). */
export function backlog() {
  return Object.entries(ELEMENT_LIBRARY)
    .filter(([, e]) => !e.implemented)
    .sort((a, b) => b[1].interest - a[1].interest)
    .map(([k, e]) => ({ key: k, interest: e.interest, feeling: e.feeling }));
}

/** Interest weight for an element key (the feel model reads this). Unknown → 1. */
export function interestOf(key) { const e = ELEMENT_LIBRARY[key]; return e ? e.interest : 1; }

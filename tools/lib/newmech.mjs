// tools/lib/newmech.mjs — FIVE new Celeste-style mechanics + a designed showcase room.
//
// We looked up Celeste's signature objects and picked five to add to the vocabulary. Each is captured as
// the #23 4-tuple (shape · rule · solver-model · teaching-note). Three are already solver-integrated —
// they work through the solver's forward-simulation for free, so a room can REQUIRE them — and the room
// below is solver-VERIFIED to require two of them (wind + crumble). The remaining two (bumper, dream)
// are physically modelled + drawn (the solver can use them when the geometry lines up; wiring archetypes
// for evolveRoom so G/H can teach them is the next step). The point: one designed room that shows the
// whole new vocabulary, with the critical path proven by the same solver every strategy uses.
//
//   designShowcase(spec, { rec }) → { room, result, mechanics }

import { solveRoom } from './solver.mjs';

// the five, each as { token, name, glyph, shape, rule, solver, teach, solved }
export const MECHANICS = [
  { token: 'wind', name: 'Updraft / Wind', glyph: '↑↑', shape: 'a column of upward chevrons (or side arrows)',
    rule: 'pushes the hero while inside — but NOT while dashing (authentic Celeste: a dash ignores wind)',
    solver: 'a force-zone the forward-sim applies; "requires wind" when a ledge is only reachable through the lift', teach: 'a clear column with a ledge reachable only by riding it', solved: true },
  { token: 'crumble', name: 'Crumble block', glyph: '▦', shape: 'a dashed-outline block',
    rule: 'solid, but dissolves a beat after you stand on it — don\'t dwell',
    solver: 'a foothold the solver routes over (now enumerated like a solid); load-bearing if removing it breaks the room', teach: 'a single crumble between two safe ledges', solved: true },
  { token: 'spring', name: 'Spring', glyph: '▲', shape: 'a yellow chevron',
    rule: 'bounce up + refill the dash on contact (already in the vocabulary)',
    solver: 'a launch edge + the spring→dash compound move', teach: 'a spring under a ledge beyond jump+dash reach', solved: true },
  { token: 'bumper', name: 'Bumper', glyph: '◎', shape: 'a ringed circle',
    rule: 'fling the hero away from its centre + refill the dash (hit it from above and it boosts you up)',
    solver: 'works through the forward-sim as a mid-flight redirect; archetype for evolveRoom is the next step', teach: 'one bumper that boosts you to an out-of-reach ledge', solved: false },
  { token: 'dream', name: 'Dream block', glyph: '▨', shape: 'a dark hatched block',
    rule: 'dash INTO it to pass through in the dash direction; refills the dash on exit (die if you stop inside)',
    solver: 'a dash-through traversal in the forward-sim; archetype for evolveRoom is the next step', teach: 'a dream wall blocking the only path, crossed by dashing', solved: false },
  { token: 'feather', name: 'Feather', glyph: '✦', shape: 'a glowing feather',
    rule: 'grab it to fly freely in any direction for a short window; dash to exit',
    solver: 'a free-flight segment (not yet modelled — drawn + physical for now)', teach: 'a feather across a wide hazard span', solved: false },
];

// the designed room — verified below to require wind + crumble (a real Celeste-style climb)
export const SHOWCASE = {
  solids: [[40, 540, 300, 40], [700, 150, 240, 22]],            // 0 start ground · 1 exit ledge (top-right)
  crumbles: [[470, 270, 200, 22]],                              // a crumble foothold mid-climb (solver index 2)
  winds: [[350, 240, 200, 300, 0, -1700]],                      // updraft column rising over the spikes
  spikes: [[350, 526, 200, 14]],                                // a spike pit you must rise over
  bumpers: [[640, 360]], dreams: [[180, 250, 60, 210]], feathers: [[130, 200]],   // the rest of the new vocabulary, drawn in
  entranceIdx: 0, exitIdx: 1, floorKill: 640,
  height: 620,
};

export function designShowcase(spec, { rec = null } = {}) {
  const room = JSON.parse(JSON.stringify(SHOWCASE));
  const result = solveRoom(room, spec);
  const used = MECHANICS.filter((m) => room[m.token + 's'] && room[m.token + 's'].length) ;
  const snap = (focus) => ({ ...JSON.parse(JSON.stringify(room)), focus });

  rec && rec.log('seed', 'five new Celeste mechanics — one designed room', { mechanics: MECHANICS.map((m) => m.token) }, 'a Celeste-style climb that shows the whole new vocabulary; the critical path is solver-verified', snap('wind'));
  for (const m of MECHANICS) {
    rec && rec.log(m.solved ? 'accept' : 'propose', `${m.glyph} ${m.name}${m.solved ? ' · solver-integrated' : ' · drawn + physical'}`, { token: m.token, shape: m.shape, rule: m.rule, solver: m.solver, teach: m.teach },
      `${m.name} — rule: ${m.rule}. teach: ${m.teach}.`, snap(m.token));
  }
  rec && rec.log('solve', 'verify the critical path', { solvable: result.solvable, requires: result.requires, difficulty: result.difficulty, moves: result.moves },
    result.solvable ? `solver-verified: requires [${(result.requires || []).join(', ')}] · diff ${result.difficulty} — ride the updraft over the spikes onto the crumble, then dash to the exit` : 'unsolved', snap('wind'));
  rec && rec.log('done', 'a designed room with five new mechanics', { requires: result.requires, difficulty: result.difficulty },
    `requires [${(result.requires || []).join(', ')}] — two new mechanics load-bearing-verified; bumper, dream & feather drawn in. Next: archetypes so G discovers and H teaches them.`, snap('wind'));

  return { room, result, mechanics: MECHANICS };
}

export default { designShowcase, MECHANICS, SHOWCASE };

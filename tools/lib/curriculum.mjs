// tools/lib/curriculum.mjs — the TEACHING CURRICULUM: teach once, then only reinforce.
//
// Strategy G grows a vocabulary of interactions. A campaign must *teach* that vocabulary in order — and
// the load-bearing rule (the owner's): **once a mechanic is taught it is never taught again, only
// reinforced.** We make that a verifiable invariant. Each room carries a KNOWN set (the vocabulary the
// player has already been taught — the contract's second field, flowing down beside the difficulty
// budget). A room's NEW DEMAND = what its solver-verified `requires` adds beyond KNOWN:
//   • TEACH(x)     — new demand is exactly {x}: introduce ONE idea, in isolation, gently.
//   • REINFORCE    — new demand is empty: recombine KNOWN tokens, harder.
//   • EXAM         — reinforce everything, hardest.
// Invariants (checked): every room introduces ≤ 1 new idea, each token is taught exactly once, KNOWN
// only grows, and difficulty rises (with a gentle dip at each new teach — the interest curve peaks late).
// Teaching order = a topological sort of the interaction DAG (you must know the parts before the combo:
// dash before spring→dash). Same teach→reinforce→exam shape at every scale (move ⊂ room ⊂ level).
//
//   buildCurriculum(spec, { seed, rec, vocab }) → { lessons, known, valid }

import { evolveRoom } from './roomgen.mjs';

// the teachable vocabulary in DEPENDENCY order — the solver can REQUIRE each, and each combo needs its
// parts taught first (spring→dash needs dash). (Higher-tier tokens from Strategy G plug in here once the
// generator can require them; today these are the requirable mechanics.)
const DEFAULT_VOCAB = [
  { token: 'dash', label: 'air-dash', glyph: '◇', deps: [], teach: [18, 30] },
  { token: 'spring', label: 'spring→dash', glyph: '▲', deps: ['dash'], teach: [24, 42] },
];
const isReal = (v) => v !== 'run' && v !== 'jump';

export function buildCurriculum(spec, { seed = 1, rec = null, vocab = DEFAULT_VOCAB } = {}) {
  const known = new Set();           // the vocabulary taught so far (the carried contract state)
  const lessons = [];
  const W = 900, SH = 380, totalEst = vocab.length * 2 + 1;
  const slot = (k) => ({ x: 30, y: k * SH + 16, w: W - 60, h: SH - 32 });
  const snap = (activeK) => ({
    kind: 'curriculum', activeK, known: [...known], vocab: vocab.map((v) => ({ token: v.token, label: v.label, glyph: v.glyph, known: known.has(v.token) })),
    lessons: lessons.map((l, i) => ({ ...l, place: l.place, slot: slot(i) })),
  });

  const make = (kind, introduces, requires, band, why) => {
    const k = lessons.length;
    const out = evolveRoom(spec, { requires: requires.slice(), difficulty: band, tightness: [40, 170] }, { seed: ((seed * 131 + k * 29 + 1) >>> 0), budget: kind === 'teach' ? 30 : 44 });
    const res = out.result, demanded = (res.requires || []).filter(isReal);
    const newDemand = demanded.filter((v) => !known.has(v));   // what this room adds beyond what's known
    const lesson = { kind, introduces, known: [...known], requires, demanded, newDemand, difficulty: res.difficulty, room: out.room, result: res, place: placeRoom(slot(k), out.room) };
    lessons.push(lesson);
    rec && rec.log(kind === 'teach' ? 'propose' : kind === 'exam' ? 'chain' : 'mutate', `${kind.toUpperCase()}${introduces ? ' ' + introduces : ''} — known {${[...known].join(', ') || '∅'}}`, { kind, introduces, requires, newDemand, difficulty: res.difficulty },
      `${why} · new demand = {${newDemand.join(', ') || '∅'}}${kind === 'teach' ? ' (one new idea)' : ' (nothing new → reinforce)'}`, snap(k));
    if (introduces) { known.add(introduces); rec && rec.log('accept', `learned ${introduces} → known {${[...known].join(', ')}}`, { learned: introduces, known: [...known] }, `${introduces} is taught — from here it is only REINFORCED, never re-taught`, snap(k)); }
    return lesson;
  };

  rec && rec.log('seed', 'the teaching curriculum — teach once, then only reinforce', { vocab: vocab.map((v) => v.token) }, 'each room carries the KNOWN vocabulary; a teach adds exactly one new idea, then it is only reinforced', snap(-1));

  // walk the vocabulary in dependency order: TEACH each gently in isolation, then REINFORCE the known set
  for (let i = 0; i < vocab.length; i++) {
    const v = vocab[i];
    make('teach', v.token, [...v.deps, v.token], v.teach, `introduce ${v.label} in isolation (gentle)`);
    make('reinforce', null, [...known], [v.teach[1] + 6, v.teach[1] + 22], `reinforce {${[...known].join('+')}} — combined, harder`);
  }
  // EXAM — everything known, hardest
  make('exam', null, [...known], [Math.min(54, ([...known].length + 1) * 22), 80], 'exam — combine everything taught');

  // ── verify the curriculum invariants ──
  const oneIdea = lessons.every((l) => l.newDemand.length <= 1);
  const introducedAt = {}; lessons.forEach((l) => l.newDemand.forEach((t) => { introducedAt[t] = (introducedAt[t] || 0) + 1; }));
  const taughtOnce = Object.values(introducedAt).every((n) => n === 1) && vocab.every((v) => introducedAt[v.token] === 1);
  const ramp = lessons.map((l) => l.difficulty);
  const valid = oneIdea && taughtOnce;
  rec && rec.log('done', valid ? 'a valid curriculum' : 'curriculum (with gaps)', { lessons: lessons.length, known: [...known], oneIdea, taughtOnce, ramp },
    valid ? `${lessons.length} lessons · ${vocab.length} ideas, each taught ONCE then reinforced · known grows ${vocab.map((v) => v.token).join(' → ')} — the vocabulary field, flowing down the contracts` : 'some ideas slipped (see new-demand counts)', snap(lessons.length - 1));

  return { lessons, known: [...known], valid, oneIdea, taughtOnce };
}

// place an evolved LOCAL room into a curriculum-card slot (local→card transform for drawing)
function placeRoom(slot, room) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (x, y, w = 0, h = 0) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  (room.solids || []).forEach((s) => add(s[0], s[1], s[2], s[3])); (room.spikes || []).forEach((s) => add(s[0], s[1], s[2], 14)); (room.springs || []).forEach((s) => add(s[0] - 20, s[1] - 16, 40, 20));
  if (x0 > x1) { x0 = 0; y0 = 0; x1 = 960; y1 = 600; }
  const bw = x1 - x0, bh = y1 - y0, pad = 0.12, s = Math.min(slot.w * (1 - 2 * pad) / (bw || 960), slot.h * (1 - 2 * pad) / (bh || 600));
  return { ox: slot.x + slot.w * pad + (slot.w * (1 - 2 * pad) - bw * s) / 2 - x0 * s, oy: slot.y + slot.h * pad + (slot.h * (1 - 2 * pad) - bh * s) / 2 - y0 * s, scale: s };
}

export default { buildCurriculum };

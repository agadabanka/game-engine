// tools/lib/roomgen.mjs — the ROOM generator/mutator: the leaf-maker for every strategy.
//
// `evolveRoom(spec, target)` hill-climbs a single-screen room toward a TARGET (require a verb, land in
// a difficulty band, a tightness band) using `solveRoom` as the fitness oracle — and records every
// proposal / verdict / accept-reject to a decision trace. This is the smallest closed self-improving
// loop: generate → evaluate (solver) → select → repeat. Pure + deterministic (seeded RNG); the same
// seed reproduces the same room and the same trace forever.

import { solveRoom } from './solver.mjs';

// ── seeded RNG (mulberry32) — determinism without Math.random ──
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/** A trivial start: a ground + one ledge (jump-able). The loop edits it toward the target. */
export function seedRoom() {
  return { solids: [[40, 480, 880, 40], [360, 360, 320, 22]], spikes: [], springs: [], crystals: [], entranceIdx: 0, exitIdx: 1, floorKill: 600 };
}

// ── EDIT OPERATORS (deterministic; each returns {room, op, params}) ──
// The key lever for "requires dash" is the LEDGE HEIGHT: ~110px gap = jump-able, ~150px = needs the dash.
const OPS = [
  (room, r) => { const L = room.solids[1]; const dy = -ri(r, 8, 22); L[1] += dy; return { room, op: 'ledge-up', params: { dy } }; },
  (room, r) => { const L = room.solids[1]; const dy = ri(r, 8, 22); L[1] = Math.min(458, L[1] + dy); return { room, op: 'ledge-down', params: { dy } }; },
  (room, r) => { const L = room.solids[1]; const dx = (r() < 0.5 ? -1 : 1) * ri(r, 20, 60); L[0] = Math.max(60, Math.min(620, L[0] + dx)); return { room, op: 'ledge-shift', params: { dx } }; },
  (room, r) => { const w = (r() < 0.5 ? -1 : 1) * ri(r, 20, 50); room.solids[1][2] = Math.max(180, Math.min(360, room.solids[1][2] + w)); return { room, op: 'ledge-resize', params: { dw: w } }; },
  (room, r) => { const x = ri(r, 300, 520), w = ri(r, 90, 160); room.spikes = [[x, 466, w, 14]]; return { room, op: 'add-spike', params: { x, w } }; },   // raises tightness/difficulty
  (room, r) => { room.spikes = []; return { room, op: 'clear-spikes', params: {} }; },
  (room, r) => { const x = ri(r, 250, 360); room.crystals = [[x, 380]]; return { room, op: 'add-crystal', params: { x } }; },
  // add a SECOND ledge above the first → a 2-move climb (raises difficulty / lets the curve breathe)
  (room, r) => {
    if (room.solids.length >= 3) { const T = room.solids[room.solids.length - 1]; const dy = -ri(r, 8, 20); T[1] += dy; return { room, op: 'top-ledge-up', params: { dy } }; }
    const L1 = room.solids[1]; const x = Math.max(60, Math.min(560, L1[0] + (r() < 0.5 ? -1 : 1) * ri(r, 50, 120))); const y = L1[1] - ri(r, 115, 150);
    room.solids.push([x, y, 300, 22]); room.exitIdx = room.solids.length - 1;
    return { room, op: 'add-ledge', params: { x, y } };
  },
];

/** Apply ONE random edit. */
export function mutateRoom(room, r) { const op = OPS[Math.floor(r() * OPS.length)]; return op(clone(room), r); }

// ── fitness: distance to target (lower = better; 0 = on target). Hard-fails an unsolvable room. ──
const band = (x, lo, hi) => (x < lo ? lo - x : x > hi ? x - hi : 0);
export function score(res, target) {
  if (!res.solvable) return 1e6;
  let s = 0;
  for (const v of target.requires || []) if (!(res.requires || []).includes(v)) s += 120;   // must DEMAND the verb
  for (const v of target.forbid || []) if ((res.requires || []).includes(v)) s += 40;
  if (target.difficulty) s += band(res.difficulty || 0, target.difficulty[0], target.difficulty[1]);
  if (target.tightness && res.tightness != null && res.tightness < 900) s += band(res.tightness, target.tightness[0], target.tightness[1]) * 0.5;
  return s;
}
const verdict = (res) => res.solvable ? `solvable · requires [${(res.requires || []).join(',')}] · diff ${res.difficulty} · tight ${res.tightness}` : `unsolvable (${res.reason || ''})`;

/**
 * Hill-climb a room to the target, recording the timeline.
 *   evolveRoom(spec, target, { seed, budget, rec }) → { room, result, score, attempts }
 * target = { requires:['dash'], difficulty:[60,80], tightness:[40,80], forbid:[] }
 */
export function evolveRoom(spec, target, { seed = 1, budget = 160, rec = null } = {}) {
  const r = rng(seed);
  let cur = seedRoom(), curRes = solveRoom(cur, spec), curScore = score(curRes, target), attempts = 0;
  rec && rec.log('seed', 'start from a ground + one ledge', { target, seed }, 'the simplest solvable room', cur);
  rec && rec.log('solve', 'seed verdict', curRes, verdict(curRes) + ` · score ${curScore}`, cur);
  for (let step = 0; step < budget && curScore > 0; step++) {
    const { room: cand, op, params } = mutateRoom(cur, r); attempts++;
    const res = solveRoom(cand, spec), sc = score(res, target);
    rec && rec.log('mutate', op, params, `propose: ${op} ${JSON.stringify(params)}`, cand);
    rec && rec.log('solve', 'verdict', res, verdict(res) + ` · score ${sc}`, cand);
    if (sc < curScore) { cur = cand; curRes = res; curScore = sc; rec && rec.log('accept', 'kept', { score: sc }, `better (${sc} < previous) → keep`, cand); }
    else rec && rec.log('reject', 'rolled back', { score: sc }, `not better (${sc}) → discard`, cur);
  }
  rec && rec.log('done', 'final room', curRes, curScore === 0 ? 'hit the target' : `best-effort (residual ${curScore})`, cur);
  return { room: cur, result: curRes, score: curScore, attempts };
}

export default { rng, seedRoom, mutateRoom, score, evolveRoom };

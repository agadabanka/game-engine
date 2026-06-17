// tools/lib/genchain.mjs — STRATEGY B: bottom-up room evolution + chain (the DUAL of BSP).
//
// Where Strategy A is structure-first (cut the whole space top-down, then fill the leaves), Strategy B
// is content-first: GROW a handful of rooms independently — each evolved to its own difficulty target,
// with NO pre-allocated tree — then COMPOSE them by (1) sorting the grown rooms into a smooth curve and
// (2) DOCKING consecutive rooms through their contracts (the exit of room k, dash refreshed, feeds the
// entrance of room k+1). The composition is verified by chaining (each room solved in isolation + the
// stack assembled). Every grow / accept / chain / dock is recorded to the decision trace.
//
//   generateChain(spec, { seed, rec, rooms, leafBudget, difficulty }) → { bounds, order, level, summary }

import { evolveRoom, rng } from './roomgen.mjs';
import { placement } from './genbsp.mjs';
import { chainRooms } from './rooms.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 === 10 ? 0 : n % 10)] || 'th');

export function generateChain(spec, { seed = 1, rec = null, rooms = 6, leafBudget = 72, difficulty = [22, 74] } = {}) {
  const r = rng(((seed * 40503) >>> 0) || 5);
  const N = rooms, W = 900, SH = 420, B = { x: 0, y: 0, w: W, h: N * SH };
  // slot k counts from the BOTTOM (largest y = the start of the climb)
  const slot = (k) => ({ x: 40, y: (N - 1 - k) * SH + 20, w: W - 80, h: SH - 40 });

  // bottom-up: pick N varied difficulty CENTERS spanning the range, then SHUFFLE (so the sort step is
  // a real act — we grow diverse rooms blind, then discover the curve by arranging them).
  const centers = []; for (let k = 0; k < N; k++) centers.push(Math.round(difficulty[0] + (difficulty[1] - difficulty[0]) * k / (N - 1)));
  for (let i = centers.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [centers[i], centers[j]] = [centers[j], centers[i]]; }

  const grown = [];   // { id, room, result, place, target } in GROWN order
  const snapGrow = (kActive) => ({
    kind: 'level', bounds: B, active: kActive != null ? 'g' + kActive : null, mode: 'grow',
    regions: grown.map((g, i) => ({ id: g.id, ...slot(i), band: [g.target - 10, g.target + 10], room: clone(g.room), place: g.place, result: g.result })),
    cuts: [], docks: [],
  });

  rec && rec.log('seed', 'bottom-up: grow rooms independently, then chain', { rooms: N, difficulty }, 'Strategy B (dual of A): no tree up front — grow diverse rooms blind, then arrange + dock them into a curve', snapGrow(null));

  // ── GROW PHASE: evolve each room independently toward its own (shuffled) target ──
  centers.forEach((center, k) => {
    const target = { requires: ['dash'], difficulty: [center - 10, center + 10], tightness: [40, 170] };
    const id = 'g' + k;
    rec && rec.log('propose', `grow room ${k + 1} — blind, target ~${center}`, { target, order: k + 1, of: N },
      `evolve an independent room toward difficulty ~${center} (it does not yet know its place in the level)`, snapGrow(k));
    const out = evolveRoom(spec, target, { seed: ((seed * 131 + k * 17 + 3) >>> 0), budget: leafBudget, rec: rec ? rec.scope(id) : null });
    grown.push({ id, room: out.room, result: out.result, place: placement(slot(grown.length), out.room), target: center });
    grown.forEach((g, i) => { g.place = placement(slot(i), g.room); });   // re-place as the stack grows
    rec && rec.log('accept', `room ${k + 1} grown → diff ${out.result.difficulty}`, { id, difficulty: out.result.difficulty, requires: out.result.requires },
      `grown: requires ${(out.result.requires || []).join('+') || '—'} · diff ${out.result.difficulty} (target was ~${center})`, snapGrow(k));
  });

  // ── CHAIN PHASE: sort the grown rooms into a ramp, then dock consecutive rooms ──
  const order = [...grown].sort((a, b) => a.result.difficulty - b.result.difficulty);   // bottom (easy) → top (hard)
  const snapStack = (nDock, active) => ({
    kind: 'level', bounds: B, active, mode: 'chain',
    regions: order.map((g, i) => ({ id: g.id, ...slot(i), band: [g.target - 10, g.target + 10], room: clone(g.room), place: placement(slot(i), g.room), result: g.result })),
    cuts: [],
    docks: order.slice(0, Math.max(0, nDock)).map((g, i) => ({ from: order[i].id, to: order[i + 1] ? order[i + 1].id : null, y: (N - 1 - i) * SH })).filter((d) => d.to),
  });
  rec && rec.log('chain', 'sort the grown rooms into a difficulty ramp', { ramp: order.map((g) => g.result.difficulty) },
    'content-first composition: arrange the diverse rooms bottom→top into a smooth curve', snapStack(0, null));

  // dock each consecutive pair through the contract (exit dash-refreshed → next entrance)
  for (let i = 0; i < order.length - 1; i++) {
    rec && rec.log('contract', `dock room ${i + 1} → ${i + 2}`, { from: order[i].id, to: order[i + 1].id, enter: { dash: 'refreshed' }, exit: { reach: 'next entrance' } },
      `the ${ordinal(i + 1)} room's exit (dash refreshed) docks to the ${ordinal(i + 2)} room's entrance — contract satisfied`, snapStack(i + 1, order[i + 1].id));
  }

  // verify the assembled stack by chaining (each room solved in isolation + composed)
  const chained = chainRooms(order.map((g) => g.room), spec);
  const allDash = order.every((g) => (g.result.requires || []).includes('dash'));
  const ramp = order.map((g) => g.result.difficulty);
  const monotonic = ramp.every((d, i) => i === 0 || d >= ramp[i - 1]);
  rec && rec.log('done', 'the level is chained', { rooms: N, allSolved: chained.allSolved, allRequireDash: allDash, ramp, monotonic },
    chained.allSolved ? `${N} rooms grown + chained, all solvable${allDash ? ', all require dash' : ''}${monotonic ? ', ramp is monotonic' : ''} — a level discovered bottom-up` : `chained with ${chained.report.filter((x) => !x.solvable).length} unsolved`, snapStack(order.length, null));

  return { bounds: B, order, level: chained.level, summary: { rooms: N, allSolvable: chained.allSolved, allRequireDash: allDash, ramp, monotonic } };
}

export default { generateChain };

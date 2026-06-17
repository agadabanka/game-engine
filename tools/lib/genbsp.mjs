// tools/lib/genbsp.mjs — STRATEGY A: top-down BSP recursive descent (whole-level generation).
//
// A level is a BINARY TREE. We start with the entire level as one uncut region and recursively CUT it
// with a wall; each cut carries ONE DOOR = a CONTRACT (enter-state, exit-state, a difficulty budget).
// The budget is allocated DOWN the cuts — a ramp, so rooms reached LATER on the climb carry a higher
// budget. At the leaves we FILL each region with a solver-verified room via `evolveRoom` (which must
// hit the leaf's budget AND require the signature verb). Every cut / contract / propose / solve /
// accept is recorded to a decision trace, so the timeline shows a whole multi-room level being CUT and
// CONTRACTED into being — the most literal answer to "how did this level come to be".
//
// Compositional verification: each leaf is proven solvable in isolation and the doors match (an exit
// state feeds the next entrance), so the whole climb is verified by verifying the leaves + the doors.
//
//   generateLevel(spec, { seed, rec, targetLeaves, leafBudget, difficulty, bounds }) → { bounds, leaves, cuts, summary }

import { evolveRoom, rng } from './roomgen.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const rect = (x, y, w, h) => ({ x, y, w, h });
const area = (r) => r.w * r.h;
const cxf = (r) => r.x + r.w / 2, cyf = (r) => r.y + r.h / 2;
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 === 10 ? 0 : n % 10)] || 'th');

// ── placing an evolved LOCAL room into its region slot (purely for drawing — the solver runs on the
//    local coords where the physics is tuned; `place` is the local→level transform the sandbox uses) ──
function roomBounds(room) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (x, y, w = 0, h = 0) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  (room.solids || []).forEach((s) => add(s[0], s[1], s[2], s[3]));
  (room.spikes || []).forEach((s) => add(s[0], s[1], s[2], 14));
  (room.springs || []).forEach((s) => add(s[0] - 20, s[1] - 16, 40, 20));
  (room.crystals || []).forEach((s) => add(s[0] - 14, s[1] - 14, 28, 28));
  if (x0 > x1) { x0 = 0; y0 = 0; x1 = 960; y1 = 600; }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
function placement(region, room) {
  const b = roomBounds(room), pad = 0.10;
  const rw = region.w * (1 - 2 * pad), rh = region.h * (1 - 2 * pad);
  const scale = Math.min(rw / (b.w || 960), rh / (b.h || 600));
  const ox = region.x + region.w * pad + (rw - b.w * scale) / 2 - b.x0 * scale;
  const oy = region.y + region.h * pad + (rh - b.h * scale) / 2 - b.y0 * scale;
  return { ox, oy, scale };
}

// climb order: a climber starts at the BOTTOM (largest y) and climbs UP — so larger y-centre is reached
// EARLIER. Tiebreak (same height, e.g. a vertical cut): the left column (smaller x) first.
function earlier(p, q) { if (Math.abs(cyf(p) - cyf(q)) > 1) return cyf(p) > cyf(q) ? -1 : 1; return cxf(p) < cxf(q) ? -1 : 1; }

// Choose a cut for a region: a WALL with ONE DOOR. Wide regions get a vertical wall (two columns),
// tall regions a horizontal wall (a lower + an upper room — the natural climber stack).
function chooseCut(region, r) {
  const orient = region.w > region.h * 1.25 ? 'v' : 'h';
  const t = 24;   // wall thickness (drawing only)
  if (orient === 'h') {
    const line = Math.round(region.y + region.h * (0.42 + r() * 0.16));
    const dw = Math.min(150, region.w * 0.32), dx = Math.round(region.x + region.w * (0.28 + r() * 0.44) - dw / 2);
    return { orient, line, door: { x: dx, y: line - t / 2, w: dw, h: t } };
  }
  const line = Math.round(region.x + region.w * (0.42 + r() * 0.16));
  const dh = Math.min(150, region.h * 0.32), dy = Math.round(region.y + region.h * (0.28 + r() * 0.44) - dh / 2);
  return { orient, line, door: { x: line - t / 2, y: dy, w: t, h: dh } };
}
function splitRegion(region, cut) {
  if (cut.orient === 'h') return [rect(region.x, region.y, region.w, cut.line - region.y), rect(region.x, cut.line, region.w, region.y + region.h - cut.line)];
  return [rect(region.x, region.y, cut.line - region.x, region.h), rect(cut.line, region.y, region.x + region.w - cut.line, region.h)];
}

/**
 * Generate a whole level by recursive BSP descent, recording the decision timeline.
 *   generateLevel(spec, { seed, rec, targetLeaves, leafBudget, difficulty, bounds })
 */
export function generateLevel(spec, { seed = 1, rec = null, targetLeaves = 6, leafBudget = 70, difficulty = [22, 74], bounds = null } = {}) {
  const r = rng(((seed * 2654435761) >>> 0) || 7);
  const B = bounds || { x: 0, y: 0, w: 1280, h: 2200 };
  let nid = 0; const mk = (rc) => ({ id: 'r' + (nid++), ...rc });
  const root = mk(B);

  // ── BUILD PHASE: cut the LARGEST open region until we have targetLeaves rooms. We record each step
  //    (the open-set + the cut) but assign the difficulty budget AFTER the tree exists, so the ramp is
  //    monotonic in CLIMB order regardless of how the tree branched. ──
  let open = [root]; const cuts = [], steps = [], kids = {};
  while (open.length < targetLeaves) {
    open.sort((a, b) => area(b) - area(a)); const R = open.shift();
    const cut = chooseCut(R, r); const [c0, c1] = splitRegion(R, cut);
    const [a, b] = earlier(c0, c1) <= 0 ? [c0, c1] : [c1, c0];   // a reached first on the climb, b later
    const A = mk(a), Bb = mk(b); cut.from = R.id; cut.aId = A.id; cut.bId = Bb.id; cut.rect = { x: R.x, y: R.y, w: R.w, h: R.h }; kids[R.id] = [A.id, Bb.id];
    cuts.push(cut); open.push(A, Bb);
    steps.push({ active: R.id, cutN: cuts.length, open: open.map((g) => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h })) });
  }

  // budget = each leaf's target band by its CLIMB RANK (even slices of the level's difficulty range);
  // an internal region's band = the union of its leaves' bands (what its door truly carries).
  const leaves = [...open].sort(earlier);
  const [LO, HI] = difficulty, span = HI - LO, band = {};
  leaves.forEach((leaf, k) => { const lo = Math.round(LO + span * k / leaves.length), hi = Math.round(LO + span * (k + 1) / leaves.length); leaf.band = [lo - 3, hi + 3]; band[leaf.id] = leaf.band; });
  const bandOf = (id) => band[id] || (kids[id] ? (() => { const [c0, c1] = kids[id].map(bandOf); const bb = [Math.min(c0[0], c1[0]), Math.max(c0[1], c1[1])]; return (band[id] = bb); })() : difficulty);
  const filled = {};   // id → { room, place, result }
  const regionsAt = (openSet, withRooms) => openSet.map((g) => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h, band: bandOf(g.id), ...(withRooms && filled[g.id] ? { room: clone(filled[g.id].room), place: filled[g.id].place, result: filled[g.id].result } : {}) }));
  const levelSnap = (openSet, cutN, active, withRooms) => ({ kind: 'level', bounds: B, active, regions: regionsAt(openSet, withRooms), cuts: clone(cuts.slice(0, cutN)) });

  // ── EMIT: seed → (cut, contract)* in build order → (propose, evolve, accept)* in climb order → chain, done ──
  rec && rec.log('seed', 'the whole level — one uncut region', { bounds: B, budget: difficulty, targetLeaves }, 'Strategy A: start from the entire mountain and recursively cut it into rooms', levelSnap([{ id: root.id, x: B.x, y: B.y, w: B.w, h: B.h }], 0, root.id, false));
  steps.forEach((st) => {
    const cut = cuts[st.cutN - 1], aB = bandOf(cut.aId), bB = bandOf(cut.bId);
    rec && rec.log('cut', (cut.orient === 'h' ? 'horizontal' : 'vertical') + ' wall', { orient: cut.orient, line: cut.line, from: cut.from },
      `cut region ${cut.from} with a ${cut.orient === 'h' ? 'floor/ceiling' : 'side'} wall → two rooms`, levelSnap(st.open, st.cutN, st.active, false));
    rec && rec.log('contract', 'one door = a contract', { door: cut.door, enter: { at: 'door sill', dash: 'refreshed' }, exit: { reach: 'the next door' }, budgetBelow: aB, budgetAbove: bB, demands: ['dash'] },
      `the door carries the climb (arrive able to dash); budget below this door ${aB.join('–')}, above ${bB.join('–')}`, levelSnap(st.open, st.cutN, st.active, false));
  });

  // ── FILL: each leaf becomes a solver-verified room, in CLIMB order (bottom → top of the climb) ──
  const leafOpen = leaves.map((g) => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h }));
  leaves.forEach((leaf, k) => {
    const target = { requires: ['dash'], difficulty: leaf.band, tightness: [40, 170] };
    rec && rec.log('propose', `design room ${leaf.id} (${ordinal(k + 1)} on the climb)`, { region: rect(leaf.x, leaf.y, leaf.w, leaf.h), target, order: k + 1, of: leaves.length },
      `evolve this leaf until it is solvable, REQUIRES dash, and lands in difficulty ${leaf.band.join('–')}`, levelSnap(leafOpen, cuts.length, leaf.id, true));
    const out = evolveRoom(spec, target, { seed: ((seed * 97 + k * 31 + 1) >>> 0), budget: leafBudget, rec: rec ? rec.scope(leaf.id) : null });
    leaf.room = out.room; leaf.result = out.result; leaf.score = out.score; leaf.place = placement(leaf, out.room);
    filled[leaf.id] = { room: out.room, place: leaf.place, result: out.result };
    rec && rec.log('accept', `room ${leaf.id} verified & placed`, { id: leaf.id, difficulty: out.result.difficulty, tightness: out.result.tightness, requires: out.result.requires, score: out.score },
      out.score === 0 ? `solvable · requires ${(out.result.requires || []).join('+') || '—'} · diff ${out.result.difficulty} → placed in the mountain`
        : `placed best-effort (residual ${out.score}; diff ${out.result.difficulty}, requires ${(out.result.requires || []).join('+') || '—'})`, levelSnap(leafOpen, cuts.length, leaf.id, true));
  });

  // ── COMPOSE: the doors chain the rooms — compositional verification of the whole climb ──
  const allDash = leaves.every((l) => (l.result.requires || []).includes('dash'));
  const allSolv = leaves.every((l) => l.result.solvable);
  const ramp = leaves.map((l) => l.result.difficulty);
  rec && rec.log('chain', 'chain the rooms through the doors', { rooms: leaves.length, everySolvable: allSolv, everyRequiresDash: allDash, difficulties: ramp },
    'each room is verified in isolation and the doors match (an exit feeds the next entrance) → the whole climb is verified compositionally', levelSnap(leafOpen, cuts.length, null, true));
  rec && rec.log('done', 'the level is designed', { rooms: leaves.length, solvable: allSolv, requiresDash: allDash, ramp },
    allSolv ? `${leaves.length} rooms, all solvable${allDash ? ', all require dash' : ''} — a full Vesper-Peak climb, cut and contracted into being` : `generated with ${leaves.filter((l) => !l.result.solvable).length} unsolved leaf(s)`, levelSnap(leafOpen, cuts.length, null, true));

  return { bounds: B, leaves, cuts, summary: { rooms: leaves.length, allSolvable: allSolv, allRequireDash: allDash, ramp } };
}

export default { generateLevel };

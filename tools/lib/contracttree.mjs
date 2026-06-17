// tools/lib/contracttree.mjs — STRATEGY F: one operator, all scales (process self-similarity).
//
// The honest gap the other strategies leave: the system is fractal in DATA (contract-nodes nest) but
// not in PROCESS (A uses a cut operator, the room loop uses a hill-climb). True self-similarity = ONE
// `evolveTree` loop operating on a contract-tree with scale-free operators {cut, merge, retune, redock},
// minimizing a single RESIDUAL — the contract inconsistency (do sibling budgets fold to the parent? do
// leaves dock exit→entry? is the climb monotonic? is the leaf count right?). A valid level is the
// FIXED POINT of that loop: iterate until residual 0. A (top-down) is just evolveTree with `cut` weighted
// high; tuning a room is evolveTree with `retune` weighted high — one function at different depths.
//
//   evolveTree(spec, { seed, rec, targetLeaves, difficulty, mode }) → { tree, residual, leaves }

import { rng } from './roomgen.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
let NID = 0;
const leaf = (budget) => ({ id: 'n' + NID++, kind: 'leaf', budget });
const span = (a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];

// collect leaves left→right (climb order = in-order traversal; child a is climbed before child b)
function leavesOf(node, out = []) { if (node.kind === 'leaf') out.push(node); else { leavesOf(node.children[0], out); leavesOf(node.children[1], out); } return out; }
function nodesOf(node, out = []) { out.push(node); if (node.children) node.children.forEach((c) => nodesOf(c, out)); return out; }
function normalizeFolds(n) { if (n.children) { n.children.forEach(normalizeFolds); n.budget = span(n.children[0].budget, n.children[1].budget); } return n; }

// ── the RESIDUAL: how far the tree is from a consistent contract-tree (0 = the fixed point) ──
function residual(tree, target, difficulty) {
  const leaves = leavesOf(tree); let R = 0;
  R += Math.abs(leaves.length - target) * 12;                                  // want `target` rooms
  // sibling budgets must FOLD to the parent's budget (the parent's door carries its subtree)
  nodesOf(tree).forEach((n) => { if (n.children) { const f = span(n.children[0].budget, n.children[1].budget); R += Math.abs(n.budget[0] - f[0]) + Math.abs(n.budget[1] - f[1]); } });
  // leaves must DOCK (exit of one = entry of the next, i.e. contiguous integers) — which also makes the
  // climb monotonic, so no separate monotonic term is needed (and it would fight the relaxation).
  for (let i = 0; i < leaves.length - 1; i++) R += Math.abs(leaves[i + 1].budget[0] - leaves[i].budget[1] - 1);
  // the whole climb should span the intended difficulty range
  if (leaves.length) { R += Math.abs(leaves[0].budget[0] - difficulty[0]) + Math.abs(leaves[leaves.length - 1].budget[1] - difficulty[1]); }
  return Math.round(R);
}

// ── scale-free OPERATORS (each returns a NEW tree or null) ──
function opCut(tree, r) {   // split a random leaf into two children, dividing its budget by climb rank
  const t = clone(tree), leaves = leavesOf(t), L = leaves[Math.floor(r() * leaves.length)];
  const [lo, hi] = L.budget, mid = Math.round((lo + hi) / 2);
  L.kind = 'cut'; L.children = [leaf([lo, mid]), leaf([mid + 1, hi])]; delete L.budget;
  L.budget = span(L.children[0].budget, L.children[1].budget);
  return { tree: t, op: 'cut', why: 'split a region into two rooms (divide the budget down the cut)' };
}
function opMerge(tree, r) {   // collapse a cut whose children are both leaves back into one leaf
  const t = clone(tree), cuts = nodesOf(t).filter((n) => n.kind === 'cut' && n.children.every((c) => c.kind === 'leaf'));
  if (!cuts.length) return null; const C = cuts[Math.floor(r() * cuts.length)];
  C.budget = span(C.children[0].budget, C.children[1].budget); C.kind = 'leaf'; delete C.children;
  return { tree: t, op: 'merge', why: 'collapse two rooms back into one (over the room budget)' };
}
function opRetune(tree, r) {   // normalize EVERY door's budget to the fold of its subtree (bottom-up)
  const t = clone(tree); if (t.kind === 'leaf') return null;
  const fix = (n) => { if (n.children) { n.children.forEach(fix); n.budget = span(n.children[0].budget, n.children[1].budget); } };
  fix(t);
  return { tree: t, op: 'retune', why: 'retune every door to the fold of its subtree' };
}
function opRedock(tree, r, diff) {   // fix the LEFTMOST violated contract (deterministic → converges to the fixed point)
  const t = clone(tree), leaves = leavesOf(t); if (leaves.length < 2) return null;
  if (leaves[0].budget[0] !== diff[0]) { leaves[0].budget[0] = diff[0]; normalizeFolds(t); return { tree: t, op: 'redock', why: 'anchor the first room to the level floor (entry = difficulty start)' }; }
  for (let i = 0; i < leaves.length - 1; i++) { const want = leaves[i].budget[1] + 1; if (leaves[i + 1].budget[0] !== want) { leaves[i + 1].budget[0] = want; if (leaves[i + 1].budget[1] < want + 4) leaves[i + 1].budget[1] = want + 8; normalizeFolds(t); return { tree: t, op: 'redock', why: 'dock this room\'s entry to the previous room\'s exit' }; } }
  if (leaves[leaves.length - 1].budget[1] !== diff[1]) { leaves[leaves.length - 1].budget[1] = diff[1]; normalizeFolds(t); return { tree: t, op: 'redock', why: 'anchor the last room to the level ceiling (exit = difficulty peak)' }; }
  return null;
}
// build a balanced tree of `n` leaves tiling `diff` contiguously, then JITTER the budgets + stale the
// internal nodes — the jumbled start that retune-mode relaxes back to consistency.
function buildTiled(n, diff, jitter, r) {
  const bands = []; for (let i = 0; i < n; i++) { const lo = Math.round(diff[0] + (diff[1] - diff[0]) * i / n), hi = Math.round(diff[0] + (diff[1] - diff[0]) * (i + 1) / n) - 1; bands.push([lo, hi]); }
  if (jitter) bands.forEach((b) => { b[0] += Math.round((r() - 0.5) * 12); b[1] += Math.round((r() - 0.5) * 12); if (b[1] < b[0] + 4) b[1] = b[0] + 6; });
  const build = (lo, hi) => { if (lo === hi) return leaf(bands[lo]); const mid = (lo + hi) >> 1; return { id: 'n' + NID++, kind: 'cut', budget: [0, 99], children: [build(lo, mid), build(mid + 1, hi)] }; };
  return build(0, n - 1);
}

export function evolveTree(spec, { seed = 1, rec = null, targetLeaves = 6, difficulty = [22, 74], mode = 'cut', budget = 90 } = {}) {
  NID = 0; const r = rng(((seed * 22695477) >>> 0) || 3);
  // start state: 'cut' mode begins as ONE leaf (the whole level) → grows by cutting (this reproduces A);
  // 'retune' mode begins as a jumbled multi-leaf tree → relaxes by retune/redock (this is room-tuning).
  let tree;
  if (mode === 'retune') tree = buildTiled(targetLeaves, difficulty, true, r);   // a jumbled 6-leaf tree → relax the contracts
  else tree = leaf(difficulty.slice());                                          // one leaf (the whole level) → cut it down
  // operator weights per mode — SAME loop, different emphasis (this is the whole point of F)
  const weights = mode === 'retune' ? { retune: 5, redock: 5, cut: 0, merge: 0 } : { cut: 6, retune: 2, redock: 2, merge: 1 };
  const OPS = { cut: opCut, merge: opMerge, retune: opRetune, redock: (t, rr) => opRedock(t, rr, difficulty) };
  const bag = []; for (const k in weights) for (let i = 0; i < weights[k]; i++) bag.push(k);

  let R = residual(tree, targetLeaves, difficulty);
  const snap = (op, why) => ({ kind: 'tree', mode, tree: clone(tree), residual: R, leaves: leavesOf(tree).length, target: targetLeaves, op: op || null, why: why || '' });
  rec && rec.log('seed', `evolveTree · ${mode}-weighted (the ${mode === 'cut' ? 'top-down A' : 'room-tuning'} parameterization)`, { mode, targetLeaves, weights }, 'ONE loop, scale-free operators — minimize the contract residual to its fixed point', snap());

  for (let step = 0; step < budget && R > 0; step++) {
    const opName = bag[Math.floor(r() * bag.length)], made = OPS[opName](tree, r);
    if (!made) continue;
    const R2 = residual(made.tree, targetLeaves, difficulty);
    rec && rec.log('mutate', made.op, { residual: R2, leaves: leavesOf(made.tree).length }, made.why, { kind: 'tree', mode, tree: clone(made.tree), residual: R2, leaves: leavesOf(made.tree).length, target: targetLeaves, op: made.op, why: made.why });
    if (R2 < R) { tree = made.tree; R = R2; rec && rec.log('accept', `${made.op} ↓ residual ${R}`, { residual: R }, `lower residual (${R}) → keep — the tree relaxes toward its fixed point`, snap(made.op, made.why)); }
  }
  rec && rec.log('done', R === 0 ? 'fixed point reached' : `best-effort (residual ${R})`, { residual: R, leaves: leavesOf(tree).length, mode },
    R === 0 ? `consistent contract-tree: ${leavesOf(tree).length} rooms, budgets fold, contracts dock, climb ramps — the ATTRACTOR of one loop` : `relaxed to residual ${R}`, snap());

  return { tree, residual: R, leaves: leavesOf(tree).length, mode };
}

export default { evolveTree };

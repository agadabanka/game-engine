// tools/lib/genduel.mjs — STRATEGY C: guided (LLM-as-node-oracle) vs random mutation.
//
// Two hill-climbs race from the SAME seed room toward the SAME target — one driven by a GUIDED oracle
// (reads the solver verdict and makes a targeted edit), one by RANDOM mutation. Stepping them in
// lockstep and recording both scores each step shows the oracle converging in far fewer attempts: the
// point is that a node-oracle (an LLM, here a deterministic policy) turns a blind search into a guided
// one. Same seed for both ⇒ we compare the POLICY, not luck.
//
//   generateDuel(spec, target, { seed, rec, budget }) → { guided, random, summary }

import { seedRoom, mutateRoom, guidedMutate, score, rng } from './roomgen.mjs';
import { solveRoom } from './solver.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const verdict = (res) => res && res.solvable ? `solvable · requires [${(res.requires || []).join(',')}] · diff ${res.difficulty}` : `unsolvable`;

export function generateDuel(spec, target, { seed = 1, rec = null, budget = 120 } = {}) {
  const rG = rng(seed), rR = rng(seed);
  let cg = seedRoom(), rg = solveRoom(cg, spec), sg = score(rg, target);
  let cr = seedRoom(), rr = solveRoom(cr, spec), sr = score(rr, target);
  const hg = [sg], hr = [sr]; let dg = -1, dr = -1, why = '';
  const snap = (active) => ({
    kind: 'duel', target, active,
    guided: { room: clone(cg), score: sg, res: rg, hist: hg.slice(), done: dg, why },
    random: { room: clone(cr), score: sr, res: rr, hist: hr.slice(), done: dr },
  });
  rec && rec.log('seed', 'two climbs from one seed: guided oracle vs random', { target, seed }, 'same start, same target, same RNG budget — only the PROPOSER differs', snap('both'));

  for (let step = 0; step < budget && (sg > 0 || sr > 0); step++) {
    if (sg > 0) {
      const cand = guidedMutate(cg, rg, target, rG); why = cand.guidedWhy || '';
      const res2 = solveRoom(cand.room, spec), s2 = score(res2, target);
      if (s2 < sg) { cg = cand.room; rg = res2; sg = s2; }
      if (sg === 0 && dg < 0) dg = step + 1;
    }
    hg.push(sg);
    if (sr > 0) {
      const cand = mutateRoom(cr, rR);
      const res2 = solveRoom(cand.room, spec), s2 = score(res2, target);
      if (s2 < sr) { cr = cand.room; rr = res2; sr = s2; }
      if (sr === 0 && dr < 0) dr = step + 1;
    }
    hr.push(sr);
    rec && rec.log('mutate', `step ${step + 1}`, { guided: sg, random: sr, why }, `oracle: ${why || 'fine-tune'} — guided ${sg} vs random ${sr}`, snap('both'));
  }
  const winner = dg < 0 && dr < 0 ? 'neither' : dg < 0 ? 'random' : dr < 0 ? 'guided' : (dg <= dr ? 'guided' : 'random');
  rec && rec.log('done', 'duel complete', { guidedConverged: dg, randomConverged: dr, guidedScore: sg, randomScore: sr, winner, speedup: dg > 0 && dr > 0 ? +(dr / dg).toFixed(1) : null },
    `guided ${dg > 0 ? 'hit target at step ' + dg : 'best ' + sg + ' (' + verdict(rg) + ')'} · random ${dr > 0 ? 'hit target at step ' + dr : 'best ' + sr + ' (' + verdict(rr) + ')'}`, snap(null));

  return { guided: { room: cg, res: rg, converged: dg }, random: { room: cr, res: rr, converged: dr }, summary: { guidedConverged: dg, randomConverged: dr, winner, speedup: dg > 0 && dr > 0 ? +(dr / dg).toFixed(1) : null } };
}

export default { generateDuel };

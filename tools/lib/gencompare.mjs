// tools/lib/gencompare.mjs — STRATEGY COMPARISON: run A / B / C on the SAME seed and show the tradeoffs.
//
// Same spec, same seed, same difficulty range — only the STRATEGY differs. We surface what each one buys
// you: A (top-down BSP) is structure-first (a tree of contracts, ramp can plateau at the hard end);
// B (bottom-up grow+chain) is content-first (a discovered, always-monotonic ramp); C (guided vs random)
// is about the SEARCH (an oracle converging far faster than blind mutation). The trace is short (a
// dashboard, not a build movie) — one `compare` snapshot the sandbox renders as a side-by-side table.
//
//   generateComparison(spec, { seed, rec, difficulty }) → { strategies }

import { generateLevel } from './genbsp.mjs';
import { generateChain } from './genchain.mjs';
import { generateDuel } from './genduel.mjs';
import { recorder } from './designtrace.mjs';

const mono = (ramp) => ramp.length > 1 && ramp.every((d, i) => i === 0 || d >= ramp[i - 1]);

export function generateComparison(spec, { seed = 1, rec = null, difficulty = [22, 74] } = {}) {
  // run each strategy WITHOUT recording its full trace (we only need the summary + event count) so the
  // comparison stays cheap; a throwaway recorder gives us the decision count each one took.
  const rA = recorder(); const t0 = Date.now(); const A = generateLevel(spec, { seed, rec: rA, targetLeaves: 6, leafBudget: 55, difficulty }); const tA = Date.now() - t0;
  const rB = recorder(); const t1 = Date.now(); const B = generateChain(spec, { seed, rec: rB, rooms: 6, leafBudget: 55, difficulty }); const tB = Date.now() - t1;
  const target = { requires: ['dash'], difficulty: [40, 75], tightness: [40, 140] };
  const rC = recorder(); const t2 = Date.now(); const C = generateDuel(spec, target, { seed, rec: rC, budget: 160 }); const tC = Date.now() - t2;

  const strategies = [
    { id: 'A', name: 'BSP — top-down', desc: 'cut the whole space into a contract-tree, then fill the leaves', kind: 'level', ramp: A.summary.ramp, monotonic: mono(A.summary.ramp), allDash: A.summary.allRequireDash, rooms: A.summary.rooms, decisions: rA.events.length, ms: tA, span: [Math.min(...A.summary.ramp), Math.max(...A.summary.ramp)] },
    { id: 'B', name: 'grow + chain — bottom-up', desc: 'grow diverse rooms blind, then sort + dock into a ramp', kind: 'level', ramp: B.summary.ramp, monotonic: B.summary.monotonic, allDash: B.summary.allRequireDash, rooms: B.summary.rooms, decisions: rB.events.length, ms: tB, span: [Math.min(...B.summary.ramp), Math.max(...B.summary.ramp)] },
    { id: 'C', name: 'guided vs random', desc: 'an oracle reads the verdict and edits with intent vs blind mutation', kind: 'search', guided: C.summary.guidedConverged, random: C.summary.randomConverged, speedup: C.summary.speedup, winner: C.summary.winner, decisions: rC.events.length, ms: tC },
  ];
  const snap = { kind: 'compare', seed, difficulty, strategies };
  rec && rec.log('seed', 'run A · B · C on the same seed', { seed, difficulty }, 'same spec, same seed — only the strategy differs; compare what each buys you', snap);
  rec && rec.log('done', 'comparison ready', strategies, `A ramp ${A.summary.ramp.join('→')}${mono(A.summary.ramp) ? '' : ' (plateaus)'} · B ramp ${B.summary.ramp.join('→')}${B.summary.monotonic ? ' (monotonic)' : ''} · C oracle ${C.summary.speedup ? C.summary.speedup + '× faster' : C.summary.winner}`, snap);
  return { strategies };
}

export default { generateComparison };

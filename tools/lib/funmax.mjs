// tools/lib/funmax.mjs — #38 the FUN-MAX loop: gate-constrained hill-climb.
// Repeatedly proposes an edit (evolve #37), scores it with the feel model (#35), and KEEPS it only
// if FUN improves AND a fast 0-death SAFETY proxy holds (reachability #34 + the hop envelope) —
// rolling back anything that regresses or would strand the autopilot. Writes the improved level +
// an edit log. The proxy is a fast pre-filter; the REAL 0-death gate (`npm run eval`) is the final
// acceptance the operator runs on the output. Pure + deterministic.
import { predict } from './feelmodel.mjs';
import { chooseFallback } from './evolve.mjs';
import { reach } from './reach.mjs';

/** Fast 0-death SAFETY proxy for a candidate edit: no newly-stranded rewards, and momentum mechanics
 *  (dashpad/conveyor) sit over solid ground (never a pit). Crumble intentionally bridges a gap. */
export function gateSafe(level, opts = {}) {
  const maxUn = opts.maxUnreachable != null ? opts.maxUnreachable : (opts.baseUnreachable || 0);
  if (reach(level).un.length > maxUn) return false;
  const onGround = (x) => (level.ground || []).some(([a, b]) => x >= a - 6 && x <= b + 6);
  for (const d of (level.dashpad || [])) if (!onGround(d.x)) return false;
  for (const z of (level.conveyor || [])) if (!onGround((z.x0 + z.x1) / 2)) return false;
  return true;
}

/** Hill-climb a level's predicted FUN under the safety proxy. Returns { level, fun0, fun1, log }. */
export function funMax(level, opts = {}) {
  const steps = opts.steps || 12, propose = opts.propose || chooseFallback, safe = opts.gateSafe || gateSafe;
  const base = reach(level).un.length;                       // tolerate the level's existing bonus-strands
  let L = JSON.parse(JSON.stringify(level));
  const fun0 = predict(L).fun, log = [];
  for (let i = 0; i < steps; i++) {
    const e = propose(L, opts); if (!e) break;
    const cur = predict(L).fun, f = predict(e.level).fun;
    const kept = f > cur + 0.1 && safe(e.level, { ...opts, baseUnreachable: base });
    log.push({ step: i, type: e.type, x: e.x, fun: f, kept });
    if (kept) L = e.level;
  }
  return { level: L, fun0, fun1: predict(L).fun, log, kept: log.filter((l) => l.kept).length };
}

/** Run fun-max across a campaign; returns improved levels + per-level before/after + the edit log. */
export function funMaxCampaign(levels, opts = {}) {
  const out = levels.map((L) => funMax(L, opts));
  const fun0 = +(out.reduce((s, r) => s + r.fun0, 0) / Math.max(1, out.length)).toFixed(1);
  const fun1 = +(out.reduce((s, r) => s + r.fun1, 0) / Math.max(1, out.length)).toFixed(1);
  return { levels: out.map((r) => r.level), results: out, meanFun0: fun0, meanFun1: fun1 };
}

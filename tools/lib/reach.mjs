// tools/lib/reach.mjs — #34 reachability model (pixel-space, engine level data).
// A geometric heuristic ported from deepfin's reach.js: a coin/reward is REACHABLE if the hero can
// stand somewhere and get to it — by a JUMP off a surface ≤ jumpPx below it (±reachX), a SPRING/pad
// launch (≤ springPx), or it sits just above walkable ground. A coin floating over a pit with no
// launch point comes back UNREACHABLE → the design loop (#37) relocates it or adds a spring.
//
//   import { reach, playReach } from './reach.mjs';
//   reach(level) → { reach:[{x,y,how}], un:[…], total, reachable }
// `level` is the engine level spec: { groundY, ground:[[x0,x1]], platforms:[{x,y,w}],
// oneway:[{x,y,w}], pads:[{x}]|[x], coins:[{x,y}] }.

const DEF = { jumpPx: 132, springPx: 320, reachX: 90, springX: 72, walkPx: 40 };

function surfaces(level, { groundOnly = false } = {}) {
  const groundY = level.groundY != null ? level.groundY : 470;
  const out = [];
  (level.ground || []).forEach((g) => out.push({ x0: g[0], x1: g[1], top: groundY }));
  if (!groundOnly) {
    (level.platforms || []).forEach((p) => out.push({ x0: p.x, x1: p.x + p.w, top: p.y }));
    (level.oneway || []).forEach((p) => out.push({ x0: p.x, x1: p.x + p.w, top: p.y }));
  }
  return out;
}
const padX = (p) => (typeof p === 'number' ? p : p.x);

function classify(level, opts, groundOnly) {
  const o = { ...DEF, ...opts };
  const groundY = level.groundY != null ? level.groundY : 470;
  const surf = surfaces(level, { groundOnly });
  const pads = (level.pads || []).concat(level.springs || []);
  // highest stand-point (smallest top y that is still BELOW the coin) within horizontal reach
  const standBelow = (cx, cy) => {
    let best = null;
    for (const s of surf) if (cx >= s.x0 - o.reachX && cx <= s.x1 + o.reachX && s.top > cy) best = best == null ? s.top : Math.min(best, s.top);
    return best;
  };
  const reach = [], un = [];
  (level.coins || []).forEach((c) => {
    let how = null;
    const sb = standBelow(c.x, c.y);
    if (sb != null && sb - c.y <= o.jumpPx) how = sb - c.y <= o.walkPx ? 'walk' : 'jump';
    if (!how) for (const p of pads) if (Math.abs(padX(p) - c.x) <= o.springX && groundY - c.y <= o.springPx) { how = 'spring'; break; }
    (how ? reach : un).push({ x: c.x, y: c.y, how, standBelow: sb });
  });
  return { reach, un, total: (level.coins || []).length, reachable: reach.length };
}

/** Geometric reachability — any surface (ground OR floating platform/one-way) can be the stand point. */
export function reach(level, opts = {}) { return classify(level, opts, false); }

/** PLAY-AWARE reachability — stricter: only the MAIN walkable ground + pads count, so a coin stranded
 *  on a high isolated ledge the route never visits comes back unreachable (bring it to the path). */
export function playReach(level, opts = {}) { return classify(level, opts, true); }

/** Lint a campaign: the unreachable rewards per level (empty = all reachable). */
export function reachLint(levels, opts = {}) {
  return levels.map((L, i) => ({ level: i, name: L.name, un: reach(L, opts).un })).filter((r) => r.un.length);
}

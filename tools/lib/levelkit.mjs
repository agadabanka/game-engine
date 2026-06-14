// Level-kit (7.2) — reusable level-design heuristics on top of the Studio.Level DSL.
// Turns the "geometry rules that keep the 0-death autopilot gate green" — previously
// only PROSE in level-file comments — into a deterministic, tested LINT, plus a
// balanced-level scaffold for authoring. Platformer DSL: ground = [[x1,x2,mat]...]
// segments (gaps are the spans between them), walls = [{x,tiles,mat}], spawn/goal/coins.
//
//   import { lintLevel, gaps, scaffoldLevel } from './levelkit.mjs';
//   const { ok, issues } = lintLevel(level);

/** Physics-derived rules. The autopilot's full hop reaches ~200px across / ~3 tiles up. */
export const PLATFORMER_RULES = Object.freeze({
  tile: 40,
  maxGapPx: 200,           // a gap wider than the hop is unreachable → death
  maxWallTiles: 2,         // a wall taller than the hop can't be cleared
  minWallClearancePx: 200, // a wall-hop sails ~200px, so a wall must sit a runway away from a pit
});

/** No-ground spans (gaps) computed from a level's sorted ground segments → [[a,b,width]]. */
export function gaps(level) {
  const segs = [...(level.ground || [])].map((s) => [s[0], s[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0; i < segs.length - 1; i++) { const end = segs[i][1], start = segs[i + 1][0]; if (start > end) out.push([end, start, start - end]); }
  return out;
}

/** Is x over solid ground? */
export function onGround(level, x) { return (level.ground || []).some(([a, b]) => x >= a && x <= b); }

/**
 * Lint a platformer level against the reachability/balance rules.
 * @returns {{ ok:boolean, issues:{rule:string,detail:string}[] }}
 */
export function lintLevel(level, rules = PLATFORMER_RULES) {
  const issues = [];
  const add = (rule, detail) => issues.push({ rule, detail });
  const G = gaps(level);
  for (const [a, b, w] of G) if (w > rules.maxGapPx) add('gap-too-wide', `gap ${a}-${b} is ${w}px > ${rules.maxGapPx} (unreachable)`);
  for (const wll of (level.walls || [])) {
    if ((wll.tiles || 1) > rules.maxWallTiles) add('wall-too-tall', `wall@${wll.x} is ${wll.tiles} tiles > ${rules.maxWallTiles}`);
    for (const [a, b] of G) { const near = Math.min(Math.abs(wll.x - a), Math.abs(wll.x - b)); if (near < rules.minWallClearancePx) add('wall-near-gap', `wall@${wll.x} within ${near}px of gap ${a}-${b} (need ≥${rules.minWallClearancePx})`); }
  }
  if (level.spawn && !onGround(level, level.spawn.x)) add('spawn-in-gap', `spawn x=${level.spawn.x} is not over ground`);
  if (level.goal != null && !onGround(level, level.goal)) add('goal-in-gap', `goal x=${level.goal} is not over ground`);
  for (const e of (level.enemies || [])) if (!onGround(level, e.x)) add('enemy-in-gap', `enemy x=${e.x} is not over ground (will fall)`);
  return { ok: issues.length === 0, issues };
}

/**
 * Scaffold a baseline, lint-clean platformer level (authoring helper). Lays solid
 * ground with safe gaps, one safely-placed wall, a coin trail, and a patroller.
 * @param {{name?:string,width?:number,groundY?:number,gapCount?:number,sky?:number}} o
 */
export function scaffoldLevel(o = {}) {
  const width = o.width || 1920, groundY = o.groundY || 470, gapCount = Math.max(0, o.gapCount ?? 2);
  const gapW = 120, runway = 280;                 // safe gap (<200) + generous wall clearance
  const ground = []; const walls = []; const coins = []; const enemies = [];
  let x = 0; const span = Math.floor((width - gapCount * gapW) / (gapCount + 1));
  for (let i = 0; i <= gapCount; i++) {
    const a = x, b = Math.min(width, x + span); ground.push([a, b, 'solid']);
    // a wall mid-segment, kept a runway away from both segment ends (so away from gaps)
    if (b - a > 2 * runway) { walls.push({ x: Math.round((a + b) / 2), tiles: 2, mat: 'stone' }); }
    for (let cx = a + 80; cx < b - 80; cx += 120) coins.push({ x: cx, y: groundY - 30 });
    if (i < gapCount && b - a > 200) enemies.push({ x: a + Math.round((b - a) * 0.6), patrol: 50 });
    x = b + gapW;
  }
  const level = { name: o.name || 'Scaffold', tile: 40, width, height: 540, groundY, sky: o.sky ?? 0x1d2b53, spawn: { x: 60, y: groundY - 110 }, goal: width - 60, ground, walls, coins, enemies };
  return level;
}

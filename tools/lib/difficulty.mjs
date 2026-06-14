// tools/lib/difficulty.mjs — #33 difficulty-curve helpers.
// A campaign should RISE: a calm opening (somewhere to climb from), a steady ramp, and a LATE
// climax (~84% in) — not a flat line. These are the pure, deterministic knobs a builder turns as
// progress `t` (campaign or in-level, in [0,1]) advances, lifted from deepfin's levelgen ramps
// (wider gaps later · enemies 1→3 · every 3rd elite). Builders (#39) and the design-pass (#41)
// read them; nothing here touches physics, so a run stays deterministic.

const clamp01 = (t) => Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));

/** Enemy COUNT for a stretch at progress t — rises min → max (deepfin: 1 → 3). */
export function rampEnemies(t, { min = 1, max = 3 } = {}) { return min + Math.round(clamp01(t) * (max - min)); }

/** Gap / hazard WIDTH (px) at progress t — widens base → max. The caller still clamps to the
 *  hop envelope (maxGapPx) so it stays gate-safe; this only shapes the rise. */
export function rampGap(t, { base = 120, max = 200 } = {}) { return Math.round(base + clamp01(t) * (max - base)); }

/** Hazard DENSITY (0..1) at progress t — more deadly stretches later. */
export function rampHazard(t, { base = 0.15, max = 0.6 } = {}) { return +(base + clamp01(t) * (max - base)).toFixed(3); }

/** Is the i-th of `every` things ELITE/big? (deepfin: every 3rd drone is large.) */
export function isBig(i, every = 3) { return every > 0 && (((i | 0) % every) + every) % every === every - 1; }

/** The CLIMAX index of an n-item campaign — the hardest level sits ~84% in (calm open, late peak). */
export function climaxIndex(n, frac = 0.84) { return n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))); }

/** The calm OPENING test — keep the first ~10% gentle so the arc has somewhere to rise from. */
export function isCalmOpening(t, frac = 0.1) { return clamp01(t) < frac; }

/** The rising-arc difficulty WEIGHT (0..1) for level i of n: ramps up to the climax, then a small
 *  denouement (a touch easier after the peak, so the finale lands rather than grinds). */
export function arcWeight(i, n, { climax = 0.84 } = {}) {
  if (n <= 1) return 1;
  const t = (i | 0) / (n - 1), c = clamp01(climax) || 0.84;
  return +(t <= c ? (t / c) : (1 - 0.25 * ((t - c) / (1 - c)))).toFixed(3);
}

/** A whole-campaign PROFILE — the per-level knobs a builder/world-gen can read at a glance. */
export function difficultyArc(n, opts = {}) {
  const peak = climaxIndex(n, opts.climax);
  return Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 1 : i / (n - 1);
    return { level: i, t: +t.toFixed(3), weight: arcWeight(i, n, opts), enemies: rampEnemies(t, opts), gap: rampGap(t, opts), hazard: rampHazard(t, opts), climax: i === peak, calm: isCalmOpening(t) };
  });
}

// tools/lib/feelmodel.mjs — #35 the PREDICTED FEEL MODEL (interest curve → FUN).
// A fast, deterministic stand-in for a VLM/Gemini fun score: it predicts the per-window interest
// curve straight from a level's ELEMENT PLACEMENT (interest weights from the element library, #29;
// novelty/fatigue from #32), then runs the four-component fun math (engagement / dynamics / arc /
// flow) over it. Instant feedback for the design loop (#37) + fun-max (#38); the real Gemini score
// is the ground truth you stamp at milestones. Pure (node + browser), reads engine pixel level data.
import { interestOf } from './elements.mjs';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function pearson(a, b) { const n = a.length, ma = mean(a), mb = mean(b); let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? nu / Math.sqrt(da * db) : 0; }
function slope(y) { const n = y.length; if (n < 2) return 0; const mx = (n - 1) / 2, my = mean(y); let nu = 0, de = 0; for (let i = 0; i < n; i++) { nu += (i - mx) * (y[i] - my); de += (i - mx) ** 2; } return de ? nu / de : 0; }

/** The IDEAL interest curve: rises through the level with a late spike at ~84% (the climax). */
export const idealAt = (t) => 4 + 4 * t + 2.2 * Math.exp(-(((t - 0.84) / 0.11) ** 2));

/** Every "beat" in an engine level (pixel space) → { x, type, interest } (interest from the library). */
export function collectBeats(level) {
  const b = [];
  (level.enemies || []).forEach((e) => { const type = e.boss ? 'boss' : e.fly ? 'flyer' : 'walker'; b.push({ x: e.x, type, interest: interestOf(type) }); });
  (level.pads || []).concat(level.springs || []).forEach((p) => b.push({ x: p.x != null ? p.x : p, type: 'spring', interest: interestOf('spring') }));
  (level.conveyor || []).forEach((z) => b.push({ x: (z.x0 + z.x1) / 2, type: 'conveyor', interest: interestOf('conveyor') }));
  (level.dashpad || []).forEach((d) => b.push({ x: d.x, type: 'dashpad', interest: interestOf('dashpad') }));
  (level.crumble || []).forEach((c) => b.push({ x: c.x + (c.w || 0) / 2, type: 'crumble', interest: interestOf('crumble') }));
  (level.oneway || []).forEach((o) => b.push({ x: o.x + (o.w || 0) / 2, type: 'oneway', interest: interestOf('oneway') }));
  (level.fields || []).forEach((f) => b.push({ x: f.x + (f.w || 0) / 2, type: f.type, interest: interestOf(f.type) }));
  // gaps: the air between consecutive ground segments
  const g = (level.ground || []).slice().sort((a, c) => a[0] - c[0]);
  for (let i = 1; i < g.length; i++) { const a = g[i - 1][1], c = g[i][0]; if (c > a + 4) b.push({ x: (a + c) / 2, type: 'gap', interest: interestOf('gap') }); }
  return b;
}

/** Predict the interest curve + the four components + FUN from placement alone. */
export function predict(level, { nWin } = {}) {
  const W = level.width || level.W || 1920;
  const n = nWin || Math.max(16, Math.min(34, Math.round(W / 110)));   // ~110px windows
  const beats = collectBeats(level);
  const win = Array.from({ length: n }, () => ({ peak: 0, dom: null, count: 0, coins: 0 }));
  const wi = (x) => Math.max(0, Math.min(n - 1, Math.floor((x / W) * n)));
  beats.forEach((bt) => { const w = win[wi(bt.x)]; w.count++; if (bt.interest > w.peak) { w.peak = bt.interest; w.dom = bt.type; } });
  (level.coins || []).forEach((c) => { win[wi(c.x)].coins++; });
  const seen = new Set(); let prevDom = null;
  const curve = win.map((w) => {
    let v = 2.4;                                              // bare ground is a touch dull
    if (w.peak > 0) v = 2.0 + w.peak * 0.72;                  // dominant beat sets the height
    if (w.count > 1) v += Math.min(1.2, (w.count - 1) * 0.4); // combos add interest
    v += w.coins >= 3 ? 0.8 : w.coins > 0 ? 0.3 : 0;          // a collectible beat
    if (w.dom && !seen.has(w.dom)) { seen.add(w.dom); v += 1.1; }   // NOVELTY — first meeting of a verb
    else if (w.dom && w.dom === prevDom) v *= 0.84;            // FATIGUE — same verb twice running
    prevDom = w.dom || prevDom;
    return Math.max(0, Math.min(10, +v.toFixed(2)));
  });
  return { curve, n, W, ...score(curve, W, n) };
}

/** The four-component fun math over a predicted (or measured) interest curve. */
export function score(curve, W, n) {
  n = n || curve.length;
  const ideal = curve.map((_, i) => idealAt(n > 1 ? i / (n - 1) : 0));
  const engagement = clamp(mean(curve) / 8);
  const meanAbsDiff = curve.length > 1 ? mean(curve.slice(1).map((v, i) => Math.abs(v - curve[i]))) : 0;
  const dynamics = clamp(meanAbsDiff / 2.5);
  const arcCorr = (pearson(curve, ideal) + 1) / 2;
  const peakPos = curve.indexOf(Math.max(...curve)) / Math.max(1, n - 1);
  const lateBonus = clamp(1 - Math.abs(peakPos - 0.84) / 0.45);
  const trend = clamp((slope(curve) + 0.1) / 0.4);
  const arc = 0.5 * arcCorr + 0.3 * lateBonus + 0.2 * trend;
  let longestFlat = 0, run = 0;
  for (let i = 1; i < curve.length; i++) { if (Math.abs(curve[i] - curve[i - 1]) <= 1 && curve[i] <= 5) { run++; longestFlat = Math.max(longestFlat, run); } else run = 0; }
  const deadIdx = curve.map((v, i) => (v < 3.4 ? i : -1)).filter((i) => i >= 0);
  const flow = clamp(1 - (deadIdx.length / n) * 1.5 - (longestFlat / n) * 1.0);
  const fun = +(100 * (0.35 * engagement + 0.15 * dynamics + 0.25 * arc + 0.25 * flow)).toFixed(1);
  const deadAir = deadIdx.map((i) => `${Math.round(i * W / n)}-${Math.round((i + 1) * W / n)}`);
  return { components: { engagement: +engagement.toFixed(2), dynamics: +dynamics.toFixed(2), arc: +arc.toFixed(2), flow: +flow.toFixed(2) }, fun, deadAir, peakPos: +peakPos.toFixed(2), deadIdx };
}

/** Per-level FUN report for a campaign (weakest/strongest at a glance). */
export function funReport(levels, opts = {}) {
  const rows = levels.map((L, i) => ({ level: i, name: L.name, ...predict(L, opts) }));
  const funs = rows.map((r) => r.fun);
  return { rows, mean: +mean(funs).toFixed(1), weakest: rows[funs.indexOf(Math.min(...funs))], strongest: rows[funs.indexOf(Math.max(...funs))] };
}

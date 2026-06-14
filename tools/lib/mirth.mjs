// Studio.Mirth — a "funny" felt-comedy model, sibling to Studio.Brawl.fun. A NEW gate:
// where FUN measures whether a run is engaging, MIRTH measures whether it's FUNNY.
//
// Comedy = EXAGGERATION (slapstick physics) + TIMING (a varied comic rhythm, not
// metronomic, not clumped) + VARIETY (incongruous gag kinds) + SURPRISE (unexpected
// beats) at the right DENSITY (not dry, not noisy). Score a run's comedic events
// 0..100; the funny gate passes on MIRTH >= ~65.
//
// This is the canonical, TESTED node scorer (used by a game's eval.mjs over events
// collected in-browser). The SDK mirrors it as Studio.Mirth for in-game use / a live
// mirth meter — keep the two algorithms identical.
//
// events: [{ t, f, mag? }]  where
//   t   = gag kind: 'bounce' | 'pratfall' | 'smooch' | 'reaction' | 'surprise' | 'combo'
//   f   = frame the gag happened (for timing/density)
//   mag = intensity of a physical gag (squash/bounce/launch magnitude), ~1..3

const clamp = (v) => Math.max(0, Math.min(1, v));
const bell = (x, mid, w) => clamp(1 - Math.abs(x - mid) / w); // 1 at mid, 0 at ±w

/**
 * @param {{t:string,f:number,mag?:number}[]} events
 * @param {{frame?:number,start?:number}} [ctx]
 * @returns {{mirth:number, parts:object, beats:number, durS:number}}
 */
export function mirthScore(events, ctx = {}) {
  const evs = (events || []).slice().sort((a, b) => a.f - b.f);
  const lastF = evs.length ? evs[evs.length - 1].f : 1;
  const durF = Math.max(1, (ctx.frame != null ? ctx.frame : lastF) - (ctx.start || 0));
  const dur = durF / 60;

  // SLAPSTICK — average exaggeration of the physical gags (bounce/pratfall magnitude)
  const slap = evs.filter((e) => e.t === 'bounce' || e.t === 'pratfall');
  const exaggeration = slap.length ? clamp(slap.reduce((s, e) => s + (e.mag || 1), 0) / slap.length / 2) : 0.2;
  // DENSITY — gags per 5s, sweet spot ~5 (dry below, noisy above)
  const density = bell((evs.length / Math.max(1, dur)) * 5, 5, 4);
  // VARIETY — distinct gag kinds (incongruity); 6 kinds = full marks
  const kinds = new Set(evs.map((e) => e.t));
  const variety = clamp(kinds.size / 6);
  // TIMING — comic rhythm: spacing between gags should VARY (cv≈0.6 ideal; metronomic or clumped isn't funny)
  const gaps = [];
  for (let i = 1; i < evs.length; i++) gaps.push(evs[i].f - evs[i - 1].f);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length ? Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) : 0;
  const cv = mean ? sd / mean : 0;
  const timing = gaps.length ? bell(cv, 0.6, 0.55) : 0.3;
  // SURPRISE — unexpected beats (surprise pickups, combos)
  const surprise = clamp(evs.filter((e) => e.t === 'surprise' || e.t === 'combo').length / 4);

  const mirth = 100 * (0.28 * exaggeration + 0.20 * density + 0.18 * variety + 0.18 * timing + 0.16 * surprise);
  return {
    mirth: Math.round(mirth * 10) / 10,
    parts: { exaggeration: +exaggeration.toFixed(2), density: +density.toFixed(2), variety: +variety.toFixed(2), timing: +timing.toFixed(2), surprise: +surprise.toFixed(2) },
    beats: evs.length, durS: Math.round(dur),
  };
}

/** The funny gate threshold (mirror in eval.mjs / the SDK). */
export const MIRTH_GATE = 65;

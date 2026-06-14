// tools/lib/campaign.mjs — #43 the CAMPAIGN stage: WORLDS struct + arc-shaping + validation.
// A campaign should be a deliberate ARC, not 5 same-weight levels: a calm opening, a steady rise,
// a LATE climax (~84%), then the finale/boss. This builds the WORLDS schema (name/theme/tag/
// difficulty/boss) from GAME_META, shapes a set of levels into that arc (deepfin's shapeArc), and
// validates the result (calm open · late climax). The title's world-select reads the WORLDS struct
// (tags + thumbnails). Composes difficulty (#33), feel (#35), story (#42). Pure + deterministic.
import { climaxIndex, arcWeight } from './difficulty.mjs';
import { funReport } from './feelmodel.mjs';
import { beatArc } from './story.mjs';

/** The WORLDS struct: per-world name/theme/tag/difficulty/boss/beat. The final world hosts the boss;
 *  the climax (~84%) is tagged 'Climax'. The title world-select renders this (tag + colour thumbnail). */
export function worldsFrom(meta = {}, opts = {}) {
  const names = (meta.worlds && meta.worlds.length ? meta.worlds : ['World 1', 'World 2', 'World 3', 'World 4', 'World 5']).slice();
  const n = names.length, peak = climaxIndex(n), heads = beatArc(n);
  return names.map((name, i) => ({
    name, theme: (opts.themes && opts.themes[i]) || name,
    tag: i === 0 ? 'Start' : i === n - 1 ? 'Finale' : i === peak ? 'Climax' : 'Trial',
    difficulty: arcWeight(i, n), boss: i === n - 1, beat: heads[i],
    color: (opts.colors && opts.colors[i]) != null ? opts.colors[i] : undefined,
  }));
}

/** shapeArc — reorder `levels` so the campaign RISES with a LATE climax: rank by a difficulty proxy
 *  (a score fn, else predicted FUN), then seat the hardest at the climax slot and the rest ascending.
 *  Returns { order:[idx…], levels:[…] }. Deterministic. */
export function shapeArc(levels, score) {
  const n = levels.length; if (n <= 2) return { order: levels.map((_, i) => i), levels: levels.slice() };
  const f = typeof score === 'function' ? levels.map(score) : funReport(levels).rows.map((r) => r.fun);
  const ranked = levels.map((_, i) => i).sort((a, b) => f[a] - f[b]);   // easiest → hardest
  const hardest = ranked.pop();
  const peak = climaxIndex(n), order = [];
  for (let i = 0, k = 0; i < n; i++) order.push(i === peak ? hardest : ranked[k++]);
  return { order, levels: order.map((i) => levels[i]) };
}

/** Validate the campaign arc: a calm opening + a LATE climax. Accepts a WORLDS struct or a number[]. */
export function validateArc(worldsOrNums, opts = {}) {
  const arr = worldsOrNums.map((w) => (typeof w === 'number' ? w : w.difficulty));
  const n = arr.length, peak = arr.indexOf(Math.max(...arr)), issues = [];
  if (arr[0] > (opts.calmMax != null ? opts.calmMax : 0.25)) issues.push(`opening is not calm (${arr[0]})`);
  if (peak < n * (opts.climaxMin != null ? opts.climaxMin : 0.55)) issues.push(`climax is early (world ${peak + 1}/${n})`);
  return { ok: issues.length === 0, issues, peak };
}

/** The whole CAMPAIGN doc: WORLDS struct + the arc check + the world-map (tags) the title renders. */
export function campaign(meta, opts = {}) {
  const worlds = worldsFrom(meta, opts);
  return { worlds, arc: validateArc(worlds, opts), map: worlds.map((w) => ({ name: w.name, tag: w.tag, boss: w.boss })) };
}

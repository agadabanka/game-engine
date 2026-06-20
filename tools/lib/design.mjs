// tools/lib/design.mjs — #36 the DESIGN-INTENT schema (MDA + Schell lenses, per level).
// Records WHY a level is shaped the way it is — its essence, the MDA aesthetic it evokes, the ONE
// signature verb it teaches (#32), where it sits on the rising difficulty arc (#33), its predicted
// interest curve + FUN (#35), and the Schell lenses we judged it through — then VALIDATES that the
// shipped level actually matches that intent. The build writes it; /design renders it; the eval can
// gate on validate(). Pure (node + browser); composes the element / difficulty / feel libs.
import { FUN, signatureFor, interestOf, ELEMENT_LIBRARY } from './elements.mjs';
import { arcWeight, climaxIndex, isCalmOpening } from './difficulty.mjs';
import { predict } from './feelmodel.mjs';

// Jesse Schell's lenses we actually design platformer levels through (number + the question it asks).
export const LENSES = {
  essence:   { n: 1,  q: 'What experience must this level deliver — present in every beat, not just the mechanics?' },
  surprise:  { n: 2,  q: 'What genuinely surprises the player here?' },
  fun:       { n: 3,  q: 'Which parts are fun, and how could each be MORE fun without clutter?' },
  curiosity: { n: 4,  q: 'What question does this level plant that pulls the player forward?' },
  flow:      { n: 18, q: 'Clear goal, direct feedback, a steady stream of not-too-easy/not-too-hard challenge?' },
  challenge: { n: 31, q: 'Right difficulty + VARIETY of challenge; ramps as skill grows and peaks before the flag?' },
  triangle:  { n: 33, q: 'A safe-low-reward vs risky-high-reward fork, rewards commensurate to risk?' },
  reward:    { n: 40, q: 'Are rewards exciting, understood, and building over time?' },
  puzzle:    { n: 52, q: 'What is the level’s core puzzle, and does solving it give an “aha”?' },
  interest:  { n: 61, q: 'Does interest hook early, rise with peaks/valleys, and climax just before the end?' },
  beauty:    { n: 63, q: 'Is the biome beautiful and cohesive enough to be its own reward?' },
};

// which level-data field carries each signature verb (for the "is it actually present?" check)
const MECH_FIELD = {
  spring: (L) => (L.pads || L.springs || []).length, conveyor: (L) => (L.conveyor || []).length,
  dashpad: (L) => (L.dashpad || []).length, crumble: (L) => (L.crumble || []).length,
  oneway: (L) => (L.oneway || []).length, updraft: (L) => (L.fields || []).filter((f) => f.type === 'updraft').length,
  lowgrav: (L) => (L.fields || []).filter((f) => f.type === 'lowgrav').length, flyer: (L) => (L.enemies || []).filter((e) => e.fly).length,
};
function hasMechanic(L, key) { const f = MECH_FIELD[key]; return f ? f(L) > 0 : false; }

/** The recorded design intent for level i of n (the schema). Synthesized from the level + its
 *  position in the campaign; opts can override essence/puzzle/twist with authored copy. */
export function designIntent(level, i, n, opts = {}) {
  // Prefer the level's OWN declared signature (level.signature / level.mech) — the level knows the
  // verb it teaches — falling back to the positional guess for levels that declare none.
  const declared = level.signature || level.mech;
  const sig = (declared && ELEMENT_LIBRARY[declared] && ELEMENT_LIBRARY[declared].implemented)
    ? { key: declared, ...ELEMENT_LIBRARY[declared] }
    : signatureFor(i);
  const feel = predict(level);
  const t = n > 1 ? i / (n - 1) : 1;
  return {
    level: i, name: level.name,
    essence: opts.essence || (sig ? `${level.name} — ${sig.aesthetic}` : level.name),
    signature: sig ? sig.key : null,             // the ONE new verb this level teaches (#32)
    aesthetic: sig ? sig.feeling : 'Challenge',  // the MDA feeling it evokes …
    aesthetics: FUN,                             // … from the 8-aesthetic vocabulary
    difficulty: arcWeight(i, n),                 // where on the rising arc (#33)
    isClimax: i === climaxIndex(n), isCalmOpening: isCalmOpening(t),
    interestCurve: feel.curve, fun: feel.fun, components: feel.components, deadAir: feel.deadAir, peakPos: feel.peakPos,
    lenses: Object.keys(LENSES),
    puzzle: opts.puzzle || null, twist: opts.twist || null,
  };
}

/** Does the shipped level MATCH its intent? (signature present · not mostly dead-air · climax peaks late) */
export function validateIntent(level, intent) {
  const issues = [];
  if (intent.signature && !hasMechanic(level, intent.signature)) issues.push(`signature verb '${intent.signature}' is absent from the level`);
  if (intent.deadAir && intent.interestCurve && intent.deadAir.length > intent.interestCurve.length * 0.45) issues.push(`too much dead-air (${intent.deadAir.length}/${intent.interestCurve.length} windows)`);
  if (intent.isClimax && intent.peakPos < 0.5) issues.push(`climax level peaks early (peak@${intent.peakPos})`);
  return { ok: issues.length === 0, issues };
}

/** The whole-campaign DESIGN doc: intent per level + validation + the campaign's mean FUN. */
export function campaignDesign(levels, opts = {}) {
  const n = levels.length;
  const intents = levels.map((L, i) => designIntent(L, i, n, (opts.perLevel || [])[i] || {}));
  const checks = levels.map((L, i) => ({ level: i, name: L.name, ...validateIntent(L, intents[i]) }));
  const meanFun = +(intents.reduce((s, x) => s + x.fun, 0) / Math.max(1, n)).toFixed(1);
  return { intents, checks, meanFun, ok: checks.every((c) => c.ok) };
}

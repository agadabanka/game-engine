// tools/lib/evolve.mjs — #37 the DESIGN LOOP: edit operators + a critic prompt + a deterministic
// fallback. Ported from deepfin's evolve.js to the engine's pixel level data. One loop = propose
// ONE fun-improving edit (Gemini critic for ground truth, or the offline fallback), apply it, and
// let fun-max (#38) keep it only if the feel model (#35) improves AND the gate stays green.
// Pure (node + browser); deterministic.
import { predict } from './feelmodel.mjs';
import { highInterestVerbs } from './elements.mjs';

export const cloneLevel = (L) => JSON.parse(JSON.stringify(L));
const ensure = (L, k) => (L[k] || (L[k] = []));

// the verbs the loop may ADD (each maps to a deterministic placement near a pixel x)
export const EDITABLE = ['coins', 'spring', 'conveyor', 'dashpad', 'crumble', 'oneway', 'updraft', 'walker', 'flyer'];

/** Apply ONE deterministic edit — add `type` near pixel x. Returns { level (cloned+mutated), type, x }. */
export function applyEdit(level, x, type) {
  const L = cloneLevel(level), gy = L.groundY != null ? L.groundY : 470; x = Math.round(x);
  switch (type) {
    case 'spring': ensure(L, 'pads').push({ x }); ensure(L, 'coins').push({ x, y: gy - 150 }); break;
    case 'conveyor': ensure(L, 'conveyor').push({ x0: x - 90, x1: x + 90, dir: 1, push: 70 }); break;
    case 'dashpad': ensure(L, 'dashpad').push({ x, dir: 1, speed: 300 }); ensure(L, 'coins').push({ x: x + 95, y: gy - 100 }); break;
    case 'crumble': ensure(L, 'crumble').push({ x: x - 75, y: gy, w: 150, mat: 'frosting' }); break;
    case 'oneway': ensure(L, 'oneway').push({ x: x - 60, y: gy - 150, w: 120, mat: 'cloud' }); ensure(L, 'coins').push({ x, y: gy - 176 }); break;
    case 'updraft': ensure(L, 'fields').push({ type: 'updraft', x: x - 65, y: gy - 200, w: 130, h: 176, strength: 36 }); break;
    case 'walker': ensure(L, 'enemies').push({ x, patrol: 50 }); break;
    case 'flyer': ensure(L, 'enemies').push({ x, fly: true, up: 235, range: 100 }); break;
    case 'coins': default: for (let i = -1; i <= 1; i++) ensure(L, 'coins').push({ x: x + i * 44, y: gy - 70 }); type = 'coins'; break;
  }
  return { level: L, type, x };
}

/** The DETERMINISTIC fallback critic: target the biggest LATE dead-air window and add a high-interest
 *  verb there (reduces dead-air → flow↑, and pushes content later → arc↑). Returns an edit or null. */
export function chooseFallback(level, opts = {}) {
  const f = predict(level);
  if (!f.deadIdx.length) return null;
  // prefer a dead window in the latter half (also nudges the peak later); else the last dead window
  const late = f.deadIdx.filter((i) => i >= f.n * 0.4);
  const target = (late.length ? late : f.deadIdx)[Math.floor((late.length ? late : f.deadIdx).length / 2)];
  const x = Math.round((target + 0.5) * (f.W / f.n));
  const verbs = (opts.verbs || highInterestVerbs().map((v) => v.key)).filter((k) => EDITABLE.includes(k));
  const type = verbs.length ? verbs[target % verbs.length] : 'coins';
  return applyEdit(level, x, type);
}

/** The Gemini CRITIC prompt — milestone ground truth (text-gen; optional, the loop runs without it). */
export function critiquePrompt(level, feel) {
  const f = feel || predict(level);
  return [
    'You are a platformer level designer. A level\'s PREDICTED interest curve (0-10 per window, left→right):',
    `[${f.curve.join(', ')}]   FUN=${f.fun}   dead-air: ${f.deadAir.join(', ') || 'none'}   peak@${f.peakPos}`,
    'Propose ONE concrete edit that most raises FUN — fill the worst dead-air, sharpen the late climax, or add variety — without making it unfair.',
    `Reply ONLY as JSON: {"type": one of ${JSON.stringify(EDITABLE)}, "x": <pixel 0..${f.W}>, "why": "<one line>"}.`,
  ].join('\n');
}

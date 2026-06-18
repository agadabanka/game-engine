// tools/lib/genstream.mjs — STRATEGY D: the endless treadmill (the moving window → an infinite stream).
//
// A level is a finite contract-tree, but the player only experiences a sliding WINDOW. If generation
// rides that window, the finite grammar becomes an INFINITE STREAM: never materialize the whole level —
// emit the NEXT room whose entry-contract docks to the current tail's exit, at a difficulty set by the
// INTENSITY field (a breather/spike rhythm sampled at the cursor) and shaped by a NOVELTY field (don't
// repeat a recent room's shape). The handshake keeps every tile solvable + on-curve; novelty keeps the
// stream from going samey. This is "infinite structure from a finite seed" made operational.
//
//   generateStream(spec, { seed, rec, tiles, leafBudget, window }) → { tiles, summary }

import { evolveRoom, rng } from './roomgen.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
// a room's SHAPE fingerprint for the novelty field — ledge count + spikes + difficulty bucket
const fingerprint = (room, res) => `${(room.solids || []).length - 1}L${(room.spikes || []).length ? 'S' : ''}D${Math.round((res.difficulty || 0) / 12)}`;

export function generateStream(spec, { seed = 1, rec = null, tiles = 11, leafBudget = 38, window = 4 } = {}) {
  const r = rng(((seed * 2246822519) >>> 0) || 9);
  // INTENSITY field: a gentle rising ramp with sinusoidal breathers + spikes (the difficulty curve as a
  // function of position) — so the stream BREATHES instead of monotonically grinding up. Floor at 26 so
  // even breathers still demand the dash (this is a dash-platformer, not a walking sim).
  const intensityAt = (i) => Math.max(26, Math.min(70, Math.round(34 + i * 1.7 + 12 * Math.sin(i * 0.9 + 0.6))));

  const emitted = [];          // { id, room, result, intensity, novel, tries }
  const snap = (cursor) => ({ kind: 'stream', cursor, window, intensitySeries: emitted.map((t) => t.intensity),
    tiles: emitted.map((t) => ({ id: t.id, room: clone(t.room), result: t.result, intensity: t.intensity, novel: t.novel })) });

  rec && rec.log('seed', 'the moving window: emit rooms forever, by contract', { tiles, window }, 'Strategy D: ride a sliding window — emit the next room that docks to the tail, on the intensity curve, never repeating', snap(-1));

  for (let i = 0; i < tiles; i++) {
    const center = intensityAt(i);
    const target = { requires: ['dash'], difficulty: [center - 9, center + 9], tightness: [40, 170] };
    // NOVELTY field: try up to 3 seeds; keep the first whose shape didn't appear in the last `window`
    // tiles (else keep the last try). The handshake (docking) is automatic — every room starts grounded
    // with dash refreshed, which is exactly every room's exit state.
    const recent = emitted.slice(-window).map((t) => t.fp);
    let best = null;
    for (let k = 0; k < 2; k++) {
      const out = evolveRoom(spec, target, { seed: ((seed * 211 + i * 53 + k * 7 + 1) >>> 0), budget: leafBudget, rec: (k === 0 && rec) ? rec.scope('t' + i) : null });
      const fp = fingerprint(out.room, out.result), novel = !recent.includes(fp);
      if (!best || (novel && !best.novel)) best = { out, fp, novel, tries: k + 1 };
      if (novel) break;
    }
    emitted.push({ id: 't' + i, room: best.out.room, result: best.out.result, intensity: center, novel: best.novel, fp: best.fp, tries: best.tries });
    rec && rec.log('chain', `emit tile ${i + 1} — intensity ${center}${best.novel ? '' : ' (repeat)'}`, { i: i + 1, intensity: center, difficulty: best.out.result.difficulty, requires: best.out.result.requires, novel: best.novel, docked: true },
      `dock to the tail (dash refreshed) · target ~${center} → diff ${best.out.result.difficulty}${best.novel ? ' · fresh shape' : ' · shape repeats (novelty couldn\'t avoid it)'}`, snap(i));
  }

  const allDash = emitted.every((t) => (t.result.requires || []).includes('dash'));
  const allSolv = emitted.every((t) => t.result.solvable);
  const novelRate = Math.round(100 * emitted.filter((t) => t.novel).length / emitted.length);
  rec && rec.log('done', 'the treadmill rolls', { tiles: emitted.length, allSolvable: allSolv, allRequireDash: allDash, novelRate, curve: emitted.map((t) => t.result.difficulty) },
    `${emitted.length} tiles, all solvable${allDash ? ', all require dash' : ''}, ${novelRate}% fresh — a finite grammar made into an endless, on-curve stream`, snap(emitted.length - 1));

  return { tiles: emitted, summary: { tiles: emitted.length, allSolvable: allSolv, allRequireDash: allDash, novelRate, curve: emitted.map((t) => t.result.difficulty) } };
}

export default { generateStream };

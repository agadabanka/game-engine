// tools/lib/genwindow.mjs — the MOVING WINDOW (#29): one artifact, every scale.
//
// The window is an *imaginary* cursor with two coordinates: position × SCALE. This generates a real BSP
// level once, then scripts a **dolly tour** that zooms frame ⊂ move ⊂ room ⊂ level and back — panning
// across rooms and moves — so the timeline scrubber becomes the window cursor. Dollying out, the room you
// were inspecting becomes one tile in the level: self-similarity you can *see*. (The atom below a move is
// a single frame; we mark it but render the move as the deepest lens.)
//
//   generateWindow(spec, { seed, rec }) → { level, summary }

import { generateLevel } from './genbsp.mjs';

export function generateWindow(spec, { seed = 1, rec = null } = {}) {
  const level = generateLevel(spec, { seed, rec: null, targetLeaves: 5, leafBudget: 55, difficulty: [22, 70] });
  const B = level.bounds, leaves = level.leaves;   // leaves are climb-sorted, each with { room, place, result }
  const regions = leaves.map((l) => ({ id: l.id, x: l.x, y: l.y, w: l.w, h: l.h, band: l.band, room: l.room, place: l.place, result: l.result }));
  const lvlSnap = (active) => ({ kind: 'level', bounds: B, active, regions, cuts: level.cuts });
  const box = (x, y, w, h) => ({ x, y, w, h });
  const win = (scale, roomIdx, b, crumb, extra) => ({ kind: 'window', scale, roomIdx, box: b, level: lvlSnap(roomIdx != null ? leaves[roomIdx].id : null), crumb, ...extra });
  const whole = box(B.x, B.y, B.w, B.h);

  rec && rec.log('seed', 'the moving window — one artifact, every scale', { rooms: leaves.length }, 'dolly from the whole level down to a single move and back; the scrubber IS the window cursor', win(0, null, whole, 'Level'));

  const tour = [...new Set([0, Math.floor(leaves.length / 2), leaves.length - 1])];
  for (const ri of tour) {
    const leaf = leaves[ri], reg = box(leaf.x, leaf.y, leaf.w, leaf.h), P = leaf.place;
    rec && rec.log('cut', `dolly in → room ${ri + 1}`, { room: ri + 1, of: leaves.length }, `zoom to room ${ri + 1} of ${leaves.length} (a leaf of the level)`, win(1, ri, reg, `Level › Room ${ri + 1}`));
    const path = (leaf.result && leaf.result.path) || [];
    path.slice(0, Math.min(2, path.length)).forEach((m, mi) => {
      const A = leaf.room.solids[m.from], Bb = leaf.room.solids[m.to];
      const ax = P.ox + (m.tox != null ? m.tox : A[0] + A[2] / 2) * P.scale, ay = P.oy + A[1] * P.scale;
      const bx = P.ox + (Bb[0] + Bb[2] / 2) * P.scale, by = P.oy + Bb[1] * P.scale;
      const mb = box(Math.min(ax, bx) - 70, Math.min(ay, by) - 70, Math.abs(bx - ax) + 140, Math.abs(by - ay) + 140);
      const seg = { ax, ay, bx, by, move: m.move };
      for (const t of [0, 0.5, 1]) rec && rec.log(t === 0 ? 'propose' : 'mutate', `move ${mi + 1}: ${m.move}`, { move: m.move, t },
        `dolly to ONE move — ${m.move}${t < 1 ? ' (in flight)' : ' (landed)'} — the atom below this is a single frame`, win(2, ri, mb, `Level › Room ${ri + 1} › Move ${mi + 1} (${m.move})`, { seg, t }));
    });
    rec && rec.log('accept', `dolly out → room ${ri + 1}`, { room: ri + 1 }, `pop back out to room ${ri + 1}`, win(1, ri, reg, `Level › Room ${ri + 1}`));
  }
  rec && rec.log('done', 'dolly out → the whole level', { rooms: leaves.length }, 'back to the whole level — same artifact, every scale (move ⊂ room ⊂ level)', win(0, null, whole, 'Level'));

  return { level, summary: { rooms: leaves.length } };
}

export default { generateWindow };

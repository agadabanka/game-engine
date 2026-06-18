// tools/lib/rooms.mjs — BUILD LEVELS IN STEPS. A level is an ordered list of single-screen ROOMS,
// each authored + SOLVER-VERIFIED in isolation, then chained (exit of room N = entrance of N+1).
//
// This is what makes "in steps" real: you emit room 1, the solver proves it (and reports which verbs
// it requires + how tight it is), then room 2, … — instead of hand-tuning one monolithic 1089-frame
// climb. The solver also EMITS the autopilot path, so the verification and the gate are the same act:
// what the solver proves is exactly what the game's autopilot replays.
//
//   prepRoom(room)            → fills entranceIdx/exitIdx from entrance/exit positions
//   verifyRoom(room, spec)    → solveRoom + a pass/fail with the room's idea checked
//   roomPathToGame(room, sol) → the solver's solution as a game `level.path`
//   chainRooms(rooms, spec)   → { level, report } — a renderable+gateable level + per-room scorecard

import { solveRoom } from './solver.mjs';
import { BODY } from './platforming.mjs';

const onSolidIdx = (solids, x, y) => {
  for (let i = 0; i < solids.length; i++) { const [sx, sy, sw] = solids[i]; if (x >= sx - 2 && x <= sx + sw + 2 && Math.abs(y - sy) < 30) return i; }
  // fall back to nearest-by-top under x
  let best = -1, bd = 1e9; for (let i = 0; i < solids.length; i++) { const [sx, sy, sw] = solids[i]; if (x >= sx - 2 && x <= sx + sw + 2) { const d = Math.abs(y - sy); if (d < bd) { bd = d; best = i; } } }
  return best;
};

/** Resolve entrance/exit positions to solid indices the solver searches between. */
export function prepRoom(room) {
  const solids = room.solids || [];
  const en = room.entrance || [solids[0] ? solids[0][0] + 40 : 60, solids[0] ? solids[0][1] : 480];
  const ex = room.exit || [solids[solids.length - 1][0] + solids[solids.length - 1][2] / 2, solids[solids.length - 1][1]];
  return { ...room, entranceIdx: room.entranceIdx ?? onSolidIdx(solids, en[0], en[1]), exitIdx: room.exitIdx ?? onSolidIdx(solids, ex[0], ex[1]), entrance: en, exit: ex };
}

/** Verify ONE room: solvable + (optional) that it actually demands its declared `idea` verb. */
export function verifyRoom(room, spec) {
  const r = solveRoom(prepRoom(room), spec);
  const ideaOk = !room.idea || room.idea === 'jump' || (r.requires || []).includes(room.idea);
  return { ...r, room: room.name, ideaOk, pass: r.solvable && ideaOk };
}

/** The solver's solution → the game's autopilot path: [landX, landY, act, takeoffX] per move. */
export function roomPathToGame(room, sol, xOff = 0, yOff = 0) {
  const solids = room.solids || [], path = [];
  if (!sol || !sol.path || !sol.path.length) return path;
  const first = sol.path[0]; const en = solids[room.entranceIdx];
  path.push([Math.round((first.tox ?? en[0] + en[2] / 2) + xOff), Math.round(en[1] + yOff), 'walk', Math.round((first.tox ?? en[0] + en[2] / 2) + xOff)]);
  for (const e of sol.path) {
    const to = solids[e.to];
    path.push([Math.round(to[0] + to[2] / 2 + xOff), Math.round(to[1] + yOff), e.move, Math.round((e.tox ?? to[0] + to[2] / 2) + xOff)]);
  }
  return path;
}

/** Chain rooms into one level (stacked vertically by default) + per-room solver scorecard. */
export function chainRooms(rooms, spec, opts = {}) {
  const gapY = opts.gapY ?? 0, level = { solids: [], spikes: [], springs: [], crystals: [], path: [], spawn: null, goal: null }, report = [];
  let yOff = 0;
  for (const raw of rooms) {
    const room = prepRoom(raw), sol = solveRoom(room, spec);
    report.push({ room: room.name || `room${report.length + 1}`, solvable: sol.solvable, requires: sol.requires || [], tightness: sol.tightness, difficulty: sol.difficulty, reason: sol.reason });
    (room.solids || []).forEach((s) => level.solids.push([s[0], s[1] + yOff, s[2], s[3]]));
    (room.spikes || []).forEach((s) => level.spikes.push([s[0], s[1] + yOff, s[2], s[3]]));
    (room.springs || []).forEach((s) => level.springs.push([s[0], s[1] + yOff]));
    (room.crystals || []).forEach((c) => level.crystals.push([c[0], c[1] + yOff]));
    if (sol.solvable) level.path.push(...roomPathToGame(room, sol, 0, yOff));
    if (level.spawn == null) level.spawn = [room.entrance[0], room.entrance[1] + yOff];
    level.goal = [room.exit[0], room.exit[1] + yOff];
    yOff -= (room.height || 540) + gapY;
  }
  return { level, report, allSolved: report.every((r) => r.solvable) };
}

export default { prepRoom, verifyRoom, roomPathToGame, chainRooms };

// tools/lib/solver.mjs — the VERB-AWARE room solver. The new gate for build-in-steps levels.
//
// Given a single-screen ROOM and a mechanics spec, it forward-simulates the hero (platforming.mjs)
// between footholds to discover what's reachable with the declared verbs, then searches entrance→exit.
// Unlike the stock "move-right + jump" autopilot, it can use dash + wall-jump and their CHAINS — so a
// room may legitimately REQUIRE a dash (the depth a dumb gate can't verify). It also reports which
// verbs are load-bearing (remove one → unsolvable) and a difficulty/tightness score.
//
//   solveRoom(room, spec) → { solvable, path, moves, requires, difficulty, reason }

import { spawn, step, BODY } from './platforming.mjs';
import { physicsConfig, verbSet } from './mechspec.mjs';

const MAXF = 240;   // a single foothold→foothold move resolves within ~4s of sim
const top = (sd) => sd[1], left = (sd) => sd[0], right = (sd) => sd[0] + sd[2];

// candidate take-off x's across a solid's standable top (inset by the body half-width)
function takeoffs(sd) {
  const a = left(sd) + BODY.w / 2 + 2, b = right(sd) - BODY.w / 2 - 2, out = [];
  if (b < a) return [(a + b) / 2];
  for (let x = a; x <= b + 0.1; x += Math.max(18, (b - a) / 16)) out.push(Math.round(x));   // dense enough to find the runway a specific gap needs
  if (out[out.length - 1] < b - 2) out.push(Math.round(b));
  return out;
}
// which solid index is the hero standing on? (feet just above a solid top, x within its span)
function standingOn(s, solids) {
  const footY = s.y + BODY.h / 2;
  for (let i = 0; i < solids.length; i++) { const sd = solids[i]; if (Math.abs(footY - top(sd)) < 6 && s.x > left(sd) - 2 && s.x < right(sd) + 2) return i; }
  return -1;
}

// The move PRIMITIVES, gated by the verb-set. Each is an input-script the executor runs; `drift`
// (-1/0/1) is held through the air so the launch carries toward an offset ledge.
function primitives(verbs) {
  const P = [];
  for (const drift of [-1, 0, 1]) P.push({ id: 'jump', drift, hold: 14 });          // run · variable jump w/ hold
  if (verbs.includes('dash')) {
    for (const [k, dx, dy] of [['u', 0, -1], ['ur', 1, -1], ['ul', -1, -1], ['r', 1, 0], ['l', -1, 0]]) {
      const drift = dx; P.push({ id: 'dash:' + k, dx, dy, drift, apex: dy < 0 });     // apex up-dash, or flat dash
    }
  }
  if (verbs.includes('walljump')) { P.push({ id: 'wj:r', wj: 1, drift: 1 }); P.push({ id: 'wj:l', wj: -1, drift: -1 }); }
  return P;
}

// Simulate ONE move from take-off x on solid `from` and report where it lands.
function simMove(room, cfg, fromIdx, tox, prim) {
  const solids = room.solids || [], sd = solids[fromIdx];
  const s = spawn(tox, top(sd) - BODY.h / 2 - 1);   // standing on the take-off
  for (let i = 0; i < 6 && !s.onGround; i++) step(s, {}, room, cfg);   // settle so onGround=true before launching (else the jump can't fire)
  let phase = 'approach', t = 0, minMargin = 999, sprung = false;
  for (let f = 0; f < MAXF; f++) {
    if (s.vy < -650) sprung = true;   // only a spring (~-760) exceeds the jump impulse (-570) → attribute the launch to the spring
    const inp = {};
    // track tightness: closest approach to any spike during the move
    for (const sp of room.spikes || []) { const dx = Math.max(sp[0] - s.x, 0, s.x - (sp[0] + sp[2])); const dy = Math.max(sp[1] - s.y, 0, s.y - (sp[1] + (sp[3] || 14))); minMargin = Math.min(minMargin, Math.hypot(dx, dy)); }
    if (prim.id === 'spring' && phase !== 'air' && s.vy < -300) { phase = 'air'; t = 0; }   // a spring launched us → drift to land
    if (phase === 'approach') {
      if (Math.abs(s.x - tox) > 5) inp[tox > s.x ? 'right' : 'left'] = true;
      else if (s.onGround && prim.id !== 'spring') { phase = prim.id.indexOf('dash') === 0 ? 'launch-dash' : (prim.wj != null ? 'launch-wj' : 'launch'); t = 0; }
      // spring: just stand on it (no input) and let postMove bounce us
    } else if (phase === 'launch') { inp.jump = true; phase = 'air'; t = 0; }
    else if (phase === 'launch-wj') { inp.jump = true; phase = 'air'; t = 0; }          // hop toward a wall, then wall-jump in air
    else if (phase === 'launch-dash') {
      t++;
      if (prim.apex) { if (s.vy > -140 && t > 3) { inp.dash = true; inp.dashX = prim.dx; inp.dashY = prim.dy; phase = 'air'; t = 0; } else if (t < 16) inp.jump = true; }
      else { if (t <= 2) inp.jump = true; else { inp.dash = true; inp.dashX = prim.dx; inp.dashY = prim.dy; phase = 'air'; t = 0; } }
    } else if (phase === 'air') {
      t++;
      if (prim.id === 'jump' && t < (prim.hold || 14) && s.vy < -20) inp.jump = true;   // hold for full height
      if (prim.wj != null) inp.jump = true;                                             // keep trying to wall-jump while clinging
      if (prim.drift > 0) inp.right = true; else if (prim.drift < 0) inp.left = true;
      if (s.onGround && t > 4) { const land = standingOn(s, solids); if (land >= 0) return { land, margin: minMargin, frames: f, sprung }; phase = 'approach'; }
    }
    step(s, inp, room, cfg);
    if (s.dead) return { land: -1, died: true, margin: minMargin, frames: f };
    if (s.won) { const land = room.exitIdx; return { land, won: true, margin: minMargin, frames: f }; }
  }
  return { land: -1, timeout: true, margin: minMargin };
}

// Build the reachability graph: edge from→to with the move + tightness, by simulation.
function buildGraph(room, cfg, verbs) {
  const solids = room.solids || [], prims = primitives(verbs), edges = solids.map(() => []);
  const addEdge = (i, r, move) => {
    if (r.land == null || r.land < 0 || r.land === i) return;
    if (r.sprung) move = 'spring';   // a spring did the lifting → attribute it to the spring, not the primitive that walked onto it
    const verb = move.split(':')[0], ex = edges[i].find((e) => e.to === r.land && e.verb === verb);
    if (!ex || r.margin > ex.margin) { if (ex) Object.assign(ex, { tox: r.tox, move, margin: r.margin, frames: r.frames }); else edges[i].push({ to: r.land, verb, tox: r.tox, move, margin: r.margin, frames: r.frames }); }
  };
  for (let i = 0; i < solids.length; i++) {
    for (const tox of takeoffs(solids[i])) for (const p of prims) addEdge(i, { ...simMove(room, cfg, i, tox, p), tox }, p.id);
    // SPRING edges: a spring resting on this solid is a launch option (drift each way to land elsewhere).
    for (const sp of room.springs || []) {
      if (sp[0] < left(solids[i]) - 4 || sp[0] > right(solids[i]) + 4 || Math.abs(sp[1] - top(solids[i])) > 24) continue;
      for (const drift of [-1, 0, 1]) addEdge(i, { ...simMove(room, cfg, i, sp[0], { id: 'spring', drift }), tox: sp[0] }, 'spring');
    }
  }
  return edges;
}

function bfs(edges, start, goal) {
  const prev = {}, q = [start], seen = new Set([start]);
  while (q.length) {
    const u = q.shift(); if (u === goal) break;
    for (const e of edges[u] || []) if (!seen.has(e.to)) { seen.add(e.to); prev[e.to] = { from: u, e }; q.push(e.to); }
  }
  if (!seen.has(goal)) return null;
  const path = []; let cur = goal; while (cur !== start) { const p = prev[cur]; path.unshift({ from: p.from, to: cur, ...p.e }); cur = p.from; }
  return path;
}

/** Solve a room with the spec's verbs; also report which verbs are LOAD-BEARING (depth). */
export function solveRoom(room, spec) {
  const cfg = physicsConfig(spec), verbs = verbSet(spec);
  if (room.entranceIdx == null || room.exitIdx == null) return { solvable: false, reason: 'room needs entranceIdx + exitIdx' };
  const full = bfs(buildGraph(room, cfg, verbs), room.entranceIdx, room.exitIdx);
  if (!full) return { solvable: false, reason: 'no entrance→exit path with the declared verbs', requires: [] };
  // which verbs are REQUIRED? remove each optional verb and see if it's still solvable.
  const requires = [];
  for (const v of verbs) {
    if (v === 'run' || v === 'jump') continue;   // always available
    const without = verbs.filter((x) => x !== v);
    if (!bfs(buildGraph(room, cfg, without), room.entranceIdx, room.exitIdx)) requires.push(v);
  }
  const usedVerbs = [...new Set(full.map((m) => m.verb))];
  const tightness = Math.round(Math.min(...full.map((m) => m.margin)));   // px to nearest spike on the chosen line (lower = harder)
  const difficulty = Math.round(full.length * 8 + Math.max(0, 60 - tightness) + requires.length * 10);
  return { solvable: true, path: full, moves: full.map((m) => `${room.entranceIdx === m.from ? 'in' : m.from}→${m.to === room.exitIdx ? 'out' : m.to} ${m.move}`), usedVerbs, requires, tightness, difficulty };
}

export default { solveRoom };

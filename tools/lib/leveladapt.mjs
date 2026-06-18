// tools/lib/leveladapt.mjs — read an EXISTING game's levels.js (any supported format) and adapt each
// level into the solver's ROOM shape, so the retrofit tool can audit a previously-made game.
//
// Supports: the precision-platformer "solids" format (Vesper Peak: solids/spikes/springs/crystals/
// spawn/goal) and the stock Studio.Level DSL (ground/walls/platforms/groundY/spawn/goal). Other
// genres (snake/flappy/…) report `format:'n/a'` so the tool can skip them cleanly.
import fs from 'node:fs';
import path from 'node:path';
import { prepRoom } from './rooms.mjs';

/** Load window.LEVELS from a game's src/game/levels.js by evaluating it with a minimal browser stub. */
export function loadLevels(gameDir) {
  const f = path.join(gameDir, 'src/game/levels.js');
  if (!fs.existsSync(f)) return { levels: [], error: 'no src/game/levels.js' };
  const code = fs.readFileSync(f, 'utf8');
  const win = {};
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', 'Studio', 'Math', 'Object', 'JSON', code)(win, {}, Math, Object, JSON);
    return { levels: Array.isArray(win.LEVELS) ? win.LEVELS : [], error: win.LEVELS ? null : 'levels.js set no window.LEVELS' };
  } catch (e) { return { levels: [], error: 'eval failed: ' + e.message }; }
}

export function detectFormat(L) {
  if (!L || typeof L !== 'object') return 'n/a';
  if (Array.isArray(L.solids)) return 'solids';
  if (Array.isArray(L.ground)) return 'dsl';
  return 'n/a';
}

const DEADLY = /lava|spike|thorn|water|acid|fire|void|deadly|hazard/i;

/** Adapt one level (any supported format) → a solver room ({solids,spikes,springs,crystals,entrance,exit,...}). */
export function toRoom(L) {
  const fmt = detectFormat(L);
  if (fmt === 'solids') {
    const room = {
      solids: (L.solids || []).map((s) => [s[0], s[1], s[2], s[3] ?? 22]),
      spikes: (L.spikes || []).map((s) => [s[0], s[1], s[2], typeof s[3] === 'number' ? s[3] : 14]),
      springs: (L.springs || []).map((s) => [s[0], s[1]]),
      crystals: (L.crystals || []).map((c) => [c[0], c[1]]),
      entrance: L.spawn ? [L.spawn[0], L.spawn[1]] : null,
      exit: L.goal ? [L.goal[0], L.goal[1]] : null,
      floorKill: 2000, name: L.name,
    };
    return { ...prepRoom(room), format: fmt };
  }
  if (fmt === 'dsl') {
    const gy = L.groundY ?? 470, solids = [], spikes = [];
    for (const seg of L.ground || []) { const [x0, x1, mat] = seg; if (DEADLY.test(mat || '')) spikes.push([x0, gy, x1 - x0, 14]); else solids.push([x0, gy, x1 - x0, 40]); }
    for (const w of L.walls || []) solids.push([w.x, gy - (w.tiles || 1) * 40, 40, (w.tiles || 1) * 40]);
    for (const p of L.platforms || []) solids.push([Math.round(p.x - (p.w || 120) / 2), p.y, p.w || 120, 16]);   // DSL platform x is the CENTER
    const room = {
      solids, spikes, springs: (L.pads || []).map((p) => [p.x, gy]), crystals: [],
      entrance: L.spawn ? [L.spawn.x ?? L.spawn[0], L.spawn.y ?? L.spawn[1] ?? gy] : [40, gy],
      exit: [(typeof L.goal === 'number' ? L.goal : (L.goalX || L.width || 1900)) - 20, gy],
      floorKill: (L.height || 540) + 200, name: L.name,
    };
    return { ...prepRoom(room), format: fmt };
  }
  return { format: 'n/a', name: L && L.name };
}

export default { loadLevels, detectFormat, toRoom };

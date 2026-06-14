// tools/lib/builders.mjs — #39 procedural level builders for the engine.
// Generalizes the PROVEN gate-safe Track pattern (the one lovelump ships, gated all session) into
// reusable, deterministic, correct-by-construction builders any game can call. Features self-guard
// into the safe band of their segment (or drop), gaps stay ≤ the hop envelope, and one kinetic
// feature per segment — so the run-right-hop autopilot clears every generated level 0-death.
// Drives the signature-per-level (#32) + difficulty-curve (#33) helpers. Output = the engine level
// spec Studio.Level.build consumes. Pure + deterministic.
import { signatureFor } from './elements.mjs';
import { rampEnemies, arcWeight, climaxIndex } from './difficulty.mjs';

const DEF = { T: 40, groundY: 470, H: 540, GAPMAX: 165, CLEAR: 250, SAFE_AFTER: 320, FEAT_START: 150 };

/** The horizontal track builder (the proven pattern, parameterized). Chainable; `.done(name)` emits
 *  the engine level spec. A feature SELF-GUARDS into the safe band, so the autopilot always clears it. */
export function Track(opts = {}) {
  const C = { ...DEF, ...opts }, COINY = C.groundY - 34;
  const t = { sky: opts.sky || 0x1d2b53, ground: [], walls: [], platforms: [], coins: [], enemies: [], pads: [], conveyor: [], dashpad: [], crumble: [], oneway: [], fields: [], x: 0, lastSolid: null, _feat: true };
  const band = () => { const [a, b] = t.lastSolid; const lo = a + C.FEAT_START, hi = b - C.SAFE_AFTER; return hi >= lo ? [lo, hi] : null; };
  const place = (x) => { const bd = band(); return bd ? Math.round(Math.max(bd[0], Math.min(bd[1], x))) : null; };
  const claim = () => { if (t._feat) return false; t._feat = true; return true; };
  const api = {
    spec: t,
    solid(w, mat = 'solid', { coins = true } = {}) { const a = t.x, b = t.x + w; t.ground.push([a, b, mat]); t.lastSolid = [a, b]; t.x = b; t._feat = false; if (coins) for (let cx = a + 70; cx <= b - 70; cx += 120) t.coins.push({ x: Math.round(cx), y: COINY }); return api; },
    gap(w = C.GAPMAX) { t.x += Math.min(w, C.GAPMAX); return api; },
    hazard(w = C.GAPMAX, mat = 'lava') { const a = t.x, b = t.x + Math.min(w, C.GAPMAX); t.ground.push([a, b, mat]); t.x = b; return api; },
    bridge(up = 72, pw = 150, mat = 'cloud', { coin = true } = {}) { const px = Math.round(t.x - pw / 2 - 18), py = Math.round(C.groundY - up); t.platforms.push({ x: px, y: py, w: pw, mat }); if (coin) t.coins.push({ x: px + Math.round(pw / 2), y: py - 30 }); return api; },
    enemy(frac = 0.5, patrol = 50) { const [a, b] = t.lastSolid; const x = place(a + (b - a) * frac); if (x != null && claim()) t.enemies.push({ x, patrol }); return api; },
    flyer(frac = 0.5, up = 235, range = 100) { const [a, b] = t.lastSolid; t.enemies.push({ x: Math.round(a + (b - a) * frac), fly: true, up, range, patrol: range }); return api; },
    pad(frac = 0.45) { const [a, b] = t.lastSolid; const x = place(a + (b - a) * frac); if (x != null && claim()) t.pads.push({ x }); return api; },
    ledge(frac, up, pw, mat, { coin = true } = {}) { const [a, b] = t.lastSolid; const px = Math.round(a + (b - a) * frac), py = Math.round(C.groundY - Math.max(150, up)); t.platforms.push({ x: px, y: py, w: pw, mat }); if (coin) t.coins.push({ x: px + Math.round(pw / 2), y: py - 28 }); return api; },
    conveyor(frac = 0.5, dir = 1, push = 70, w = 180) { const [a, b] = t.lastSolid; const cx = place(a + (b - a) * frac); if (cx != null) t.conveyor.push({ x0: cx - w / 2, x1: cx + w / 2, dir, push }); return api; },
    dashpad(frac = 0.5, dir = 1, speed = 300) { const [a, b] = t.lastSolid; const x = place(a + (b - a) * frac); if (x != null) { t.dashpad.push({ x, dir, speed }); t.coins.push({ x: Math.round(x + dir * 95), y: COINY - 64 }); } return api; },
    crumbleSpan(w = 150, mat = 'frosting') { const a = t.x, b = t.x + Math.min(w, 150); t.crumble.push({ x: a, y: C.groundY, w: b - a, mat }); t.x = b; return api; },
    onewayLedge(frac = 0.5, up = 150, pw = 130, mat = 'cloud') { const [a, b] = t.lastSolid; const px = Math.round(a + (b - a) * frac), py = Math.round(C.groundY - Math.max(140, up)); t.oneway.push({ x: px, y: py, w: pw, mat }); t.coins.push({ x: px + Math.round(pw / 2), y: py - 26 }); return api; },
    field(type = 'updraft', frac = 0.5, w = 130, hi = 200, strength = 36) { const [a, b] = t.lastSolid; const cx = Math.round(a + (b - a) * frac); t.fields.push({ type, x: cx - w / 2, y: C.groundY - hi, w, h: hi - 24, strength }); return api; },
    spring(frac) { return api.pad(frac); },   // alias for the signature-verb name
    done(name) { return { name, sky: t.sky, width: t.x + 120, groundY: C.groundY, tile: C.T, height: C.H, ground: t.ground, walls: t.walls, platforms: t.platforms, coins: t.coins, enemies: t.enemies, pads: t.pads, conveyor: t.conveyor, dashpad: t.dashpad, crumble: t.crumble, oneway: t.oneway, fields: t.fields, spawn: { x: 60, y: C.groundY - 110 }, goal: t.lastSolid[1] - 60 }; },
  };
  return api;
}

// place a signature verb on the current solid via its element key (maps key → Track method)
function placeSignature(k, key, frac = 0.5) {
  switch (key) {
    case 'spring': return k.pad(frac);
    case 'conveyor': return k.conveyor(frac);
    case 'dashpad': return k.dashpad(frac);
    case 'oneway': return k.onewayLedge(frac, 150, 120, 'cloud');
    case 'updraft': return k.field('updraft', frac);
    case 'lowgrav': return k.field('lowgrav', frac);
    case 'flyer': return k.flyer(frac);
    default: return k;
  }
}

/** buildLong — a horizontal level of `segments` gate-safe solids separated by gaps, teaching ONE
 *  signature verb (#32) and ramping enemies with progress t (#33). `mechanic(k, seg, t)` can add more. */
export function buildLong({ name = 'Level', sky, mat = 'solid', segments = 5, levelIndex = 0, levelCount = 5, mechanic, segLen = 540, gap } = {}) {
  const k = Track({ sky });
  const sig = signatureFor(levelIndex);
  const G = gap != null ? gap : 150;
  for (let s = 0; s < segments; s++) {
    const t = segments > 1 ? s / (segments - 1) : 1;
    k.solid(segLen, mat);
    if (s === 1 && sig) placeSignature(k, sig.key, 0.5);            // teach the signature early
    const ne = rampEnemies(t);                                      // 1 → 3 with progress
    if (s > 0 && s % 2 === 0) for (let e = 0; e < Math.min(ne, 1); e++) k.enemy(0.5 + e * 0.1, 50);
    if (mechanic) mechanic(k, s, t);
    if (s < segments - 1) k.gap(G).bridge(70, 150, mat);
  }
  return k.done(name);
}

/** buildAscending — a climbing level: each solid sits a tier higher (reward shelves), same gate-safe
 *  rhythm. (A vertical-tower is buildAscending with a steeper rise + tighter segments.) */
export function buildAscending({ name = 'Climb', sky, mat = 'solid', segments = 5, levelIndex = 0, rise = 0 } = {}) {
  const k = Track({ sky });
  const sig = signatureFor(levelIndex);
  for (let s = 0; s < segments; s++) {
    k.solid(520, mat);
    if (s === 1 && sig) placeSignature(k, sig.key, 0.5);
    if (s > 0) k.ledge(0.5, 158 + (s % 3) * 14, 120, mat);          // a rising reward shelf
    if (s % 2 === 1) k.enemy(0.5, 50);
    if (s < segments - 1) k.gap(150).bridge(64 + (s % 3) * 6, 150, mat);
  }
  return k.done(name);
}

/** Build a whole campaign — n distinct levels (distinct signature each), rising difficulty, with a
 *  late climax (#33). Pass a `worlds` array of {name,sky,mat} to theme them. */
export function buildCampaign(n = 5, worlds = [], opts = {}) {
  const peak = climaxIndex(n);
  return Array.from({ length: n }, (_, i) => {
    const w = worlds[i] || {};
    const builder = (opts.ascendingEvery && i % opts.ascendingEvery === 0) ? buildAscending : buildLong;
    return builder({ name: w.name || `Level ${i + 1}`, sky: w.sky, mat: w.mat || 'solid', levelIndex: i, levelCount: n, segments: i === peak ? 7 : 5 + (i > peak ? -1 : 0) });
  });
}

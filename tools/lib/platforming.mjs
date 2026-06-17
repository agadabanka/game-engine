// tools/lib/platforming.mjs — the shared PRECISION-PLATFORMER movement core (pure + deterministic).
//
// One source of truth for the moveset (run · variable jump w/ coyote+buffer · 8-way air-dash ·
// wall-slide + wall-jump · fast-fall) as a state→state step function with AABB collision. The SOLVER
// forward-simulates rooms with this (fast, in Node), and a game can drive its player from the SAME
// numbers (configured by mechspec.physicsConfig) so "what the solver proves" == "what the player feels".
//
// step(state, input, room, cfg) → next state.  No rendering, no RNG → byte-deterministic.

const DT = 1 / 60, BW = 22, BH = 30;   // fixed timestep + body half-extents come from BW/BH

/** A fresh hero state at (x,y). */
export function spawn(x, y) {
  return { x, y, vx: 0, vy: 0, onGround: false, onWallL: false, onWallR: false, facing: 1,
    dashReady: true, dashTimer: 0, dvx: 0, dvy: 0, dashCool: 0, coyote: 0, jumpBuf: 0, jumpLatch: false,
    dead: false, won: false, frame: 0 };
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }

// resolve the body (centered at s.x,s.y, size BW×BH) against axis-aligned solids, one axis at a time.
function moveAxis(s, dx, dy, solids) {
  s.onGround = false; s.onWallL = false; s.onWallR = false;
  // X
  s.x += dx;
  for (const [rx, ry, rw, rh] of solids) {
    if (rectsOverlap(s.x - BW / 2, s.y - BH / 2, BW, BH, rx, ry, rw, rh)) {
      if (dx > 0) { s.x = rx - BW / 2; s.onWallR = true; s.vx = 0; }
      else if (dx < 0) { s.x = rx + rw + BW / 2; s.onWallL = true; s.vx = 0; }
    }
  }
  // Y
  s.y += dy;
  for (const [rx, ry, rw, rh] of solids) {
    if (rectsOverlap(s.x - BW / 2, s.y - BH / 2, BW, BH, rx, ry, rw, rh)) {
      if (dy > 0) { s.y = ry - BH / 2; s.onGround = true; s.vy = 0; }
      else if (dy < 0) { s.y = ry + rh + BH / 2; s.vy = 0; }
    }
  }
}

/**
 * Advance one frame.
 *  input: { left,right,up,down,jump,dash, dashX,dashY }
 *  room:  { solids:[[x,y,w,h]], spikes:[[x,y,w,h]], springs:[[x,y]], crystals:[[x,y]], floorKill }
 *  cfg:   from mechspec.physicsConfig(spec)
 */
export function step(s, input, room, cfg) {
  if (s.dead || s.won) return s;
  const inp = input || {}, solids = room.solids || [], C = cfg;
  s.frame++;
  // timers
  if (s.onGround) { s.coyote = C.COYOTE; if (!C.DASH || (C.DASH.refillOn || []).includes('land')) s.dashReady = true; }
  else if (s.coyote > 0) s.coyote--;
  if (inp.jump) s.jumpBuf = C.BUFFER; else if (s.jumpBuf > 0) s.jumpBuf--;
  if (s.dashCool > 0) s.dashCool--;

  // ── DASH (gravity off for DASH.frames, fixed velocity, then keep momentum) ──
  if (C.DASH) {
    if (inp.dash && s.dashReady && s.dashTimer <= 0 && s.dashCool <= 0) {
      let dx = inp.dashX != null ? inp.dashX : (inp.right ? 1 : inp.left ? -1 : 0);
      let dy = inp.dashY != null ? inp.dashY : (inp.up ? -1 : inp.down ? 1 : 0);
      if (dx === 0 && dy === 0) dx = s.facing;
      const m = Math.hypot(dx, dy) || 1; s.dvx = (dx / m) * C.DASH.speed; s.dvy = (dy / m) * C.DASH.speed;
      s.dashTimer = C.DASH.frames; s.dashReady = false; s.dashCool = 8; if (dx !== 0) s.facing = dx > 0 ? 1 : -1;
    }
    if (s.dashTimer > 0) {
      s.vx = s.dvx; s.vy = s.dvy; s.dashTimer--;
      if (s.dashTimer === 0) { s.vx = s.dvx * C.DASH.keep; s.vy = s.dvy < 0 ? s.dvy * 0.35 : 0; }
      moveAxis(s, s.vx * DT, s.vy * DT, solids);
      return postMove(s, room, C);
    }
  }

  // ── run (instant horizontal) ──
  if (inp.left) { s.vx = -C.RUN; s.facing = -1; } else if (inp.right) { s.vx = C.RUN; s.facing = 1; } else s.vx = 0;

  // ── gravity ──
  s.vy = Math.min(C.TERMINAL, s.vy + C.GRAV * DT);

  // ── wall slide ──
  let sliding = 0;
  if (C.WALL && !s.onGround && s.vy > 0) {
    if (s.onWallL && inp.left) sliding = -1; else if (s.onWallR && inp.right) sliding = 1;
    if (sliding && s.vy > C.WALL.slideMax) s.vy = C.WALL.slideMax;
  }

  // ── jump / wall-jump (coyote + buffer) ──
  if (s.jumpBuf > 0 && !s.jumpLatch) {
    if (s.onGround || s.coyote > 0) { s.vy = -C.JUMP_V; s.jumpLatch = true; s.jumpBuf = 0; s.coyote = 0; }
    else if (C.WALL && (s.onWallL || sliding === -1)) { s.vy = -C.WALL.jumpVY; s.vx = C.WALL.jumpVX; s.facing = 1; s.jumpLatch = true; s.jumpBuf = 0; }
    else if (C.WALL && (s.onWallR || sliding === 1)) { s.vy = -C.WALL.jumpVY; s.vx = -C.WALL.jumpVX; s.facing = -1; s.jumpLatch = true; s.jumpBuf = 0; }
  }
  if (!inp.jump) s.jumpLatch = false;
  if (C.VAR_CUT && !inp.jump && s.vy < -C.VAR_CUT) s.vy = -C.VAR_CUT;        // variable-jump cut
  if (inp.down && !s.onGround && s.vy > 0 && s.vy < C.FAST_FALL) s.vy = Math.min(C.FAST_FALL, s.vy + 60);

  moveAxis(s, s.vx * DT, s.vy * DT, solids);
  return postMove(s, room, C);
}

function postMove(s, room, C) {
  // springs (bounce when falling onto one)
  for (const sp of room.springs || []) {
    if (rectsOverlap(s.x - BW / 2, s.y - BH / 2, BW, BH, sp[0] - 17, sp[1] - 8, 34, 16) && s.vy > -30) { s.vy = -760; s.dashReady = true; }
  }
  // crystals (refill dash)
  if (C.DASH) for (const c of room.crystals || []) { if (rectsOverlap(s.x - BW / 2, s.y - BH / 2, BW, BH, c[0] - 14, c[1] - 14, 28, 28)) s.dashReady = true; }
  // spikes / hazards → death
  for (const sp of room.spikes || []) { if (rectsOverlap(s.x - BW / 2, s.y - BH / 2, BW, BH, sp[0], sp[1], sp[2], sp[3] || 14)) { s.dead = true; return s; } }
  if (room.floorKill != null && s.y > room.floorKill) s.dead = true;
  return s;
}

export const BODY = { w: BW, h: BH };
export default { spawn, step, BODY };

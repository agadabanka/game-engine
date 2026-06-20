// Studio.Actors (#50) — the declarative actor state machine (Keen's statetype).
// Loads the real SDK (engine/sdk/studio.js is an IIFE that sets globalThis.Studio,
// no Phaser/DOM needed at definition time) and exercises the FSM with a fake world.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../engine/sdk/studio.js';

const Studio = globalThis.Studio;

// minimal stand-ins for the Phaser bodies Studio.Actors touches
function enemy(props) {
  return Object.assign({ active: true, x: 200, y: 100, dir: 1, homeX: 200, patrol: 60 }, props);
}
function world(list, player) {
  return { enemies: { getChildren: () => list }, player };
}
function run(list, w, frames) {
  for (let f = 0; f < frames; f++) Studio.Actors.step(null, w, f);
  return list.map((e) => ({ x: +e.x.toFixed(6), y: +e.y.toFixed(6), dir: e.dir }));
}

test('Studio.Actors exists with the FSM surface', () => {
  assert.ok(Studio.Actors, 'Studio.Actors defined');
  for (const k of ['define', 'attach', 'step', 'contact', 'LIB']) assert.ok(Studio.Actors[k], `has ${k}`);
});

test('define() resolves string next links into the real state objects', () => {
  const chain = Studio.Actors.define({
    a: { tic: 1, next: 'b' },
    b: { tic: 1, next: 'a' },
  });
  assert.equal(chain.a.next, chain.b);
  assert.equal(chain.b.next, chain.a);
});

test('patroller paces within ±patrol and turns at the edge', () => {
  const e = enemy({ patrol: 10, homeX: 200, x: 200, dir: 1 });
  Studio.Actors.attach(e, Studio.Actors.LIB.patroller({ speed: 1 }));
  run([e], world([e]), 40);
  // never escapes the patrol band (allowing one step of overshoot before the turn)
  assert.ok(Math.abs(e.x - 200) <= 12, `stayed near home, got ${e.x}`);
});

test('deterministic: two identical runs produce identical state', () => {
  const mk = () => {
    const e = enemy({});
    Studio.Actors.attach(e, Studio.Actors.LIB.sentry({ speed: 0.7, pace: 8, rest: 5 }));
    return e;
  };
  const a = mk(), b = mk();
  const ra = run([a], world([a]), 200);
  const rb = run([b], world([b]), 200);
  assert.deepEqual(ra, rb);
});

test('sentry alternates walk (moves) and pause (still)', () => {
  const e = enemy({ x: 200, patrol: 9999 });
  Studio.Actors.attach(e, Studio.Actors.LIB.sentry({ speed: 1, pace: 5, rest: 5 }));
  const w = world([e]);
  for (let f = 0; f < 5; f++) Studio.Actors.step(null, w, f);   // walk phase
  const afterWalk = e.x;
  assert.ok(afterWalk > 200, 'moved during walk');
  for (let f = 0; f < 5; f++) Studio.Actors.step(null, w, f);   // pause phase
  assert.equal(e.x, afterWalk, 'still during pause');
});

test('pouncer transitions walk → windup → dash when the player is in range', () => {
  const e = enemy({ x: 200, patrol: 9999, dir: 1 });
  Studio.Actors.attach(e, Studio.Actors.LIB.pouncer({ speed: 0.6, range: 80, wind: 3 }));
  const seen = new Set();
  const w = world([e], { x: 250, y: 100 });   // player 50px away, same level → in range
  for (let f = 0; f < 10; f++) { Studio.Actors.step(null, w, f); seen.add(e.state); }
  // it left the walk state (entered windup/dash), proving the think() transition fired
  assert.ok(seen.size > 1, 'changed state');
  assert.equal(e.dir, 1, 'faced the player to its right');
});

test('byte-safe: Studio.Enemies.step ignores stateful actors; Studio.Actors ignores stateless ones', () => {
  const legacy = enemy({ x: 200, _spd: 0.6, patrol: 9999 });           // no .state
  const fsm = enemy({ x: 200, _spd: 0.6, patrol: 9999 });
  Studio.Actors.attach(fsm, Studio.Actors.LIB.patroller({ speed: 5 }));
  const w = world([legacy, fsm]);
  // Enemies.step must move ONLY the legacy body (not the FSM one)
  const fsmX = fsm.x;
  Studio.Enemies.step(null, w, 0);
  assert.ok(legacy.x > 200, 'legacy walker moved via Studio.Enemies.step');
  assert.equal(fsm.x, fsmX, 'FSM actor untouched by Studio.Enemies.step');
  // Actors.step must move ONLY the FSM body (not the legacy one)
  const legacyX = legacy.x;
  Studio.Actors.step(null, w, 0);
  assert.ok(fsm.x > fsmX, 'FSM actor moved via Studio.Actors.step');
  assert.equal(legacy.x, legacyX, 'legacy walker untouched by Studio.Actors.step');
});

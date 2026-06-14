import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reach, playReach, reachLint } from './reach.mjs';

const base = { groundY: 470, ground: [[0, 600]], platforms: [], oneway: [], pads: [] };

test('a coin just above ground is walk/jump-reachable', () => {
  const r = reach({ ...base, coins: [{ x: 300, y: 436 }] });   // 34px up → walk
  assert.equal(r.reachable, 1);
  assert.equal(r.reach[0].how, 'walk');
});
test('a coin within jump height off a platform is a jump', () => {
  const r = reach({ ...base, platforms: [{ x: 250, y: 300, w: 120 }], coins: [{ x: 310, y: 190 }] }); // 110px over the platform top
  assert.equal(r.reach[0].how, 'jump');
});
test('a coin over a pit with no surface or pad is UNREACHABLE', () => {
  const r = reach({ groundY: 470, ground: [[0, 200], [500, 700]], platforms: [], pads: [], coins: [{ x: 350, y: 300 }] });
  assert.equal(r.reachable, 0);
  assert.equal(r.un.length, 1);
});
test('a pad makes a high coin spring-reachable', () => {
  const r = reach({ ...base, pads: [{ x: 300 }], coins: [{ x: 305, y: 230 }] });  // 240px up, but a pad is under it
  assert.equal(r.reach[0].how, 'spring');
});
test('playReach is stricter: a coin only reachable via a floating platform is flagged', () => {
  const lvl = { ...base, platforms: [{ x: 250, y: 300, w: 120 }], coins: [{ x: 310, y: 190 }] };
  assert.equal(reach(lvl).reachable, 1);        // geometric: the platform counts
  assert.equal(playReach(lvl).reachable, 0);    // play-aware: ground+pads only → stranded
});
test('reachLint returns only levels with unreachable rewards', () => {
  const ok = { name: 'A', groundY: 470, ground: [[0, 600]], coins: [{ x: 100, y: 436 }] };
  const bad = { name: 'B', groundY: 470, ground: [[0, 200], [500, 700]], coins: [{ x: 350, y: 300 }] };
  const lint = reachLint([ok, bad]);
  assert.equal(lint.length, 1);
  assert.equal(lint[0].name, 'B');
});

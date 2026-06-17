// Tests for the mechanics-spec + verb-aware room solver + room chaining.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genreTemplate, validate, verbSet, physicsConfig, genreFor } from './mechspec.mjs';
import { solveRoom } from './solver.mjs';
import { prepRoom, verifyRoom, chainRooms } from './rooms.mjs';

const SPEC = genreTemplate('precision-dash-platformer');
const ground = [40, 480, 880, 40];
const room = (top, w = 320, x = 360) => ({ solids: [ground, [x, top, w, 22]], spikes: [], springs: [], crystals: [], entranceIdx: 0, exitIdx: 1, floorKill: 560 });

test('mechspec: valid template + verb-set + genre routing', () => {
  assert.ok(validate(SPEC).ok);
  assert.deepEqual(verbSet(SPEC), ['run', 'jump', 'dash', 'walljump']);
  const c = physicsConfig(SPEC); assert.equal(c.JUMP_V, 570); assert.ok(c.DASH && c.WALL);
  assert.equal(genreFor('clone Celeste air-dash climber'), 'precision-dash-platformer');
});

test('solver: a low gap is jump-able (dash not required)', () => {
  const r = solveRoom(room(480 - 120), SPEC);   // ~120px climb
  assert.ok(r.solvable);
  assert.ok(!r.requires.includes('dash'));
});

test('solver: a tall gap is solvable but REQUIRES the dash (the depth a dumb gate cannot certify)', () => {
  const r = solveRoom(room(480 - 155), SPEC);   // ~155px climb — past the jump, within the apex-dash
  assert.ok(r.solvable, r.reason);
  assert.ok(r.requires.includes('dash'), 'a 155px gap must require the dash');
  assert.ok(r.difficulty > 0 && Array.isArray(r.path));
});

test('solver: a gap beyond the apex-dash is rejected (unsolvable)', () => {
  const r = solveRoom(room(480 - 200), SPEC);   // 200px — beyond reach
  assert.equal(r.solvable, false);
});

test('rooms: prepRoom resolves entrance/exit; chainRooms verifies + emits a path', () => {
  const p = prepRoom({ solids: [ground, [360, 330, 320, 22]], entrance: [120, 480], exit: [520, 330] });
  assert.equal(p.entranceIdx, 0); assert.equal(p.exitIdx, 1);
  const { report, allSolved, level } = chainRooms([
    { name: 'r1', idea: 'dash', solids: [ground, [360, 330, 320, 22]], entrance: [120, 480], exit: [520, 330] },
  ], SPEC);
  assert.ok(allSolved);
  assert.ok(report[0].requires.includes('dash'));
  assert.ok(level.path.length >= 1);   // the solver emitted the autopilot path
});

test('verifyRoom: ideaOk fails when the room does not actually demand its declared idea', () => {
  const easy = verifyRoom({ name: 'easy', idea: 'dash', solids: [ground, [360, 480 - 110, 320, 22]], entrance: [120, 480], exit: [520, 480 - 110] }, SPEC);
  assert.equal(easy.solvable, true);
  assert.equal(easy.ideaOk, false);   // a 110px gap doesn't REQUIRE the dash → the "teach-dash" claim is false
});

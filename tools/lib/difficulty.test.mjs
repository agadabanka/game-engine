import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampEnemies, rampGap, rampHazard, isBig, climaxIndex, isCalmOpening, arcWeight, difficultyArc } from './difficulty.mjs';

test('ramps rise monotonically from t=0 to t=1 and clamp', () => {
  assert.equal(rampEnemies(0), 1);
  assert.equal(rampEnemies(1), 3);
  assert.ok(rampEnemies(0.5) >= rampEnemies(0) && rampEnemies(1) >= rampEnemies(0.5));
  assert.ok(rampGap(1) > rampGap(0));
  assert.ok(rampHazard(1) > rampHazard(0));
  assert.equal(rampEnemies(5), 3, 'clamps above 1');
  assert.equal(rampEnemies(-2), 1, 'clamps below 0');
});
test('isBig flags every Nth (the elite)', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => isBig(i, 3)), [false, false, true, false, false, true]);
});
test('climax sits LATE (~84%) and never out of range', () => {
  assert.equal(climaxIndex(5), 3);          // level 4 of 5
  assert.equal(climaxIndex(13), 10);        // deepfin: ~84% of 13
  assert.equal(climaxIndex(1), 0);
  assert.ok(climaxIndex(5) < 5 && climaxIndex(5) >= 0);
});
test('the opening is calm, the climax is the peak weight', () => {
  assert.ok(isCalmOpening(0));
  assert.ok(!isCalmOpening(0.5));
  const arc = difficultyArc(5);
  assert.equal(arc.length, 5);
  assert.ok(arc[0].calm, 'level 0 is calm');
  const peak = arc.find((a) => a.climax);
  assert.equal(peak.level, 3);
  // weight rises into the climax
  assert.ok(arc[3].weight >= arc[1].weight && arc[1].weight >= arc[0].weight);
  // and eases slightly after the peak
  assert.ok(arc[4].weight <= arc[3].weight);
});

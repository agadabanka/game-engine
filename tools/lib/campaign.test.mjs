import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldsFrom, shapeArc, validateArc, campaign } from './campaign.mjs';

const meta = { name: 'G', worlds: ['Meadow', 'Cavern', 'Foundry', 'Glacier', 'Summit'] };

test('worldsFrom builds the WORLDS struct: tags, rising difficulty, final-world boss', () => {
  const w = worldsFrom(meta);
  assert.equal(w.length, 5);
  assert.equal(w[0].tag, 'Start');
  assert.equal(w[4].tag, 'Finale');
  assert.equal(w[4].boss, true);
  assert.ok(w[3].tag === 'Climax');                    // climaxIndex(5) === 3
  assert.ok(w[4].difficulty >= w[0].difficulty);       // rises
});
test('validateArc passes a calm-open/late-climax arc, fails a front-loaded one', () => {
  assert.equal(validateArc(worldsFrom(meta)).ok, true);
  const frontLoaded = [1, 0.8, 0.5, 0.3, 0.1];
  const bad = validateArc(frontLoaded);
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.length >= 1);
});
test('shapeArc seats the hardest level at the climax slot', () => {
  // levels whose "fun" we inject ascending by index, except index 0 is the hardest
  const levels = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const score = (L) => (L.id === 0 ? 100 : L.id);      // id 0 is hardest
  const { order } = shapeArc(levels, score);
  assert.equal(order[3], 0, 'hardest seated at the climax index (3 of 5)');
  assert.equal(order.length, 5);
  assert.equal(new Set(order).size, 5, 'a permutation');
});
test('campaign() emits worlds + arc + world-map', () => {
  const c = campaign(meta);
  assert.equal(c.worlds.length, 5);
  assert.ok(c.arc.ok || c.arc.issues);
  assert.equal(c.map[4].boss, true);
  assert.ok(c.map.every((m) => m.tag));
});

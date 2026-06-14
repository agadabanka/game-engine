import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENSES, designIntent, validateIntent, campaignDesign } from './design.mjs';

const rich = { name: 'Belt World', width: 1800, groundY: 470, ground: [[0, 600], [800, 1800]], conveyor: [{ x0: 200, x1: 400 }], pads: [{ x: 1000 }], enemies: [{ x: 1200 }], coins: [{ x: 300, y: 300 }] };

test('LENSES are Schell-numbered design questions', () => {
  assert.ok(LENSES.interest && LENSES.interest.n === 61 && LENSES.interest.q);
  assert.ok(Object.keys(LENSES).length >= 8);
});
test('designIntent records signature + arc position + interest curve', () => {
  const it = designIntent(rich, 1, 5);
  assert.equal(it.signature, 'conveyor');          // level index 1 → conveyor (signatureFor)
  assert.ok(it.interestCurve.length > 0 && typeof it.fun === 'number');
  assert.ok(it.difficulty > 0 && it.difficulty <= 1);
  assert.ok(Array.isArray(it.lenses) && it.lenses.includes('challenge'));
});
test('validateIntent flags a level missing its signature verb', () => {
  const it = designIntent(rich, 1, 5);              // wants 'conveyor'
  assert.ok(!validateIntent(rich, it).issues.some((s) => s.includes('conveyor')), 'present signature not flagged');
  const bad = validateIntent({ ...rich, conveyor: [] }, it);
  assert.ok(bad.issues.some((s) => s.includes('conveyor')), 'missing signature flagged');
});
test('campaignDesign reports intent + checks + mean FUN', () => {
  const levels = [rich, { ...rich, name: 'B' }, { ...rich, name: 'C' }];
  const d = campaignDesign(levels);
  assert.equal(d.intents.length, 3);
  assert.equal(d.checks.length, 3);
  assert.ok(typeof d.meanFun === 'number');
});

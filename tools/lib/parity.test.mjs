import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkParity, countMechanics, PARITY } from './parity.mjs';

const rich = { menu: true, scaleFit: true, fullBleed: true, touch: true, art: true, mechanics: 5, enemyKinds: 5, story: true };

test('a rich game passes parity', () => {
  const v = checkParity(rich);
  assert.equal(v.ok, true);
  assert.equal(v.failed.length, 0);
});
test('a thin game fails on the missing pieces', () => {
  const v = checkParity({ menu: true, scaleFit: true, fullBleed: true, touch: true, art: false, mechanics: 1, enemyKinds: 1, story: false });
  assert.equal(v.ok, false);
  assert.ok(v.failed.includes('art') && v.failed.includes('mechanics') && v.failed.includes('enemies') && v.failed.includes('story'));
});
test('mobile needs BOTH scale + full-bleed', () => {
  assert.equal(checkParity({ ...rich, fullBleed: false }).failed.includes('mobile'), true);
  assert.equal(checkParity({ ...rich, scaleFit: false }).failed.includes('mobile'), true);
});
test('countMechanics counts distinct mechanics across levels', () => {
  const levels = [
    { conveyor: [{}], pads: [{}], enemies: [{ fly: true }] },
    { dashpad: [{}], crumble: [{}], fields: [{ type: 'updraft' }] },
    { oneway: [{}], boss: { x: 1 } },
  ];
  assert.equal(countMechanics(levels), 8);   // spring,conveyor,flyer,dashpad,crumble,updraft,oneway,boss
});
test('thresholds are configurable', () => {
  assert.equal(checkParity({ ...rich, mechanics: 2 }).ok, false);            // default needs ≥3
  assert.equal(checkParity({ ...rich, mechanics: 2 }, { mechanics: 2 }).ok, true);
  assert.equal(PARITY.mechanics, 3);
});

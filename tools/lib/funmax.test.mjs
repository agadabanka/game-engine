import { test } from 'node:test';
import assert from 'node:assert/strict';
import { funMax, funMaxCampaign, gateSafe } from './funmax.mjs';
import { predict } from './feelmodel.mjs';

const lvl = () => ({ name: 'T', width: 2400, groundY: 470, ground: [[0, 1100], [1300, 2400]], enemies: [{ x: 200 }], pads: [{ x: 400 }], coins: [{ x: 420, y: 300 }] });

test('funMax raises predicted FUN and logs kept/rejected edits', () => {
  const r = funMax(lvl(), { steps: 10 });
  assert.ok(r.fun1 > r.fun0, `fun rose ${r.fun0} → ${r.fun1}`);
  assert.ok(r.log.length > 0 && r.kept > 0);
  assert.ok(r.log.every((e) => typeof e.kept === 'boolean'));
});
test('gateSafe rejects a dashpad dropped into a pit', () => {
  const pit = { ...lvl(), dashpad: [{ x: 1200 }] };  // x=1200 is in the gap 1100..1300
  assert.equal(gateSafe(pit), false);
  const ok = { ...lvl(), dashpad: [{ x: 800 }] };    // over ground
  assert.equal(gateSafe(ok), true);
});
test('funMax never KEEPS an edit that lowers fun (monotone)', () => {
  const r = funMax(lvl(), { steps: 12 });
  // reconstruct: each kept edit must have fun >= the running best at that point
  let best = r.fun0;
  for (const e of r.log) if (e.kept) { assert.ok(e.fun >= best, `kept ${e.type} did not improve`); best = e.fun; }
});
test('funMaxCampaign lifts the mean FUN across levels', () => {
  const c = funMaxCampaign([lvl(), { ...lvl(), name: 'B' }], { steps: 8 });
  assert.equal(c.levels.length, 2);
  assert.ok(c.meanFun1 >= c.meanFun0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idealAt, collectBeats, predict, score, funReport } from './feelmodel.mjs';

test('idealAt rises and spikes near the 84% climax', () => {
  assert.ok(idealAt(1) > idealAt(0));
  assert.ok(idealAt(0.84) > idealAt(0.6) && idealAt(0.84) > idealAt(1));
});
test('collectBeats reads engine pixel level data (enemies/mechanics/gaps)', () => {
  const L = { width: 1200, groundY: 470, ground: [[0, 500], [700, 1200]], enemies: [{ x: 200 }, { x: 900, fly: true }], conveyor: [{ x0: 100, x1: 280 }], dashpad: [{ x: 800 }], coins: [] };
  const b = collectBeats(L);
  const types = b.map((x) => x.type);
  assert.ok(types.includes('walker') && types.includes('flyer') && types.includes('conveyor') && types.includes('dashpad'));
  assert.ok(types.includes('gap'), 'a gap between ground segments is a beat');
});
test('a flat ground-only level scores LOW fun; a varied rising one scores higher', () => {
  const flat = { width: 2000, groundY: 470, ground: [[0, 2000]], coins: [] };
  const varied = {
    width: 2000, groundY: 470, ground: [[0, 500], [650, 1100], [1250, 2000]],
    pads: [{ x: 300 }], conveyor: [{ x0: 700, x1: 900 }], enemies: [{ x: 1400 }, { x: 1700, fly: true }],
    dashpad: [{ x: 1500 }], coins: [{ x: 320, y: 300 }, { x: 1450, y: 300 }],
  };
  const f = predict(flat).fun, v = predict(varied).fun;
  assert.ok(v > f, `varied (${v}) should beat flat (${f})`);
  assert.ok(f < 45, `flat should be dull (${f})`);
});
test('score components are all in [0,1] and fun in [0,100]', () => {
  const p = predict({ width: 1800, groundY: 470, ground: [[0, 600], [800, 1800]], enemies: [{ x: 300 }], pads: [{ x: 1000 }], coins: [] });
  for (const k of ['engagement', 'dynamics', 'arc', 'flow']) assert.ok(p.components[k] >= 0 && p.components[k] <= 1, k);
  assert.ok(p.fun >= 0 && p.fun <= 100);
});
test('funReport surfaces mean + weakest/strongest', () => {
  const levels = [
    { name: 'flat', width: 1500, groundY: 470, ground: [[0, 1500]], coins: [] },
    { name: 'rich', width: 1500, groundY: 470, ground: [[0, 600], [800, 1500]], pads: [{ x: 300 }], enemies: [{ x: 1000 }], dashpad: [{ x: 1100 }], coins: [{ x: 320, y: 300 }] },
  ];
  const r = funReport(levels);
  assert.equal(r.weakest.name, 'flat');
  assert.equal(r.strongest.name, 'rich');
  assert.ok(r.mean > 0);
});

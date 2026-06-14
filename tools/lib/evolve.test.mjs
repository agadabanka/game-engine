import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneLevel, applyEdit, chooseFallback, critiquePrompt, EDITABLE } from './evolve.mjs';
import { predict } from './feelmodel.mjs';

const lvl = () => ({ name: 'T', width: 2400, groundY: 470, ground: [[0, 1100], [1300, 2400]], enemies: [{ x: 200 }], pads: [{ x: 400 }], coins: [{ x: 420, y: 300 }] });

test('applyEdit adds the right element near x and does not mutate the original', () => {
  const L = lvl();
  const { level, type } = applyEdit(L, 1500, 'conveyor');
  assert.equal(type, 'conveyor');
  assert.equal(level.conveyor.length, 1);
  assert.ok(level.conveyor[0].x0 < 1500 && level.conveyor[0].x1 > 1500);
  assert.equal(L.conveyor, undefined, 'original untouched (cloned)');
});
test('every EDITABLE verb applies without throwing and lands a beat', () => {
  for (const t of EDITABLE) {
    const r = applyEdit(lvl(), 1500, t);
    assert.ok(r.level, `${t} produced a level`);
  }
});
test('chooseFallback proposes an edit that fills dead-air and does not LOWER fun', () => {
  const L = lvl();
  const before = predict(L).fun;
  const edit = chooseFallback(L);
  assert.ok(edit && edit.level, 'an edit was proposed');
  const after = predict(edit.level).fun;
  assert.ok(after >= before, `fun should not drop (${before} → ${after})`);
});
test('iterating the fallback raises predicted FUN (hill-climb signal)', () => {
  let L = lvl(), fun0 = predict(L).fun;
  for (let i = 0; i < 8; i++) { const e = chooseFallback(L); if (!e) break; const f = predict(e.level).fun; if (f >= predict(L).fun) L = e.level; }
  assert.ok(predict(L).fun > fun0, `fun rose over the loop (${fun0} → ${predict(L).fun})`);
});
test('critiquePrompt embeds the curve + the JSON contract', () => {
  const p = critiquePrompt(lvl());
  assert.ok(p.includes('FUN=') && p.includes('"type"') && p.includes('"x"'));
});

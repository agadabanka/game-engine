import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENT_LIBRARY, FUN, byFeeling, highInterestVerbs, backlog, interestOf } from './elements.mjs';

test('every element maps to a valid feeling + interest 0-10', () => {
  for (const [k, e] of Object.entries(ELEMENT_LIBRARY)) {
    assert.ok(FUN[e.feeling], `${k}: feeling ${e.feeling} not in FUN`);
    assert.ok(e.interest >= 0 && e.interest <= 10, `${k}: interest ${e.interest}`);
    assert.equal(typeof e.implemented, 'boolean', `${k}: implemented`);
    assert.ok(e.ai && e.note, `${k}: ai+note`);
  }
});
test('byFeeling returns only implemented, sorted by interest', () => {
  const ch = byFeeling('Challenge');
  assert.ok(ch.length > 0);
  assert.ok(ch.every((e) => ELEMENT_LIBRARY[e.key].implemented));
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i - 1].interest >= ch[i].interest);
});
test('highInterestVerbs are implemented + interest>=6; backlog is the unimplemented set', () => {
  assert.ok(highInterestVerbs().every((e) => e.interest >= 6 && ELEMENT_LIBRARY[e.key].implemented));
  assert.ok(backlog().every((e) => !ELEMENT_LIBRARY[e.key].implemented));
  assert.ok(backlog().length >= 10, 'backlog should expose the #30 mechanics');
});
test('interestOf reads the weight; spring/boss rank high, coin low', () => {
  assert.equal(interestOf('spring'), 8);
  assert.equal(interestOf('coin'), 2);
  assert.equal(interestOf('nope'), 1);
});

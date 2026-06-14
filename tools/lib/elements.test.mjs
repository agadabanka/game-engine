import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENT_LIBRARY, FUN, byFeeling, highInterestVerbs, backlog, interestOf, SIGNATURE_POOL, signatureFor, noveltyFactor, noveltyInterest } from './elements.mjs';

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
test('#32 signatureFor gives one distinct, implemented verb per level (rotating)', () => {
  assert.ok(SIGNATURE_POOL.length >= 5);
  const n = signatureFor(0).pool ? 0 : SIGNATURE_POOL.filter((k) => ELEMENT_LIBRARY[k] && ELEMENT_LIBRARY[k].implemented).length;
  for (let i = 0; i < 5; i++) {
    const s = signatureFor(i);
    assert.ok(s && ELEMENT_LIBRARY[s.key].implemented, `level ${i} signature implemented`);
  }
  // distinct across the first min(5,poolSize) levels
  const keys = [0, 1, 2, 3, 4].map((i) => signatureFor(i).key).slice(0, Math.min(5, n));
  assert.equal(new Set(keys).size, keys.length, 'first levels get distinct signatures');
  assert.equal(signatureFor(0).key, signatureFor(n).key, 'rotates with the pool length');
});
test('#32 novelty/fatigue decays repeats ×0.84 (first use full)', () => {
  assert.equal(noveltyFactor(0), 1);
  assert.ok(Math.abs(noveltyFactor(1) - 0.84) < 1e-9);
  assert.ok(Math.abs(noveltyFactor(2) - 0.7056) < 1e-9);
  assert.equal(noveltyInterest('spring', 0), 8);
  assert.ok(noveltyInterest('spring', 2) < interestOf('spring'));   // habituation lowers it
});

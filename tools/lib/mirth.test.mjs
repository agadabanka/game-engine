// Tests for the funny gate (Studio.Mirth model). Run: node --test tools/lib/mirth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirthScore, MIRTH_GATE } from './mirth.mjs';

// a lively, varied, well-timed comedic run (the kind that should PASS the funny gate)
function funnyRun() {
  const kinds = ['bounce', 'pratfall', 'smooch', 'reaction', 'surprise', 'combo'];
  const evs = [];
  let f = 30;
  for (let i = 0; i < 30; i++) {
    evs.push({ t: kinds[i % kinds.length], f, mag: 1.5 + (i % 4) * 0.6 });
    f += 26 + ((i * 37) % 40); // varied spacing → good comic rhythm
  }
  return { events: evs, ctx: { frame: f } };
}

test('a varied, exaggerated, well-timed run clears the funny gate', () => {
  const { events, ctx } = funnyRun();
  const r = mirthScore(events, ctx);
  assert.ok(r.mirth >= MIRTH_GATE, `mirth ${r.mirth} < ${MIRTH_GATE}: ${JSON.stringify(r.parts)}`);
  assert.equal(r.beats, 30);
});

test('a dry run (few gags, one kind) does NOT clear the gate', () => {
  const evs = [{ t: 'bounce', f: 100, mag: 1 }, { t: 'bounce', f: 1500, mag: 1 }];
  const r = mirthScore(evs, { frame: 1800 });
  assert.ok(r.mirth < MIRTH_GATE, `expected dry run < gate, got ${r.mirth}`);
  assert.ok(r.parts.variety < 0.4 && r.parts.density < 0.6);
});

test('exaggeration rewards bigger slapstick magnitude', () => {
  const small = mirthScore([{ t: 'bounce', f: 10, mag: 0.5 }, { t: 'bounce', f: 40, mag: 0.5 }], { frame: 60 });
  const big = mirthScore([{ t: 'bounce', f: 10, mag: 3 }, { t: 'bounce', f: 40, mag: 3 }], { frame: 60 });
  assert.ok(big.parts.exaggeration > small.parts.exaggeration);
});

test('variety rises with distinct gag kinds', () => {
  const one = mirthScore([{ t: 'bounce', f: 10 }, { t: 'bounce', f: 40 }, { t: 'bounce', f: 70 }], { frame: 100 });
  const many = mirthScore([{ t: 'bounce', f: 10 }, { t: 'pratfall', f: 40 }, { t: 'smooch', f: 70 }], { frame: 100 });
  assert.ok(many.parts.variety > one.parts.variety);
});

test('metronomic timing scores lower than varied timing', () => {
  const metro = []; for (let i = 0; i < 12; i++) metro.push({ t: ['bounce', 'smooch', 'reaction'][i % 3], f: 100 + i * 30, mag: 2 });
  const varied = []; let f = 100; for (let i = 0; i < 12; i++) { varied.push({ t: ['bounce', 'smooch', 'reaction'][i % 3], f, mag: 2 }); f += 18 + ((i * 53) % 44); }
  const m = mirthScore(metro, { frame: 600 }), v = mirthScore(varied, { frame: 600 });
  assert.ok(v.parts.timing >= m.parts.timing, `varied ${v.parts.timing} should be >= metro ${m.parts.timing}`);
});

test('score is deterministic + bounded 0..100', () => {
  const { events, ctx } = funnyRun();
  const a = mirthScore(events, ctx), b = mirthScore(events, ctx);
  assert.deepEqual(a, b);
  assert.ok(a.mirth >= 0 && a.mirth <= 100);
});

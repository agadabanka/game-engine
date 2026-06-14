import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track, buildLong, buildAscending, buildCampaign } from './builders.mjs';
import { reach } from './reach.mjs';
import { predict } from './feelmodel.mjs';
import { signatureFor } from './elements.mjs';

function gapsOf(L) { const g = (L.ground || []).slice().sort((a, b) => a[0] - b[0]); const out = []; for (let i = 1; i < g.length; i++) if (g[i][0] > g[i - 1][1] + 4) out.push(g[i][0] - g[i - 1][1]); return out; }

test('Track emits a valid engine level spec', () => {
  const L = Track({ sky: 0x112233 }).solid(560, 'rock').gap(150).bridge().solid(560, 'rock').enemy(0.5).done('T');
  assert.ok(L.ground.length >= 2 && L.platforms.length >= 1 && L.spawn && L.goal > 0 && L.width > 0);
});
test('buildLong: gaps stay inside the hop envelope (gate-safe by construction)', () => {
  const L = buildLong({ name: 'A', segments: 6, levelIndex: 0 });
  for (const g of gapsOf(L)) assert.ok(g <= 165, `gap ${g} exceeds GAPMAX`);
});
test('buildLong teaches its signature verb, distinct per level index', () => {
  const verbPresent = (L, key) => ({ spring: () => (L.pads || []).length, conveyor: () => (L.conveyor || []).length, dashpad: () => (L.dashpad || []).length, oneway: () => (L.oneway || []).length, updraft: () => (L.fields || []).filter((f) => f.type === 'updraft').length, lowgrav: () => (L.fields || []).filter((f) => f.type === 'lowgrav').length, flyer: () => (L.enemies || []).filter((e) => e.fly).length }[key] || (() => 0))();
  for (let i = 0; i < 5; i++) {
    const L = buildLong({ name: `L${i}`, segments: 5, levelIndex: i });
    const sig = signatureFor(i).key;
    assert.ok(verbPresent(L, sig) > 0, `level ${i} should teach '${sig}'`);
  }
});
test('generated levels have (near-)full reachability', () => {
  const L = buildLong({ name: 'R', segments: 6, levelIndex: 1 });
  const r = reach(L);
  assert.ok(r.reachable >= r.total - 3, `most coins reachable (${r.reachable}/${r.total})`);
});
test('buildCampaign: n distinct levels, a LATE climax (more segments), valid FUN', () => {
  const camp = buildCampaign(5, [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }, { name: 'Four' }, { name: 'Five' }]);
  assert.equal(camp.length, 5);
  assert.ok(camp.every((L) => predict(L).fun >= 0));
  // the climax level (index 3 of 5) is the widest (7 segments)
  const widths = camp.map((L) => L.width);
  assert.ok(widths[3] >= Math.max(...widths) - 1, 'the climax level is the longest');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrativeFrom, narrativeMarkdown } from './narrative.mjs';

const meta = { name: 'Lovelump', hero: 'Lump, a heart of clay', worlds: ['Candy Heart Hills', 'Cloud Nine'], art: { enemies: [{ key: 'gummy', desc: 'a gummy' }] } };
const levels = [
  { name: 'L1', groundY: 470, ground: [[0, 500], [700, 1200]], pads: [{ x: 300 }], conveyor: [{ x0: 100, x1: 280 }], enemies: [{ x: 200 }], coins: [{ x: 150, y: 300 }] },
  { name: 'L2', groundY: 470, ground: [[0, 1200]], dashpad: [{ x: 600 }], enemies: [{ x: 400, fly: true }], boss: { x: 1100 }, coins: [] },
];

test('only USED primitives are mapped', () => {
  const n = narrativeFrom(meta, levels);
  assert.ok(n.used.includes('gap') && n.used.includes('spring') && n.used.includes('conveyor') && n.used.includes('dashpad'));
  assert.ok(n.used.includes('walker') && n.used.includes('flyer') && n.used.includes('boss'));
  assert.ok(!n.used.includes('crumble') && !n.used.includes('lowgrav'));   // unused → absent
});
test('walker maps to the cast, boss to the antagonist', () => {
  const n = narrativeFrom(meta, levels);
  const walker = n.map.find((m) => m.primitive === 'walker');
  const boss = n.map.find((m) => m.primitive === 'boss');
  assert.ok(walker.fiction.includes('Gummy'));
  assert.ok(boss.fiction && boss.fiction.length > 0);
});
test('themed defaults reference the game; nothing is truly unmapped (coherent)', () => {
  const n = narrativeFrom(meta, levels);
  assert.equal(n.ok, true);                          // every used primitive has a fiction
  const gap = n.map.find((m) => m.primitive === 'gap');
  assert.ok(gap.fiction.includes('lovelump'));       // themed, not generic 'pit'
});
test('authored fiction is marked and wins; auto-defaults are flagged', () => {
  const n = narrativeFrom(meta, levels, { fiction: { gap: 'a gap in the candy floor where the love ran out' } });
  const gap = n.map.find((m) => m.primitive === 'gap');
  assert.equal(gap.authored, true);
  assert.equal(gap.fiction, 'a gap in the candy floor where the love ran out');
  assert.ok(n.autoCount >= 1);                        // some primitives still on themed auto-defaults
});
test('narrativeMarkdown renders the mapping table with authored markers', () => {
  const n = narrativeFrom(meta, levels, { fiction: { spring: 'a heart-trampoline' } });
  const md = narrativeMarkdown(n, meta);
  assert.ok(md.includes('Narrative coherence — Lovelump') && md.includes('a heart-trampoline') && md.includes('★'));
});

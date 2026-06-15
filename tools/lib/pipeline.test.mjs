import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIPELINE, PHASES, tree, treeMarkdown, treeText } from './pipeline.mjs';

test('every stage has a key, phase, title, sub-steps, and an acceptance bar', () => {
  const phases = new Set(PHASES.map((p) => p[0]));
  for (const s of PIPELINE) {
    assert.ok(s.key && /^[a-z]+$/.test(s.key), `key ${s.key}`);   // [a-z]+ for the issue marker
    assert.ok(phases.has(s.phase), `${s.key}: phase ${s.phase}`);
    assert.ok(s.title && s.accept && Array.isArray(s.sub) && s.sub.length >= 2, `${s.key}: fields`);
  }
  assert.equal(new Set(PIPELINE.map((s) => s.key)).size, PIPELINE.length, 'unique keys');
});
test('tree() groups stages by phase, in order, covering all stages', () => {
  const t = tree();
  assert.equal(t.length, PHASES.length);
  assert.equal(t.reduce((n, g) => n + g.stages.length, 0), PIPELINE.length);
  assert.deepEqual(t.flatMap((g) => g.stages), PIPELINE);   // order preserved
});
test('treeMarkdown renders a fenced tree with phases, numbered stages, sub-steps + done marks', () => {
  const md = treeMarkdown({ scaffold: 'done' });
  assert.ok(md.startsWith('```') && md.trimEnd().endsWith('```'));
  assert.ok(md.includes('SET UP') && md.includes('SHIP IT'));
  assert.ok(md.includes('✓ 1. Scaffold the game') && md.includes('○ 19. Loop closed'));
  for (const sub of PIPELINE[0].sub) assert.ok(md.includes(sub), `sub-step "${sub}"`);
  assert.ok(!treeText().includes('```'));   // text form drops the fence
});

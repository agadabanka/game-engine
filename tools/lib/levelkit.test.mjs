// Tests for level-kit + gencache.  Run: node --test tools/lib/levelkit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintLevel, gaps, onGround, scaffoldLevel, PLATFORMER_RULES } from './levelkit.mjs';
import { cached, cacheKey, stable } from './gencache.mjs';

// the engine template's shipped level (Green Run) — must lint clean
const GREEN = { name: 'Green Run', tile: 40, width: 1920, groundY: 470, spawn: { x: 60, y: 360 }, goal: 1860,
  ground: [[0, 420, 'solid'], [560, 1100, 'solid'], [1180, 1920, 'solid']], walls: [{ x: 760, tiles: 2, mat: 'stone' }],
  coins: [{ x: 300, y: 440 }], enemies: [{ x: 980, patrol: 50 }] };

test('gaps are computed from ground segments', () => {
  assert.deepEqual(gaps(GREEN), [[420, 560, 140], [1100, 1180, 80]]);
});

test('the shipped Green Run lints clean', () => {
  const r = lintLevel(GREEN);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test('a too-wide gap is caught', () => {
  const bad = { ...GREEN, ground: [[0, 400, 'solid'], [700, 1920, 'solid']] }; // 300px gap > 200
  const r = lintLevel(bad);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.rule === 'gap-too-wide'));
});

test('a too-tall wall is caught', () => {
  const r = lintLevel({ ...GREEN, walls: [{ x: 760, tiles: 4 }] });
  assert.ok(r.issues.some((i) => i.rule === 'wall-too-tall'));
});

test('a wall too close to a gap is caught', () => {
  const r = lintLevel({ ...GREEN, walls: [{ x: 600, tiles: 2 }] }); // 40px from gap edge 560
  assert.ok(r.issues.some((i) => i.rule === 'wall-near-gap'));
});

test('spawn/goal/enemy over a gap are caught', () => {
  const r = lintLevel({ ...GREEN, spawn: { x: 480 }, enemies: [{ x: 1140 }] }); // both in gaps
  assert.ok(r.issues.some((i) => i.rule === 'spawn-in-gap'));
  assert.ok(r.issues.some((i) => i.rule === 'enemy-in-gap'));
});

test('scaffoldLevel produces a lint-clean level', () => {
  for (const gapCount of [0, 1, 2, 3]) {
    const lvl = scaffoldLevel({ gapCount, name: `S${gapCount}` });
    const r = lintLevel(lvl);
    assert.equal(r.ok, true, `gapCount ${gapCount}: ${JSON.stringify(r.issues)}`);
    assert.ok(onGround(lvl, lvl.spawn.x) && onGround(lvl, lvl.goal));
  }
});

// ── gencache ──
test('stable stringify is key-order independent', () => {
  assert.equal(stable({ a: 1, b: 2 }), stable({ b: 2, a: 1 }));
  assert.equal(cacheKey('art', { prompt: 'x', world: 1 }), cacheKey('art', { world: 1, prompt: 'x' }));
  assert.notEqual(cacheKey('art', { prompt: 'x' }), cacheKey('art', { prompt: 'y' }));
});

test('cached: miss generates+stores, hit reuses without calling gen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-'));
  let calls = 0;
  const gen = async () => { calls++; return Buffer.from('asset-bytes'); };
  const a = await cached('art', { prompt: 'sunset', world: 1 }, '.png', gen, { dir });
  assert.equal(a.hit, false); assert.equal(calls, 1);
  const b = await cached('art', { world: 1, prompt: 'sunset' }, '.png', gen, { dir }); // same params, reordered
  assert.equal(b.hit, true); assert.equal(calls, 1); // gen NOT called again
  assert.equal(a.key, b.key);
  assert.equal(fs.readFileSync(b.path, 'utf8'), 'asset-bytes');
  fs.rmSync(dir, { recursive: true, force: true });
});

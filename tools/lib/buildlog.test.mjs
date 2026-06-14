// Tests for the build-event log keystone.  Run: node --test tools/lib/buildlog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBuildLog, STAGES } from './buildlog.mjs';

function tmpGame() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-'));
  fs.writeFileSync(path.join(dir, 'GAME_META.json'), JSON.stringify({ id: 't', stages: {} }));
  return dir;
}

test('status map tracks ok / fail / skip / pending and last-write-wins', () => {
  const dir = tmpGame();
  const bl = createBuildLog({ game: 't', dir, quiet: true });
  bl.stage('scaffold').start(); bl.stage('scaffold').ok('repo created');
  bl.stage('gate').start(); bl.stage('gate').fail(new Error('FUN 64 < 70'));
  bl.stage('art').skip('cached');
  const m = bl.statusMap();
  assert.equal(m.scaffold, 'ok');
  assert.equal(m.gate, 'fail');
  assert.equal(m.art, 'skip');
  assert.equal(m.feel, 'pending');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a retried-then-passed stage ends ok (not stuck on run)', () => {
  const dir = tmpGame();
  const bl = createBuildLog({ game: 't', dir, quiet: true });
  bl.stage('gate').start(); bl.stage('gate').fail('flaky'); bl.stage('gate').retry(2); bl.stage('gate').start(); bl.stage('gate').ok('FUN 88');
  assert.equal(bl.statusMap().gate, 'ok');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('report renders checkmarks and a count', () => {
  const dir = tmpGame();
  const bl = createBuildLog({ game: 't', dir, quiet: true });
  bl.stage('scaffold').start(); bl.stage('scaffold').ok();
  const rep = bl.report();
  assert.match(rep, /\[1\/11\]/);
  assert.match(rep, /✓ Scaffold/);
  assert.match(rep, /○ Feel/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('diary entry is a ### section with per-stage checks + timing + failure note', () => {
  const dir = tmpGame();
  const bl = createBuildLog({ game: 't', dir, quiet: true });
  bl.stage('scaffold').start(); bl.stage('scaffold').ok('cloned base');
  bl.stage('gate').start(); bl.stage('gate').fail('determinism mismatch');
  const d = bl.toDiaryEntry('2026-06-14');
  assert.match(d, /^### Build log — 2026-06-14/);
  assert.match(d, /✓ \*\*Scaffold\*\* — cloned base/);
  assert.match(d, /✗ \*\*Gate \(eval\)\*\* — failed: determinism mismatch/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('updateMeta writes resumable stage flags into GAME_META.json', () => {
  const dir = tmpGame();
  const bl = createBuildLog({ game: 't', dir, quiet: true });
  bl.stage('scaffold').start(); bl.stage('scaffold').ok();
  bl.stage('gate').start(); bl.stage('gate').fail('x');
  bl.stage('art').skip('cached');
  bl.updateMeta(path.join(dir, 'GAME_META.json'));
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'GAME_META.json'), 'utf8'));
  assert.equal(meta.stages.scaffold, 'done');
  assert.equal(meta.stages.gate, 'fail');
  assert.equal(meta.stages.art, 'skip');
  assert.equal(meta.stages.feel ?? 'todo', 'todo'); // untouched stays unset/todo
  fs.rmSync(dir, { recursive: true, force: true });
});

test('events persist across instances (checkpoint/resume)', () => {
  const dir = tmpGame();
  const a = createBuildLog({ game: 't', dir, quiet: true });
  a.stage('scaffold').start(); a.stage('scaffold').ok();
  const b = createBuildLog({ game: 't', dir, quiet: true }); // fresh handle, same dir
  assert.equal(b.statusMap().scaffold, 'ok');
  assert.ok(fs.existsSync(path.join(dir, 'out', 'build-events.ndjson')));
  assert.ok(fs.existsSync(path.join(dir, 'out', 'build-status.json')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGES is the canonical 11-stage order', () => {
  assert.deepEqual(STAGES, ['scaffold', 'identity', 'levels', 'gate', 'feel', 'art', 'music', 'deploy', 'videos', 'shorts', 'loop']);
});

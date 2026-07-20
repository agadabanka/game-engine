// hub/lib/editor.js — the AI-editor hub tools (game-engine#93). Unit-tests the tool layer
// (session lifecycle, payload shaping, publish guards, TTL) with an injected fake session that
// mimics the claystone EditorSession contract — the session itself is proven in claystone's suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEditor } from './editor.js';

// a fake session: place() succeeds unless the block carries {bad:true} (→ a law violation), and
// the ghost "dies" iff a block with {breaks:true} was placed. simulate/diff track that state.
function fakeSession() {
  const ops = [], placed = [];
  let broken = false;
  const outcome = () => (broken ? { won: false, dead: true, frame: 312, cause: 'fall' } : { won: true, dead: false, frame: 473 });
  const shape = (res) => ({ ...res, ghost: res.ok ? { outcome: outcome() } : null, delta: res.ok ? { summary: `now: ${broken ? 'dead@312' : 'won@473'}` } : null });
  return {
    list: () => [{ type: 'coin' }, { type: 'platform' }],
    blocks: () => placed.map((b, i) => ({ id: 'b#' + i, ...b })),
    spec: () => ({ placed: placed.slice() }),
    place(b) { if (b.bad) return { ok: false, errors: [], violations: [{ law: 'landing-window', msg: '400px gap', fix: { x1: 200 } }] }; if (b.breaks) broken = true; placed.push(b); ops.push({ op: 'place', block: b }); return shape({ ok: true, violations: [] }); },
    move() { ops.push({ op: 'move' }); return shape({ ok: true, violations: [] }); },
    remove() { ops.push({ op: 'remove' }); return shape({ ok: true, violations: [] }); },
    undo() { ops.pop(); placed.pop(); broken = false; return shape({ ok: true, violations: [] }); },
    simulate: () => ({ outcome: outcome(), violations: [], delta: { summary: broken ? 'dead@312' : 'won@473' } }),
    diff: () => ({ ops: ops.slice(), added: placed.slice(), removed: [], changed: [] }),
  };
}

test('open → list/blocks/place/simulate/diff proxy the session with shaped payloads', async () => {
  const ed = makeEditor({ openSession: async () => fakeSession() });
  const o = await ed.open('rainbow-run', 3);
  assert.match(o.session, /^rainbow-run:3:/);
  assert.equal(o.canPublish, false);
  assert.deepEqual(o.baseline, { won: true, dead: false, frame: 473 });

  assert.equal(ed.list(o.session).types.length, 2);
  const good = ed.place(o.session, { type: 'coin' });
  assert.equal(good.ok, true);
  assert.equal(good.summary, 'now: won@473', 'agent narrates delta.summary, not coordinates');
  assert.equal(ed.blocks(o.session).blocks.length, 1);
  assert.equal(ed.diff(o.session).ops.length, 1);
});

test('a law violation comes back verbatim with the snap fix', async () => {
  const ed = makeEditor({ openSession: async () => fakeSession() });
  const o = await ed.open('g', 1);
  const bad = ed.place(o.session, { type: 'platform', bad: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.violations[0].law, 'landing-window');
  assert.deepEqual(bad.violations[0].fix, { x1: 200 });
  assert.match(bad.summary, /rejected: 400px gap/);
});

test('publish refuses an empty diff, refuses an unbeatable level, else ships via the injected gate', async () => {
  let shipped = null;
  const ed = makeEditor({ openSession: async () => fakeSession(), publish: async (job) => { shipped = job; return { mergeSha: 'abc123', gated: true }; } });
  const o = await ed.open('g', 1);
  assert.equal((await ed.publish(o.session)).ok, false, 'empty diff → refuse');

  ed.place(o.session, { type: 'coin', breaks: true });   // makes the ghost die
  const broken = await ed.publish(o.session);
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /not currently beatable/);
  assert.equal(shipped, null, 'never called the gate on a broken level');

  ed.undo(o.session);                                     // ghost beatable again
  ed.place(o.session, { type: 'coin' });
  const ok = await ed.publish(o.session);
  assert.equal(ok.ok, true);
  assert.equal(ok.mergeSha, 'abc123');
  assert.equal(shipped.game, 'g', 'publish job carried the game + diff to the ship machinery');
});

test('sessions are ephemeral: close frees them, TTL reaps stale ones', async () => {
  let t = 1000;
  const ed = makeEditor({ openSession: async () => fakeSession(), now: () => t, ttlMs: 5000 });
  const o = await ed.open('g', 1);
  assert.equal(ed._count(), 1);
  assert.equal(ed.close(o.session).ok, true);
  assert.equal(ed._count(), 0);
  // TTL reap: open, jump past ttl, next open reaps the stale one
  await ed.open('g', 2); t += 6000; await ed.open('g', 3);
  assert.equal(ed._count(), 1, 'the 6s-stale session was reaped on the next open');
});

test('unknown/expired session id throws a clear error', async () => {
  const ed = makeEditor({ openSession: async () => fakeSession() });
  assert.throws(() => ed.place('nope:1:9', {}), /no editor session/);
});

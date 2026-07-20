// ── AI-EDITOR · the hub half (game-engine#93) ────────────────────────────────
// The game-agnostic editor loop through the hub. Any game exposing a claystone EditorSession
// (claystone games natively; Phaser games via a vendored session, rainbow-run#319) gets AI editing:
// the hub agent opens an ephemeral, per-game session and drives it with these tools. EVERY mutating
// tool returns the session's { ok, violations, ghost, delta } VERBATIM — the agent narrates
// `delta.summary` ("was: won@473 · now: dead@312 …") instead of coordinates. Publishing runs the
// target game's OWN gate (never a hub-side approximation) via the existing online-mode ship flow.
//
// This module is the TESTABLE CORE: it is dependency-injected with `openSession(game, level)`
// (the hub wires it to clone+import a game's editor modules; tests pass a claystone session
// factory directly) and `publish(session, ctx)` (the hub wires it to the runJob ship machinery).
// No network, no globals — so it unit-tests without a live hub or API key.

// a session handle lives until close() or TTL; ids are opaque + per-game.
export function makeEditor({ openSession, publish, now, ttlMs = 30 * 60_000 } = {}) {
  if (typeof openSession !== 'function') throw new Error('makeEditor: openSession(game, level) is required');
  const clock = typeof now === 'function' ? now : () => Date.now();
  const sessions = new Map();   // id → { id, game, level, session, opened, touched }
  let seq = 0;

  const reap = () => { const t = clock(); for (const [id, s] of sessions) if (t - s.touched > ttlMs) sessions.delete(id); };
  const get = (id) => { const s = sessions.get(id); if (!s) throw new Error('no editor session ' + id + ' (open one first, or it expired)'); s.touched = clock(); return s; };
  // shape a mutation result for the agent: keep the machine payload, add a human line
  const shape = (res) => ({
    ok: !!res.ok,
    violations: (res.violations || []).map((v) => ({ law: v.law, msg: v.msg, fix: v.fix != null ? v.fix : null })),
    errors: res.errors || [],
    ghost: res.ghost ? res.ghost.outcome || res.ghost : null,
    delta: res.delta || null,
    summary: res.delta ? res.delta.summary : (res.ok ? 'placed' : 'rejected: ' + (res.errors || []).concat((res.violations || []).map((v) => v.msg)).join('; ')),
  });

  return {
    /** editor_open(game, level) → { session, level, blocks, simulate } — the agent's entry point */
    async open(game, level) {
      reap();
      const session = await openSession(game, level);
      const id = `${game}:${level}:${++seq}`;
      const t = clock();
      sessions.set(id, { id, game, level, session, opened: t, touched: t });
      const sim = session.simulate();
      return { session: id, game, level, blocks: session.blocks().length, baseline: sim.outcome || sim, canPublish: false };
    },
    /** editor_list(session) → the placeable menu (types + knob schemas + law ids) */
    list(id) { return { types: get(id).session.list() }; },
    /** editor_blocks(session) → the current blocks with stable ids (handles for move/remove) */
    blocks(id) { return { blocks: get(id).session.blocks() }; },
    /** editor_place(session, block) → {ok, violations, ghost, delta, summary} */
    place(id, block) { return shape(get(id).session.place(block)); },
    /** editor_move(session, blockId, fields) */
    move(id, blockId, fields) { return shape(get(id).session.move(blockId, fields)); },
    /** editor_remove(session, blockId) */
    remove(id, blockId) { return shape(get(id).session.remove(blockId)); },
    /** editor_undo(session) — step back one edit (proof rides along) */
    undo(id) { return shape(get(id).session.undo()); },
    /** editor_simulate(session) → the dynamic truth on demand (trail + outcome + violations) */
    simulate(id) { const s = get(id).session.simulate(); return { outcome: s.outcome || s, violations: s.violations || [], delta: s.delta || null }; },
    /** editor_diff(session) → the reviewable artifact (op log + net block change vs base) */
    diff(id) { const d = get(id).session.diff(); return { ops: d.ops, added: d.added, removed: d.removed, changed: d.changed }; },

    /**
     * editor_publish(session) — the fix-notes ship loop, editor-shaped: session diff → level-file
     * commit on a branch → the game's OWN gate → merge/push → the game's update-shell toasts.
     * Refuses an empty diff or a session whose ghost currently DIES (never ship a broken level).
     */
    async publish(id, ctx = {}) {
      const s = get(id);
      const d = s.session.diff();
      if (!d.ops.length) return { ok: false, reason: 'nothing to publish — no edits in this session' };
      const sim = s.session.simulate();
      const out = sim.outcome || sim;
      if (out && out.won === false) return { ok: false, reason: 'refusing to publish: the level is not currently beatable (ghost: ' + (sim.delta ? sim.delta.summary : JSON.stringify(out)) + ')' };
      if (typeof publish !== 'function') return { ok: false, reason: 'publish not wired on this hub (dry-run only)' };
      const result = await publish({ game: s.game, level: s.level, spec: s.session.spec(), diff: d }, ctx);
      return { ok: true, ...result };
    },

    /** editor_close(session) — sessions are ephemeral; free it */
    close(id) { return { ok: sessions.delete(id) }; },
    _count() { return sessions.size; },
  };
}

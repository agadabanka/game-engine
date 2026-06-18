// tools/lib/designtrace.mjs — the DECISION TRACE: serialize HOW a level came to be.
//
// Every generation step (a BSP cut, a contract, a proposed room, a solver verdict, a mutation, an
// accept/reject) is recorded as an event with its data, a human rationale, and a SNAPSHOT of the
// candidate at that moment. The result is a replayable `trace.json` — the timeline the sandbox scrubs
// to show the decisions. Pure + deterministic; browser-loadable (no Node deps).

/** A recorder. `rec.log(type, label, data, rationale, snapshot)` appends one timeline event. */
export function recorder(meta = {}) {
  const events = [];
  return {
    meta,
    events,
    log(type, label, data = null, rationale = '', snapshot = null) {
      const e = { i: events.length, type, label, data, rationale, snapshot: snapshot ? clone(snapshot) : null };
      events.push(e); return e;
    },
    // a child recorder that prefixes a scope (e.g. a subtree id) onto each event — keeps the fractal nesting visible
    scope(scopeId) {
      const self = this;
      return { log: (t, l, d, r, s) => self.log(t, l, d, r ? `[${scopeId}] ${r}` : '', s) };
    },
    toJSON() { return { meta, events }; },
  };
}

/** Event type → a glyph + role, so the timeline can colour/label without hardcoding. */
export const EVENT_KINDS = {
  seed:     { glyph: '◦', role: 'start' },
  cut:      { glyph: '⊞', role: 'split' },     // a BSP partition (wall) — Strategy A
  contract: { glyph: '⛬', role: 'contract' },  // a door's pre/post + budget
  propose:  { glyph: '✎', role: 'propose' },   // a candidate leaf room
  mutate:   { glyph: '✦', role: 'edit' },       // an edit operator applied
  solve:    { glyph: '⚖', role: 'verdict' },    // a solver result
  accept:   { glyph: '✓', role: 'select' },
  reject:   { glyph: '✗', role: 'select' },
  chain:    { glyph: '⛓', role: 'compose' },    // rooms composed into a level
  done:     { glyph: '★', role: 'end' },
};

function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

export default { recorder, EVENT_KINDS };

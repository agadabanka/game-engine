// Build-event log + observability for the make-game pipeline.
//
// One append-only event stream per game is the single source of truth that drives:
//   • a checkmark STATUS REPORT (what's done / running / failed),
//   • a generated DIARY build-log section (so the diary records the run, with checks),
//   • GAME_META.stages flags (so a re-run can checkpoint / resume).
//
// This is the keystone the autonomous make-game runner (7.1) and the diary-as-artifact
// migration (7.2) both hang off. Pure Node, no deps. Contracts are JSDoc-typed and the
// module is covered by buildlog.test.mjs (`node --test tools/lib/buildlog.test.mjs`).
import fs from 'node:fs';
import path from 'node:path';

/** Canonical pipeline stages, in order (book is optional, appended by callers). */
export const STAGES = ['scaffold', 'identity', 'levels', 'gate', 'feel', 'art', 'music', 'deploy', 'videos', 'shorts', 'loop'];

const LABEL = {
  scaffold: 'Scaffold', identity: 'Identity', levels: 'Levels', gate: 'Gate (eval)', feel: 'Feel',
  art: 'Art', music: 'Music', deploy: 'Deploy', videos: 'Videos', shorts: 'Shorts', loop: 'Loop', book: 'Book',
};
// status → glyph (used in console, status report, and the diary so checks render anywhere)
const GLYPH = { ok: '✓', fail: '✗', run: '⏳', retry: '↻', skip: '–', pending: '○' };

/** @typedef {'start'|'ok'|'fail'|'retry'|'skip'} EventStatus */
/** @typedef {{ stage:string, status:EventStatus, ts:number, ms?:number, detail?:string, error?:string }} BuildEvent */
/** @typedef {'ok'|'fail'|'run'|'skip'|'pending'} StageStatus */

/**
 * @param {{ game:string, dir:string, stages?:string[], quiet?:boolean }} opt
 *   game  — id/name for log lines · dir — game root (events go in `<dir>/out`) ·
 *   stages — stage order (defaults to STAGES) · quiet — suppress console lines.
 * @returns build-log handle: { stage, events, statusMap, report, toDiaryEntry, updateMeta }
 */
export function createBuildLog({ game, dir, stages = STAGES, quiet = false }) {
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const ndjson = path.join(outDir, 'build-events.ndjson');
  const statusJson = path.join(outDir, 'build-status.json');

  /** @type {BuildEvent[]} */
  const events = fs.existsSync(ndjson)
    ? fs.readFileSync(ndjson, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  /** @type {Record<string, number>} */
  const starts = {}; // stage → start ts, for durations

  function log(ev) {
    if (quiet) return;
    const g = GLYPH[ev.status === 'start' ? 'run' : ev.status] || GLYPH.run;
    const t = ev.ms != null ? ` (${(ev.ms / 1000).toFixed(1)}s)` : '';
    const x = ev.error ? ` — ERROR: ${ev.error}` : ev.detail ? ` — ${ev.detail}` : '';
    console.log(`[${game}] ${g} ${LABEL[ev.stage] || ev.stage}${x}${t}`);
  }
  function emit(ev) { events.push(ev); fs.appendFileSync(ndjson, JSON.stringify(ev) + '\n'); writeStatus(); log(ev); return ev; }

  /** A live handle for one stage. Chainable: `bl.stage('art').start(); …; .ok('3 worlds')`. */
  function stage(name) {
    return {
      /** @param {string} [detail] */ start(detail) { starts[name] = Date.now(); emit({ stage: name, status: 'start', ts: starts[name], detail }); return this; },
      /** @param {string} [detail] */ ok(detail) { emit({ stage: name, status: 'ok', ts: Date.now(), ms: Date.now() - (starts[name] || Date.now()), detail }); return this; },
      /** @param {Error|string} err */ fail(err) { emit({ stage: name, status: 'fail', ts: Date.now(), ms: Date.now() - (starts[name] || Date.now()), error: String((err && err.message) || err) }); return this; },
      /** @param {number} n attempt number */ retry(n) { emit({ stage: name, status: 'retry', ts: Date.now(), detail: `attempt ${n}` }); return this; },
      /** @param {string} [reason] */ skip(reason) { emit({ stage: name, status: 'skip', ts: Date.now(), detail: reason || 'skipped' }); return this; },
    };
  }

  /** Latest resolved status per stage. @returns {Record<string, StageStatus>} */
  function statusMap() {
    /** @type {Record<string, StageStatus>} */
    const m = {};
    for (const s of stages) m[s] = 'pending';
    for (const ev of events) {
      if (ev.status === 'start' || ev.status === 'retry') { if (m[ev.stage] !== 'ok' && m[ev.stage] !== 'skip') m[ev.stage] = 'run'; }
      else if (ev.status === 'ok') m[ev.stage] = 'ok';
      else if (ev.status === 'fail') m[ev.stage] = 'fail';
      else if (ev.status === 'skip') m[ev.stage] = 'skip';
    }
    return m;
  }

  function writeStatus() {
    const m = statusMap();
    const done = stages.filter((s) => m[s] === 'ok' || m[s] === 'skip').length;
    fs.writeFileSync(statusJson, JSON.stringify({ game, updated: new Date().toISOString(), done, total: stages.length, stages: m }, null, 2) + '\n');
  }

  /** Multi-line checkmark status report (the "very organized" view). */
  function report() {
    const m = statusMap();
    const done = stages.filter((s) => m[s] === 'ok' || m[s] === 'skip').length;
    const lines = [`Build · ${game}  [${done}/${stages.length}]`];
    for (const s of stages) lines.push(`  ${GLYPH[m[s]] || GLYPH.pending} ${LABEL[s] || s}`);
    return lines.join('\n');
  }

  /** Generated diary section (a `### Build log …` entry) — checks + timings per stage. */
  function toDiaryEntry(dateStr) {
    const m = statusMap();
    const done = stages.filter((s) => m[s] === 'ok' || m[s] === 'skip').length;
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const lines = [`### Build log — ${date} (${done}/${stages.length} stages)`, ''];
    for (const s of stages) {
      const evs = events.filter((e) => e.stage === s);
      const last = evs[evs.length - 1];
      const ms = evs.reduce((a, e) => a + (e.ms || 0), 0);
      const retries = evs.filter((e) => e.status === 'retry').length;
      const note = [last && last.detail, last && last.error && `failed: ${last.error}`, retries && `${retries} retr${retries === 1 ? 'y' : 'ies'}`].filter(Boolean).join('; ');
      lines.push(`- ${GLYPH[m[s]] || GLYPH.pending} **${LABEL[s] || s}**${note ? ` — ${note}` : ''}${ms ? ` _(${(ms / 1000).toFixed(1)}s)_` : ''}`);
    }
    return lines.join('\n') + '\n';
  }

  /** Reflect stage status into GAME_META.json so a re-run can checkpoint/resume. */
  function updateMeta(metaPath) {
    if (!fs.existsSync(metaPath)) return;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const m = statusMap();
    meta.stages = meta.stages || {};
    const map = { ok: 'done', skip: 'skip', fail: 'fail', run: 'wip' };
    for (const s of stages) if (m[s] !== 'pending') meta.stages[s] = map[m[s]];
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  }

  return { stage, events, statusMap, report, toDiaryEntry, updateMeta, writeStatus, GLYPH, LABEL };
}

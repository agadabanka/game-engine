// ── ONLINE MODE · the games evolve while people play ─────────────────────────
// The hub-side agent worker behind /api/online/*. It runs, in the cloud, the
// same loop we run offline with the fix-notes skill:
//
//   take the game's open `in-game-note` issues off the queue
//     → clone the game repo into a scratch dir
//     → run a Claude agent (Claude Agent SDK: Bash/Read/Write/Edit/Glob/Grep,
//       repo CLAUDE.md loaded) on a work branch to fix them
//     → merge the branch into the default branch and push
//     → Railway auto-deploys the game
//     → ✅-comment + close each fixed issue (that comment IS the game's diary
//       ledger entry — fixlogRefresh() renders it on the next boot)
//
// Games surface the whole thing to the player via the update-shell (vendored
// SDK): the /api/online/status feed drives "🤖 fixing: <note>" toasts, and the
// game's own /api/version drives the "🚀 update ready — tap to reload" pill, so
// a Railway redeploy never yanks the page mid-jump.
//
// Ops model: one job at a time (a serial queue — agents are expensive and two
// agents on one repo race each other), jobs survive in the volume store as
// history, and every step is visible in the status feed. Config via env:
//   ANTHROPIC_API_KEY  — required; without it online mode reports disabled.
//   GH_TOKEN           — required; clone/push + issues (same token the hub uses).
//   ONLINE_MODEL       — agent model (default claude-opus-4-8).
//   ONLINE_MAX_ISSUES  — notes per run (default 5; oldest first).
//   ONLINE_MAX_TURNS   — agent turn cap (default 150).
//   ONLINE_TIMEOUT_MS  — hard wall for the agent step (default 25 min).
//   ONLINE_LABELS      — issue labels treated as notes (default
//                        "in-game-note,note,playtest-note").
//   ONLINE_GATE        — "1" to run `node eval.mjs --no-cache` before merging
//                        (needs a browser in the hub image; off by default —
//                        the ✅ comment then says the gate ran offline-style CI).
//   ONLINE_AUTO        — "*" or comma-separated game ids: poll for open notes
//                        and self-enqueue (default off → runs are API-triggered).
//   ONLINE_POLL_MS     — auto-mode poll interval (default 5 min).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import * as store from './store.js';

const GH_TOKEN = process.env.GH_TOKEN || '';
const MODEL = process.env.ONLINE_MODEL || 'claude-opus-4-8';
const MAX_ISSUES = Number(process.env.ONLINE_MAX_ISSUES || 5);
const MAX_TURNS = Number(process.env.ONLINE_MAX_TURNS || 150);
const TIMEOUT_MS = Number(process.env.ONLINE_TIMEOUT_MS || 25 * 60_000);
const LABELS = String(process.env.ONLINE_LABELS || 'in-game-note,note,playtest-note').split(',').map((s) => s.trim()).filter(Boolean);
const GATE = process.env.ONLINE_GATE === '1';
const AUTO = String(process.env.ONLINE_AUTO || '').trim();
const POLL_MS = Number(process.env.ONLINE_POLL_MS || 5 * 60_000);
const HISTORY_KEY = 'online:jobs';
const HISTORY_MAX = 30;

// the agent SDK is a real dependency but online mode must degrade gracefully on
// a deploy that hasn't installed it (or has no key) — the hub's other jobs keep
// working and /api/online/status says why runs are unavailable.
let _query = null, _sdkErr = null;
async function loadSdk() {
  if (_query || _sdkErr) return _query;
  try { ({ query: _query } = await import('@anthropic-ai/claude-agent-sdk')); }
  catch (e) { _sdkErr = String(e && e.message || e); }
  return _query;
}

import { spawnSync } from 'node:child_process';
let _git = null;
function hasGit() {
  if (_git === null) { try { _git = spawnSync('git', ['--version']).status === 0; } catch { _git = false; } }
  return _git;
}

// ── state ──
const state = {
  queue: [],        // jobs waiting
  active: null,     // job running now
  jobs: [],         // finished jobs, newest first (also persisted)
  running: false,   // runner loop busy
};
let _getGames = async () => [];
// auto mode is a RUNTIME setting (the dashboard's on/off switch), persisted in
// the store; the ONLINE_AUTO env var only seeds the default on first boot.
// '' = off · '*' = every game with a repo · 'a,b' = just those game ids.
let _auto = '';
export function getAuto() { return _auto; }
export async function setAuto(v) {
  _auto = typeof v === 'string' ? v.trim() : '';
  try { await store.set('online:auto', _auto); } catch (e) { console.error('[online] persist auto', e.message); }
  return _auto;
}
// per-game live mode (the in-game switch): membership in the auto set.
export function isLive(gameId) { return _auto === '*' || _auto.split(',').map((s) => s.trim()).includes(gameId); }
export async function setLive(gameId, on) {
  if (_auto === '*') return _auto;                     // global auto covers everything; per-game off is a no-op
  const set = new Set(_auto.split(',').map((s) => s.trim()).filter(Boolean));
  on ? set.add(gameId) : set.delete(gameId);
  return setAuto([...set].join(','));
}

export function reasons() {
  const out = [];
  if (!process.env.ANTHROPIC_API_KEY) out.push('ANTHROPIC_API_KEY not set');
  if (!GH_TOKEN) out.push('GH_TOKEN not set');
  if (_sdkErr) out.push('agent sdk failed to load: ' + _sdkErr);
  if (!hasGit()) out.push('git not available in this image');
  return out;
}
export function enabled() { return reasons().length === 0; }

// ── github helpers (same raw-fetch style the game servers use) ──
const GH = 'https://api.github.com';
const H = () => ({ Authorization: 'token ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'game-engine-online', 'Content-Type': 'application/json' });
async function gh(pathname, init) {
  const r = await fetch(GH + pathname, { headers: H(), ...init });
  if (!r.ok) throw new Error('github ' + r.status + ' ' + pathname + ': ' + (await r.text().catch(() => '')).slice(0, 200));
  return r.json();
}

// Open note issues across all configured labels (labels param is AND on the
// API, so one request per label, deduped by number, oldest first).
export async function openNotes(repo) {
  const byN = new Map();
  for (const label of LABELS) {
    let list = [];
    try { list = await gh(`/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50&sort=created&direction=asc`); } catch { continue; }
    for (const is of Array.isArray(list) ? list : []) {
      if (is.pull_request || !is.number) continue;
      byN.set(is.number, { number: is.number, title: is.title || '', body: is.body || '', url: is.html_url, created_at: is.created_at });
    }
  }
  return [...byN.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// ── shell helper with timeout ──
function sh(cmd, args, { cwd, timeoutMs = 120_000, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, env: env || process.env, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args[0]} failed: ${String(stderr || err.message).slice(0, 300)}`));
      else resolve(String(stdout));
    });
  });
}
const cloneUrl = (repo) => `https://x-access-token:${GH_TOKEN}@github.com/${repo}.git`;

async function pushWithRetry(cwd, repo, refspec) {
  let wait = 2000;
  for (let i = 0; ; i++) {
    try { return await sh('git', ['push', cloneUrl(repo), refspec], { cwd, timeoutMs: 120_000 }); }
    catch (e) {
      if (i >= 3) throw e;
      await new Promise((r) => setTimeout(r, wait)); wait *= 2;
    }
  }
}

// ── the agent prompt: the fix-notes loop, condensed for a headless run ──
function agentPrompt(job) {
  const list = job.issues.map((i) => `- #${i.n} — ${i.title}\n${String(i.body || '').split('\n').map((l) => '  > ' + l).join('\n')}`).join('\n\n');
  return `You are the ONLINE fix agent for this game repo. The owner left these in-game notes (GitHub issues). Fix them, in this working copy, exactly the way the offline fix-notes loop would.

OPEN NOTES TO FIX:
${list}

RULES (non-negotiable):
- Read the repo's CLAUDE.md and DIARY.md learnings first; respect the golden rules (visual/feel work never touches physics bodies or snapshot fields; human-only niceties gate to !auto; deterministic only — no RNG or Date.now in gameplay).
- Voice notes ("🎙️") are speech-to-text and often garbled — read adjacent notes together; level/timestamp hints say WHERE the owner was.
- Group related notes into one coherent change. Reproduce/locate before changing code.
- Commit each coherent fix on THIS branch with message "fix(#<n>[,#<m>]): <summary>". Do NOT push. Do NOT switch branches. Do NOT close or comment on GitHub issues (the pipeline does that).
- If a note is not actionable from code (pure opinion, needs the owner, or you cannot reproduce), skip it honestly rather than guessing wildly.
- If DIARY.md exists and the batch is significant, add a short narrative entry in the same style as existing entries, in the same commit as the fix.

WHEN DONE — REQUIRED: write a file named online-report.json at the repo root (do NOT commit it):
{
  "issues": [
    { "number": <n>, "fixed": true|false,
      "comment": "✅-style closing comment: owner's words → root cause → what shipped → caveats. First sentence must stand alone (it becomes the in-game diary ledger line). For skipped notes: fixed=false and a one-line reason." }
  ]
}`;
}

async function runAgent(job, cwd) {
  const query = await loadSdk();
  if (!query) throw new Error('agent sdk unavailable: ' + _sdkErr);
  const env = { ...process.env };
  delete env.GH_TOKEN; delete env.NOTES_GH_TOKEN; delete env.ADMIN_TOKEN;   // the agent edits code; it never talks to GitHub or pushes
  const abort = new AbortController();
  const watchdog = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let result = null;
  try {
    for await (const msg of query({
      prompt: agentPrompt(job),
      options: {
        cwd,
        model: MODEL,
        maxTurns: MAX_TURNS,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
        settingSources: ['project'],   // load the game repo's CLAUDE.md — same context the offline loop gets
        env,
        abortController: abort,
      },
    })) {
      if (msg.type === 'result') { result = msg; break; }
    }
  } finally { clearTimeout(watchdog); }
  if (!result) throw new Error('agent ended without a result' + (abort.signal.aborted ? ' (timed out)' : ''));
  if (result.subtype !== 'success') throw new Error('agent run failed: ' + result.subtype);
  job.costUsd = Number(result.total_cost_usd || 0) || undefined;
  return result;
}

// ── the job pipeline ──
function setPhase(job, status, phase) { job.status = status; job.phase = phase; job.updatedAt = new Date().toISOString(); }

async function persistHistory() {
  try { await store.set(HISTORY_KEY, state.jobs.slice(0, HISTORY_MAX)); } catch (e) { console.error('[online] persist history', e.message); }
}

async function runJob(job) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'online-'));
  const cwd = path.join(dir, 'repo');
  try {
    setPhase(job, 'running', 'clone');
    await sh('git', ['clone', '--depth', '80', cloneUrl(job.repo), cwd], { timeoutMs: 300_000 });
    const base = (await sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })).trim();  // default branch
    const baseSha = (await sh('git', ['rev-parse', 'HEAD'], { cwd })).trim();
    const branch = `online/${job.id}`;
    await sh('git', ['checkout', '-b', branch], { cwd });
    await sh('git', ['config', 'user.name', 'online-agent'], { cwd });
    await sh('git', ['config', 'user.email', 'noreply@anthropic.com'], { cwd });

    setPhase(job, 'running', 'agent');
    job.issues.forEach((i) => { i.state = 'fixing'; });
    await runAgent(job, cwd);

    // what did the agent actually do?
    const commits = Number((await sh('git', ['rev-list', '--count', `${baseSha}..HEAD`], { cwd })).trim() || '0');
    let report = { issues: [] };
    try { report = JSON.parse(fs.readFileSync(path.join(cwd, 'online-report.json'), 'utf8')); } catch {}
    const byN = new Map((report.issues || []).map((r) => [Number(r.number), r]));
    if (!commits) throw new Error('agent made no commits — nothing to ship');

    if (GATE && fs.existsSync(path.join(cwd, 'eval.mjs'))) {
      setPhase(job, 'running', 'gate');
      await sh('node', ['eval.mjs', '--no-cache'], { cwd, timeoutMs: 20 * 60_000 });
    }

    setPhase(job, 'merging', 'merge');
    const fixed = job.issues.filter((i) => byN.get(i.n)?.fixed !== false);
    await sh('git', ['checkout', base], { cwd });
    await sh('git', ['merge', '--no-ff', branch, '-m',
      `online: fix in-game notes ${fixed.map((i) => '#' + i.n).join(' ')}\n\nAuto-fixed by the engine's online agent; merged and deployed live.`], { cwd });
    const mergeSha = (await sh('git', ['rev-parse', '--short', 'HEAD'], { cwd })).trim();
    setPhase(job, 'merging', 'push');
    await pushWithRetry(cwd, job.repo, `${base}:${base}`);
    job.mergeSha = mergeSha;

    // close the loop on GitHub — the ✅ comment feeds the game's diary ledger
    setPhase(job, 'merging', 'close');
    for (const i of job.issues) {
      const r = byN.get(i.n);
      if (r && r.fixed === false) { i.state = 'skipped'; i.note = String(r.comment || '').slice(0, 200); continue; }
      const comment = (r && r.comment ? String(r.comment) : `✅ Fixed and deployed.`)
        + `\n\n_(${mergeSha} — fixed live by the engine's online agent${GATE ? ', gate run before merge' : '; CI/gate verifies post-merge'}.)_`;
      try {
        await gh(`/repos/${job.repo}/issues/${i.n}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) });
        await gh(`/repos/${job.repo}/issues/${i.n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
        i.state = 'fixed';
      } catch (e) { i.state = 'fixed-unclosed'; i.note = String(e.message).slice(0, 200); }
    }
    setPhase(job, 'deployed', 'done');
    job.finishedAt = new Date().toISOString();
  } catch (e) {
    job.error = String(e && e.message || e).slice(0, 400);
    job.issues.forEach((i) => { if (i.state === 'fixing') i.state = 'queued'; });
    setPhase(job, 'failed', 'failed');
    job.finishedAt = new Date().toISOString();
    console.error('[online] job', job.id, 'failed:', job.error);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

async function pump() {
  if (state.running) return;
  state.running = true;
  try {
    while (state.queue.length) {
      const job = state.queue.shift();
      state.active = job;
      await runJob(job);
      state.active = null;
      state.jobs.unshift(job);
      state.jobs = state.jobs.slice(0, HISTORY_MAX);
      await persistHistory();
    }
  } finally { state.running = false; state.active = null; }
}

// ── public API ──
export async function enqueue(gameId) {
  const games = await _getGames();
  const game = games.find((g) => g.id === gameId);
  if (!game) return { ok: false, error: 'unknown-game' };
  if (!game.repo) return { ok: false, error: 'game-has-no-repo' };
  const bad = reasons();
  if (bad.length) return { ok: false, error: 'online-mode-disabled', reasons: bad };
  if ((state.active && state.active.game === gameId) || state.queue.some((j) => j.game === gameId)) {
    return { ok: false, error: 'already-queued' };
  }
  const notes = (await openNotes(game.repo)).slice(0, MAX_ISSUES);
  if (!notes.length) return { ok: false, error: 'no-open-notes' };
  const job = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    game: gameId, repo: game.repo,
    status: 'queued', phase: 'queued',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    issues: notes.map((n) => ({ n: n.number, title: n.title, body: n.body.slice(0, 4000), url: n.url, state: 'queued' })),
  };
  state.queue.push(job);
  pump().catch((e) => console.error('[online] pump', e));
  return { ok: true, job: publicJob(job) };
}

// strip issue bodies from what we serve — titles are enough for the toasts and
// bodies can be large / owner-private-ish.
function publicJob(j) {
  if (!j) return null;
  return {
    id: j.id, game: j.game, repo: j.repo, status: j.status, phase: j.phase,
    createdAt: j.createdAt, updatedAt: j.updatedAt, finishedAt: j.finishedAt || null,
    mergeSha: j.mergeSha || null, error: j.error || null, costUsd: j.costUsd,
    issues: (j.issues || []).map((i) => ({ n: i.n, title: i.title, url: i.url, state: i.state })),
  };
}

export function status(gameId) {
  const filt = (arr) => gameId ? arr.filter((j) => j.game === gameId) : arr;
  return {
    enabled: enabled(),
    reasons: enabled() ? undefined : reasons(),
    model: MODEL,
    auto: _auto,
    live: gameId ? isLive(gameId) : undefined,   // the in-game switch state for ?game= polls
    active: (!gameId || (state.active && state.active.game === gameId)) ? publicJob(state.active) : null,
    queue: filt(state.queue).map(publicJob),
    jobs: filt(state.jobs).slice(0, 12).map(publicJob),
  };
}

export async function init({ getGames }) {
  _getGames = getGames;
  try { state.jobs = (await store.get(HISTORY_KEY, [])) || []; } catch {}
  try {
    const saved = await store.get('online:auto', null);
    _auto = saved !== null ? String(saved) : AUTO;   // env seeds the default; the switch owns it after that
  } catch { _auto = AUTO; }
  hasGit();
  // the auto poller always runs; whether it *acts* is the runtime switch (_auto)
  const tick = async () => {
    if (!_auto || !enabled() || state.active || state.queue.length) return;
    try {
      const games = (await _getGames()).filter((g) => g.repo && (_auto === '*' || _auto.split(',').map((s) => s.trim()).includes(g.id)));
      for (const g of games) {
        const r = await enqueue(g.id);
        if (r.ok) { console.log('[online] auto-enqueued', g.id); break; }   // one at a time
      }
    } catch (e) { console.error('[online] auto poll', e.message); }
  };
  setInterval(tick, POLL_MS);
  setTimeout(tick, 30_000);
  console.log('[online] ready —', enabled() ? 'enabled' : 'disabled (' + reasons().join('; ') + ')', '· auto:', _auto || 'off');
}

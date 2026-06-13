// ── AGGREGATION ──────────────────────────────────────────────────────────────
// Pull a live snapshot of one game from its deployed endpoints (and, as a
// fallback, from its GitHub repo). Every game built on this engine exposes the
// same surface, so the hub can monitor them all with one shape:
//   GET /api/config   → { model, ... }              (always present)
//   GET /api/meta     → rich game meta              (engine games; optional)
//   GET /api/notes    → { notes: [...] }            (live playtest feedback)
//   GET /api/diary    → DIARY.md (markdown)         (the build log)
// If a game has no live URL yet (registered but not deployed), we still pull
// DIARY.md + GAME_META.json straight from GitHub raw so the board is never empty.
import { STAGES, PHASES, resolveStages } from './stages.js';

const TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 6000);

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}
async function fetchText(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}

// Split a DIARY.md into entries on the "### " headings (the engine's diary convention).
export function parseDiary(md) {
  if (!md) return [];
  const parts = md.split(/\n(?=### )/g).filter((s) => s.trim().startsWith('### '));
  return parts.map((p) => {
    const nl = p.indexOf('\n');
    const title = p.slice(4, nl > 0 ? nl : undefined).trim();
    const body = nl > 0 ? p.slice(nl + 1).trim() : '';
    return { title, body, bullets: (body.match(/^[-*] /gm) || []).length };
  });
}

// Pull DIARY.md from GitHub raw when there's no live deploy (tries main then master).
async function diaryFromGitHub(repo, token) {
  const headers = token ? { Authorization: `token ${token}` } : {};
  for (const branch of ['main', 'master']) {
    const md = await fetchText(`https://raw.githubusercontent.com/${repo}/${branch}/DIARY.md`, headers);
    if (md) return md;
  }
  return null;
}

// The `playtest-note` issues in a game's repo — the OTHER half of the user's flow
// (in-game note → GitHub issue → Claude fixes it). We pull both states so the hub
// can (a) mark a note resolved when its issue closes, (b) deep-link each note to
// its issue, and (c) count the open/closed loop per game.
async function playtestIssues(repo, token) {
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `token ${token}` } : {}) };
  const byNote = new Map();   // note-id → { number, url, state, title }
  let open = 0, closed = 0;
  const raw = await fetchText(`https://api.github.com/repos/${repo}/issues?state=all&labels=playtest-note&per_page=100`, headers);
  if (raw) {
    try {
      for (const iss of JSON.parse(raw)) {
        if (iss.pull_request) continue;               // issues only
        if (iss.state === 'closed') closed++; else open++;
        const m = /note-id:\s*([a-z0-9-]+)/i.exec(iss.body || '');
        if (m) byNote.set(m[1], { number: iss.number, url: iss.html_url, state: iss.state, title: iss.title });
      }
    } catch {}
  }
  return { byNote, open, closed };
}

// meta.videos is { "<clip-key>": "https://youtu.be/<id>" } — normalize to a gallery
// the client can render directly (thumbnail + title + watch link), montage last.
function normalizeVideos(meta) {
  const v = meta && meta.videos;
  if (!v || typeof v !== 'object') return [];
  const idOf = (u) => { const m = /(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/.exec(String(u)); return m ? m[1] : null; };
  const titleOf = (raw) => {
    const k = String(raw).replace(/\.[a-z0-9]+$/i, '');   // drop any file extension
    if (/montage/i.test(k)) return 'Montage';
    const m = /(?:level|glade|veil|world|ground|fathom)-?(\d+)-?(.*)$/i.exec(k);
    if (m) return 'L' + m[1] + (m[2] ? ' · ' + m[2].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() : '');
    return k.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };
  return Object.entries(v)
    .map(([key, url]) => { const id = idOf(url); return id ? { key, url, id, title: titleOf(key), thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, montage: /montage/i.test(key) } : null; })
    .filter(Boolean)
    .sort((a, b) => (a.montage ? 1 : 0) - (b.montage ? 1 : 0) || a.key.localeCompare(b.key));
}

// Build one game's live snapshot. `game` = { id, name, repo, url, tagline }.
export async function snapshotGame(game, { ghToken } = {}) {
  const base = (game.url || '').replace(/\/$/, '');
  const out = {
    id: game.id, name: game.name, repo: game.repo || null, url: base || null,
    tagline: game.tagline || null, created_at: game.created_at || null,
    hero: game.hero || null, verb: game.verb || null,
    ok: false, live: false, meta: null, config: null,
    notes: { total: 0, open: 0, recent: [] }, diary: { count: 0, latest: null, source: null },
    issues: { open: 0, closed: 0, url: game.repo ? `https://github.com/${game.repo}/issues?q=label%3Aplaytest-note` : null },
    videos: [], playlist: null, screenshots: Array.isArray(game.screenshots) ? game.screenshots : [],
    fetchedAt: new Date().toISOString(), error: null,
  };

  // live deploy first
  if (base) {
    const [config, meta, notesResp, diaryMd] = await Promise.all([
      fetchJSON(`${base}/api/config`),
      fetchJSON(`${base}/api/meta`),
      fetchJSON(`${base}/api/notes`),
      fetchText(`${base}/api/diary`),
    ]);
    out.live = Boolean(config || meta || notesResp || diaryMd);
    out.config = config;
    out.meta = meta;
    if (notesResp?.notes) {
      // A note is "resolved" if its in-game status is closed OR the GitHub issue
      // carrying its note-id is now closed — so fixed notes stop showing as open
      // here, and each note can deep-link to the issue it became (the loop, visible).
      const iss = game.repo ? await playtestIssues(game.repo, ghToken) : { byNote: new Map(), open: 0, closed: 0 };
      out.issues = { open: iss.open, closed: iss.closed, url: game.repo ? `https://github.com/${game.repo}/issues?q=label%3Aplaytest-note` : null };
      const notes = notesResp.notes.map((n) => {
        const link = iss.byNote.get(n.id);
        return { ...n, status: (n.status === 'closed' || link?.state === 'closed') ? 'closed' : (n.status || 'open'), issue: link || null };
      });
      out.notes.total = notes.length;
      out.notes.open = notes.filter((n) => n.status === 'open').length;
      out.notes.recent = notes.slice(-8).reverse().map((n) => ({
        id: n.id, text: n.text, kind: n.kind, level: n.level, status: n.status,
        created_at: n.created_at, game: game.name,
        issueUrl: n.issue?.url || null, issueNumber: n.issue?.number || null,
      }));
    } else if (game.repo) {
      // no live notes endpoint, but the repo may still carry the issue loop
      const iss = await playtestIssues(game.repo, ghToken);
      out.issues = { open: iss.open, closed: iss.closed, url: `https://github.com/${game.repo}/issues?q=label%3Aplaytest-note` };
    }
    if (diaryMd) { const e = parseDiary(diaryMd); out.diary = { count: e.length, latest: e[e.length - 1] || null, entries: e.slice(-6).reverse(), source: 'live' }; }
  }

  // diary fallback from GitHub (so a not-yet-deployed game still shows its log)
  if (!out.diary.count && game.repo) {
    const md = await diaryFromGitHub(game.repo, ghToken);
    if (md) { const e = parseDiary(md); out.diary = { count: e.length, latest: e[e.length - 1] || null, entries: e.slice(-6).reverse(), source: 'github' }; }
  }
  // meta fallback from GitHub: every engine game commits GAME_META.json, so the
  // hub shows rich per-game meta (hero/verb/worlds/levels/diff) even pre-deploy.
  if (!out.meta && game.repo) {
    const headers = ghToken ? { Authorization: `token ${ghToken}` } : {};
    for (const branch of ['main', 'master']) {
      const raw = await fetchText(`https://raw.githubusercontent.com/${game.repo}/${branch}/GAME_META.json`, headers);
      if (raw) { try { out.meta = JSON.parse(raw); } catch {} break; }
    }
  }
  // last fallback: inline meta on the registry entry (lets the hub show a rich
  // card for a game whose repo doesn't carry GAME_META.json yet).
  if (!out.meta && game.meta) out.meta = game.meta;

  // Fill gaps from the curated registry meta WITHOUT overriding live truth: the
  // resolved meta (live → GitHub) wins per-key, but the hand-curated games.json
  // entry backfills stages/videos a game's own deploy doesn't self-report (older
  // games like deepfin serve no /api/meta, so their sparse repo meta loses detail).
  if (game.meta && out.meta && out.meta !== game.meta) {
    if (game.meta.stages) out.meta.stages = { ...game.meta.stages, ...(out.meta.stages || {}) };
    if (game.meta.videos && !out.meta.videos) out.meta.videos = game.meta.videos;
    if (game.meta.playlist && !out.meta.playlist) out.meta.playlist = game.meta.playlist;
  }

  out.videos = normalizeVideos(out.meta);   // the uploaded AI-playthrough gallery
  // a single "watch" link: the game's own meta.playlist if it has a real YouTube
  // playlist, else the montage video (the watch-it-all-in-one), else the first
  // clip. NOTE: never synthesize youtube.com/watch_videos — that endpoint was
  // retired and now 302s to a bot-check page (the old fallback shipped a dead link).
  const montageVid = out.videos.find((v) => v.montage);
  out.playlist = (out.meta && out.meta.playlist)
    || (montageVid && montageVid.url)
    || (out.videos[0] && out.videos[0].url)
    || null;
  // true only for a real multi-video YouTube playlist (drives the "Watch all" label)
  out.hasPlaylist = Boolean(out.meta && out.meta.playlist && /[?&]list=/.test(out.meta.playlist));
  out.ok = out.live || out.diary.count > 0;
  if (!out.ok) out.error = base ? 'no response from deploy' : 'no deploy url and no DIARY.md on GitHub';
  out.pipeline = resolveStages(out);   // where this game is in the dev pipeline
  return out;
}

// A safe placeholder so one malformed registry entry (or a snapshotGame that
// throws before the per-fetch timeout applies) can never reject the whole pull.
function errorSnapshot(game, err) {
  return {
    id: game?.id || 'unknown', name: game?.name || game?.id || 'unknown',
    repo: game?.repo || null, url: (game?.url || '').replace(/\/$/, '') || null,
    tagline: game?.tagline || null, created_at: game?.created_at || null,
    hero: game?.hero || null, verb: game?.verb || null,
    ok: false, live: false, meta: game?.meta || null, config: null,
    notes: { total: 0, open: 0, recent: [] }, diary: { count: 0, latest: null, source: null },
    issues: { open: 0, closed: 0, url: game?.repo ? `https://github.com/${game.repo}/issues?q=label%3Aplaytest-note` : null },
    videos: [], playlist: null, screenshots: Array.isArray(game?.screenshots) ? game.screenshots : [],
    fetchedAt: new Date().toISOString(), error: String(err),
    pipeline: { statuses: {}, pct: 0, done: 0, total: 0, next: [] },
  };
}

// Snapshot every registered game (in parallel) + roll up totals.
export async function snapshotAll(games, opts = {}) {
  const list = Array.isArray(games) ? games : [];
  const settled = await Promise.allSettled(list.map((g) => snapshotGame(g, opts)));
  const snaps = settled.map((r, i) =>
    r.status === 'fulfilled' ? r.value : errorSnapshot(list[i], r.reason));
  const allNotes = snaps.flatMap((s) => s.notes.recent);
  allNotes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const totals = {
    games: snaps.length,
    live: snaps.filter((s) => s.live).length,
    openNotes: snaps.reduce((n, s) => n + s.notes.open, 0),
    totalNotes: snaps.reduce((n, s) => n + s.notes.total, 0),
    diaryEntries: snaps.reduce((n, s) => n + s.diary.count, 0),
    levels: snaps.reduce((n, s) => n + (s.meta?.levelCount || 0), 0),
    videos: snaps.reduce((n, s) => n + (s.videos?.length || 0), 0),
    avgProgress: snaps.length ? Math.round(snaps.reduce((n, s) => n + (s.pipeline?.pct || 0), 0) / snaps.length) : 0,
  };
  return { generated: new Date().toISOString(), totals, games: snaps, notesFeed: allNotes.slice(0, 24), stages: STAGES, phases: PHASES };
}

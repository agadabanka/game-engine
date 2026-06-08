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
import { STAGES, resolveStages } from './stages.js';

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

// note-ids carried by CLOSED `playtest-note` issues in a game's repo → resolved.
async function closedNoteIds(repo, token) {
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `token ${token}` } : {}) };
  const raw = await fetchText(`https://api.github.com/repos/${repo}/issues?state=closed&labels=playtest-note&per_page=100`, headers);
  const ids = new Set();
  if (raw) { try { for (const iss of JSON.parse(raw)) { const m = /note-id:\s*([a-z0-9-]+)/i.exec(iss.body || ''); if (m) ids.add(m[1]); } } catch {} }
  return ids;
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
      // A note is "resolved" if its in-game status is closed OR it was filed and
      // the GitHub issue carrying its note-id is now closed — so fixed notes stop
      // showing as open here, even though the game store doesn't track resolution.
      const closed = game.repo ? await closedNoteIds(game.repo, ghToken) : new Set();
      const notes = notesResp.notes.map((n) => ({
        ...n, status: (n.status === 'closed' || closed.has(n.id)) ? 'closed' : (n.status || 'open'),
      }));
      out.notes.total = notes.length;
      out.notes.open = notes.filter((n) => n.status === 'open').length;
      out.notes.recent = notes.slice(-8).reverse().map((n) => ({
        id: n.id, text: n.text, kind: n.kind, level: n.level, status: n.status,
        created_at: n.created_at, game: game.name,
      }));
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

  out.ok = out.live || out.diary.count > 0;
  if (!out.ok) out.error = base ? 'no response from deploy' : 'no deploy url and no DIARY.md on GitHub';
  out.pipeline = resolveStages(out);   // where this game is in the dev pipeline
  return out;
}

// Snapshot every registered game (in parallel) + roll up totals.
export async function snapshotAll(games, opts = {}) {
  const snaps = await Promise.all(games.map((g) => snapshotGame(g, opts)));
  const allNotes = snaps.flatMap((s) => s.notes.recent);
  allNotes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const totals = {
    games: snaps.length,
    live: snaps.filter((s) => s.live).length,
    openNotes: snaps.reduce((n, s) => n + s.notes.open, 0),
    totalNotes: snaps.reduce((n, s) => n + s.notes.total, 0),
    diaryEntries: snaps.reduce((n, s) => n + s.diary.count, 0),
    levels: snaps.reduce((n, s) => n + (s.meta?.levelCount || 0), 0),
    avgProgress: snaps.length ? Math.round(snaps.reduce((n, s) => n + (s.pipeline?.pct || 0), 0) / snaps.length) : 0,
  };
  return { generated: new Date().toISOString(), totals, games: snaps, notesFeed: allNotes.slice(0, 24), stages: STAGES };
}

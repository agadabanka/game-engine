// ── GAME-ENGINE HUB · mission control ────────────────────────────────────────
// One dashboard that monitors every game built on this engine: their live
// playtest NOTES, their build DIARIES, and per-game META (hero, verb, worlds,
// level count, controls, art, music, diff scores). Pull-model — it reads each
// game's standard /api/* surface (and GitHub for the diary fallback), so it
// works with existing games (the-platformer, Jazz) without changing them.
//
// Deployed on Railway; the registry persists on the volume-backed store.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import * as store from './lib/store.js';
import { snapshotAll } from './lib/aggregate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const GH_TOKEN = process.env.GH_TOKEN || '';
const CACHE_MS = Number(process.env.CACHE_MS || 60_000);   // re-pull at most this often
const authed = (req) => !ADMIN_TOKEN || req.get('x-admin-token') === ADMIN_TOKEN;

// ── registry (volume-backed, seeded from games.json) ──
// The store holds the live registry (dashboard edits, scaffolded games). The
// games.json seed is merged in on read so updates to seeded entries (e.g. newly
// added meta) propagate to an already-seeded deploy, while stored fields still win.
function readSeed() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'games.json'), 'utf8')); }
  catch { return []; }
}
async function getGames() {
  const seed = readSeed();
  const stored = await store.get('games', null);
  if (!stored) { await store.set('games', seed); return seed; }
  const byId = {};
  for (const g of seed) byId[g.id] = { ...g };
  // stored entry wins for live fields (url, dashboard edits); but the SEED's curated
  // meta wins when present, so games.json updates (e.g. new stages) propagate.
  for (const g of stored) byId[g.id] = { ...byId[g.id], ...g, meta: byId[g.id]?.meta || g.meta, url: byId[g.id]?.url || g.url };
  return Object.values(byId);
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── cached dashboard snapshot ──
// Invariant: /api/dashboard must ALWAYS return promptly with valid JSON and can
// never hang or 500. We do this by (a) serving the last snapshot from memory or
// disk immediately, (b) refreshing in the background, and (c) bounding the very
// first paint (when nothing is cached yet) so a slow/failing pull still resolves.
const FIRST_PAINT_MS = Number(process.env.FIRST_PAINT_MS || 8000);
let _cache = { at: 0, data: null, refreshing: null };

// A valid-but-empty dashboard so the client renders "0 games" instead of hanging
// on "loading…" if the very first refresh is slow or every fetch fails.
function emptySnapshot() {
  return {
    generated: new Date().toISOString(),
    totals: { games: 0, live: 0, openNotes: 0, totalNotes: 0, diaryEntries: 0, levels: 0, avgProgress: 0 },
    games: [], notesFeed: [], stages: [], warming: true,
  };
}

async function refresh() {
  // CRITICAL: always clear `refreshing` (success AND failure) so a failed pull
  // never poisons the cache and blocks every later request. Never throws.
  try {
    const games = await getGames();
    const data = await snapshotAll(games, { ghToken: GH_TOKEN });
    _cache = { at: Date.now(), data, refreshing: null };
    store.set('last_snapshot', data).catch((e) => console.error('persist snapshot failed', e));
    return data;
  } catch (e) {
    console.error('refresh failed', e);
    _cache.refreshing = null;   // allow a retry on the next request
    _cache.at = Date.now();     // back off so we don't hot-loop refreshes on failure
    return _cache.data;         // keep serving whatever we already had (may be null)
  }
}

// Kick off a background refresh if one isn't already running. Never awaited by
// the hot path once we have any cached data.
function refreshInBackground() {
  if (!_cache.refreshing) _cache.refreshing = refresh();
  return _cache.refreshing;
}

// Resolve a promise but give up after `ms`, returning `fallback` instead of hanging.
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); },
    );
  });
}

async function dashboard(force = false) {
  // Warm the in-memory cache from disk once (instant first paint after a restart).
  if (!_cache.data) {
    try { _cache.data = await store.get('last_snapshot', null); } catch (e) { console.error('store read failed', e); }
  }

  const fresh = _cache.data && Date.now() - _cache.at < CACHE_MS;
  if (force || !fresh) refreshInBackground();   // pull, but don't block on it if we can avoid it

  // We have something to show → return it immediately; the refresh runs behind us.
  if (_cache.data) return _cache.data;

  // Truly nothing cached yet (cold boot, empty volume) → wait for the first paint,
  // but only up to FIRST_PAINT_MS so a slow pull can never leave the client on
  // "loading…". If it's still not ready, hand back a valid empty board.
  const first = await withTimeout(refreshInBackground(), FIRST_PAINT_MS, null);
  return first || _cache.data || emptySnapshot();
}

// ── routes ──
app.get('/health', (_req, res) => res.json({ ok: true, service: 'game-engine-hub' }));

app.get('/api/dashboard', async (req, res) => {
  // Belt-and-suspenders: dashboard() is designed never to throw or hang, but if
  // anything slips through we still return a valid (empty) board, never a 500 or
  // a hang — the client must never be stuck on "loading…".
  try {
    const data = await withTimeout(dashboard(req.query.force === '1'), FIRST_PAINT_MS + 2000, null);
    res.json(data || _cache.data || emptySnapshot());
  } catch (e) {
    console.error('dashboard route failed', e);
    res.json(_cache.data || emptySnapshot());
  }
});
app.post('/api/refresh', async (_req, res) => {
  try { res.json(await refresh()); } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/games', async (_req, res) => res.json({ games: await getGames() }));

// ── short-video proxy ──
// GitHub Release / jsDelivr / raw URLs play inconsistently in cross-origin
// <video> (attachment disposition + signed redirects → MEDIA_ERR 4 / black).
// Proxy them SAME-ORIGIN here with proper video/mp4 + byte-range forwarding so
// the shorts feed plays + seeks reliably everywhere.
const VIDEO_HOSTS = /^https:\/\/(api\.github\.com|github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|raw\.githubusercontent\.com|media\.githubusercontent\.com|cdn\.jsdelivr\.net)\//;
// the set of mp4 URLs the registry actually references — the proxy only serves
// these, so the hub's token can't be used to pull arbitrary private content.
async function allowedSrcs() {
  const out = new Set();
  for (const g of await getGames()) for (const s of (g.shorts || [])) if (s.mp4) out.add(s.mp4);
  return out;
}
app.get('/v', async (req, res) => {
  const src = String(req.query.src || '');
  if (!VIDEO_HOSTS.test(src)) return res.status(400).end('bad src');
  if (!(await allowedSrcs()).has(src)) return res.status(403).end('not allowed');
  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    // private-repo release assets must be pulled via the API with auth + octet-stream
    if (src.startsWith('https://api.github.com/')) { headers.Authorization = `token ${GH_TOKEN}`; headers.Accept = 'application/octet-stream'; }
    const upstream = await fetch(src, { headers, redirect: 'follow' });
    if (!upstream.ok && upstream.status !== 206) return res.status(upstream.status).end();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    for (const h of ['content-range', 'content-length']) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); }
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res); else res.end();
  } catch (e) { console.error('video proxy', e); res.status(502).end('proxy error'); }
});

// register / update a game (used by the new-game scaffolder + the dashboard "add" form)
app.post('/api/games', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const { name, repo = null, url = null, tagline = null, hero = null, verb = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const games = await getGames();
  const id = req.body?.id || slug(name);
  const existing = games.find((g) => g.id === id);
  const entry = { id, name, repo, url, tagline, hero, verb, created_at: existing?.created_at || new Date().toISOString() };
  if (existing) Object.assign(existing, entry); else games.push(entry);
  await store.set('games', games);
  refresh().catch(() => {});   // pull the newcomer in the background
  res.json({ ok: true, id, count: games.length });
});

app.delete('/api/games/:id', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  let games = await getGames();
  games = games.filter((g) => g.id !== req.params.id);
  await store.set('games', games);
  res.json({ ok: true, count: games.length });
});

app.listen(PORT, () => {
  console.log(`game-engine hub on :${PORT}`);
  dashboard(true).catch(() => {});   // warm the cache on boot
});

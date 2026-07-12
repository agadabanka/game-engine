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
import os from 'node:os';
import { spawn } from 'node:child_process';
import * as store from './lib/store.js';
import { snapshotAll } from './lib/aggregate.js';
import { analyzeAll } from './lib/analytics.js';
import * as online from './lib/online.js';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '8mb' }));   // Studio IDE art notes can carry a small candidate image

// On the public brand domain (play.funstackstudios.com) the root serves the
// player-facing hub (public/play.html); on the Railway URL the root stays
// mission-control. So the brand domain only ever shows the player page.
const PLAY_HOST = process.env.PLAY_HOST || 'play.funstackstudios.com';
app.get('/', (req, res, next) => {
  if (req.hostname === PLAY_HOST) return res.sendFile(path.join(__dirname, 'public', 'play.html'));
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// pretty route for the Studio IDE (the static file also serves at /ide.html)
app.get('/ide', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'ide.html')));

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
  // fields win when present, so games.json updates (new stages, re-hosted shorts)
  // propagate even over an already-seeded store.
  for (const g of stored) byId[g.id] = { ...byId[g.id], ...g, meta: byId[g.id]?.meta || g.meta, url: byId[g.id]?.url || g.url, shorts: byId[g.id]?.shorts || g.shorts };
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

// ── flywheel funnel: first-party, ad-blocker-proof tracking ────────────────────
// /go/:slug    bio/Dub link → here → 302 to the game (UTM preserved). A plain
//              server-side redirect (no JS, no cookies) so ad-blockers can't strip
//              the click. Also fixes Dub's "malicious URL" block on *.up.railway.app
//              because the public link now points at the brand domain.
// /api/track   in-game events (play_started, level_complete) POSTed cross-origin.
// /api/funnel  first-party readout (clicks + events by game×source), our own
//              source of truth independent of Dub/PostHog.
const FUNNEL_KEY = 'funnel';
async function recordFunnel(kind, { game = 'unknown', source = 'direct', event = null } = {}) {
  // Atomic read-modify-write: funnel events fire concurrently with each other and
  // with the periodic refresh — a plain get→mutate→set loses increments AND was
  // what byte-corrupted the store. update() serializes the whole cycle.
  await store.update(FUNNEL_KEY, { clicks: {}, events: {}, recent: [], updated: null }, (f) => {
    f.clicks = f.clicks || {}; f.events = f.events || {}; f.recent = f.recent || [];
    if (kind === 'click') { const k = `${game}|${source}`; f.clicks[k] = (f.clicks[k] || 0) + 1; }
    else if (kind === 'event') { const k = `${game}|${event}|${source}`; f.events[k] = (f.events[k] || 0) + 1; }
    f.recent.unshift({ kind, game, source, event, ts: new Date().toISOString() });
    f.recent = f.recent.slice(0, 500);
    f.updated = new Date().toISOString();
    return f;
  });
}

app.get('/go/:slug', async (req, res) => {
  const g = (await getGames()).find((x) => x.id === req.params.slug);
  if (!g || !g.url) return res.status(404).send('unknown game');
  let dest;
  try { dest = new URL(g.url.replace(/\/+$/, '') + '/'); } catch { return res.status(500).send('bad game url'); }
  for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') dest.searchParams.set(k, v);
  recordFunnel('click', { game: g.id, source: String(req.query.utm_source || 'direct') }).catch((e) => console.error('funnel click', e));
  res.redirect(302, dest.toString());
});

app.options('/api/track', (_req, res) => res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }).end());
app.post('/api/track', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const { game = 'unknown', event = 'event', source = 'direct' } = req.body || {};
  recordFunnel('event', { game: String(game).slice(0, 60), event: String(event).slice(0, 60), source: String(source).slice(0, 60) }).catch((e) => console.error('funnel track', e));
  res.json({ ok: true });
});

app.get('/api/funnel', async (req, res) => {
  if (ADMIN_TOKEN && req.query.token !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  res.json(await store.get(FUNNEL_KEY, { clicks: {}, events: {}, recent: [], updated: null }));
});

// ── analytics (the "Analytics" modal) ──────────────────────────────────────────
// Per-game code/asset/cost breakdown. Heavier than the dashboard (one GitHub git-
// tree pull per repo) and changes slowly, so it gets its own longer-lived cache:
// serve the last snapshot immediately, refresh in the background, persist to the
// volume so a restart paints instantly. Force a fresh pull with ?force=1.
const ANALYTICS_CACHE_MS = Number(process.env.ANALYTICS_CACHE_MS || 600_000);   // 10 min
let _analytics = { at: 0, data: null, refreshing: null };
async function refreshAnalytics() {
  try {
    const data = await analyzeAll(await getGames(), { ghToken: GH_TOKEN });
    _analytics = { at: Date.now(), data, refreshing: null };
    store.set('last_analytics', data).catch((e) => console.error('persist analytics failed', e));
    return data;
  } catch (e) {
    console.error('analytics refresh failed', e);
    _analytics.refreshing = null; _analytics.at = Date.now();
    return _analytics.data;
  }
}
async function analytics(force = false) {
  if (!_analytics.data) { try { _analytics.data = await store.get('last_analytics', null); } catch {} }
  const fresh = _analytics.data && Date.now() - _analytics.at < ANALYTICS_CACHE_MS;
  if (force || !fresh) { if (!_analytics.refreshing) _analytics.refreshing = refreshAnalytics(); }
  if (_analytics.data && !force) return _analytics.data;
  // nothing cached yet (or a forced pull) → wait for the refresh, bounded so the
  // request can never hang; fall back to whatever we have.
  const first = await withTimeout(_analytics.refreshing || refreshAnalytics(), FIRST_PAINT_MS + 4000, null);
  return first || _analytics.data || { generated: new Date().toISOString(), totals: { games: 0, analyzed: 0 }, games: [], warming: true };
}
app.get('/api/analytics', async (req, res) => {
  try { res.json(await analytics(req.query.force === '1')); }
  catch (e) { console.error('analytics route failed', e); res.json(_analytics.data || { games: [], totals: { games: 0, analyzed: 0 }, error: String(e) }); }
});

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
  const { name, repo = null, url = null, tagline = null, hero = null, verb = null, shorts = null, shortsPlaylist = null, screenshots = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const games = await getGames();
  const id = req.body?.id || slug(name);
  const existing = games.find((g) => g.id === id);
  const entry = { id, name, repo, url, tagline, hero, verb, created_at: existing?.created_at || new Date().toISOString() };
  // optional shorts (vertical feed) — lets a game register its hosted shorts via the API/store,
  // so the mobile feed works WITHOUT a hub/games.json edit. Only overwrite when provided.
  if (Array.isArray(shorts)) entry.shorts = shorts;
  if (Array.isArray(screenshots)) entry.screenshots = screenshots;   // storefront thumbnails via the API (no games.json edit)
  if (shortsPlaylist) entry.shortsPlaylist = shortsPlaylist;
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

// ── ONLINE MODE · live in-game evolution ─────────────────────────────────────
// POST /api/online/:id/run   (admin) queue an agent run: fix the game's open
//                            in-game-note issues, merge to main, Railway deploys.
// GET  /api/online/status    what's running / recently ran. CORS-open — game
//                            clients poll it to show "🤖 fixing: <note>" toasts
//                            (the vendored update-shell.js does this).
// GET  /api/online/:id/queue the game's open note issues (what a run would take).
// Worker + config docs: hub/lib/online.js.
const onlineCors = (_req, res, next) => { res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); next(); };
app.options('/api/online/status', onlineCors, (_req, res) => res.end());
app.get('/api/online/status', onlineCors, (req, res) => {
  try { res.json(online.status(req.query.game ? String(req.query.game) : null)); }
  catch (e) { console.error('online status', e); res.json({ enabled: false, active: null, queue: [], jobs: [], error: String(e).slice(0, 200) }); }
});
app.get('/api/online/:id/queue', async (req, res) => {
  const game = (await getGames()).find((g) => g.id === req.params.id);
  if (!game || !game.repo) return res.status(404).json({ error: 'unknown-game-or-no-repo' });
  try { res.json({ game: game.id, notes: await online.openNotes(game.repo) }); }
  catch (e) { res.status(502).json({ error: String(e.message).slice(0, 200) }); }
});
app.post('/api/online/:id/run', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  try { res.json(await online.enqueue(req.params.id)); }
  catch (e) { console.error('online run', e); res.status(500).json({ ok: false, error: String(e.message).slice(0, 300) }); }
});

// ── Studio IDE ───────────────────────────────────────────────────────────────
// The IDE composes a high-fidelity SUGGESTION and submits it as a NOTE; the same
// notes → issues → fixes loop HANDLES it. The hub is the IDE's host:
//   /api/ide/art/preview  — render a Gemini (nano-banana-pro) candidate
//   /api/ide/suggest      — forward a structured note to the game's /api/notes

// Fetch + parse a game's sprite manifest (window.SPRITES) server-side (no CORS).
async function gameManifest(gameUrl) {
  try {
    const base = String(gameUrl).replace(/\/$/, '');
    const js = await fetch(base + '/game/sprites.js', { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.text() : null));
    if (!js) return null;
    const i = js.indexOf('{'), j = js.lastIndexOf('}');
    if (i < 0 || j < 0) return null;
    return JSON.parse(js.slice(i, j + 1));
  } catch { return null; }
}

// Resolve a CHOSEN asset's image as an image-to-image REFERENCE — works across
// genres (hero/enemy → sprite sheet; tile/prop → texture/sprite). Best-effort:
// returns null when the game doesn't expose that asset → caller falls back to text→image.
async function assetRef(gameUrl, scope) {
  try {
    const man = await gameManifest(gameUrl);
    if (!man) return null;
    const kind = (scope && scope.kind) || 'hero', key = scope && scope.key;
    let rel = null;
    if (kind === 'hero') rel = man.hero && man.hero.sheet;
    else if (kind === 'enemy') rel = man.enemies && man.enemies[key] && man.enemies[key].sheet;
    else if (kind === 'tile') rel = man.tiles && man.tiles[key];
    else if (kind === 'prop') rel = man.props && man.props[key];
    if (!rel) return null;
    const img = await fetch(String(gameUrl).replace(/\/$/, '') + '/assets/' + rel, { signal: AbortSignal.timeout(8000) });
    if (!img.ok) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length > 6_000_000) return null;   // keep the Gemini request sane
    return { base64: buf.toString('base64'), mimeType: img.headers.get('content-type') || 'image/png' };
  } catch { return null; }
}

// The game's REAL editable art surface — so the IDE adapts to the genre at hand
// (a snake has no walk-cycle hero; its art is enemies/tiles/props). Combines the
// live /api/meta descriptors (key + desc) with the sprite manifest (what's drawn).
app.get('/api/ide/surface/:id', async (req, res) => {
  const game = (await getGames()).find((g) => g.id === req.params.id);
  if (!game || !game.url) return res.status(404).json({ error: 'game-not-live' });
  const base = String(game.url).replace(/\/$/, '');
  let meta = {};
  try { meta = await fetch(base + '/api/meta', { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : {})); } catch {}
  const man = await gameManifest(game.url);
  const art = meta.art || {};
  const heroPresent = !!(man && man.hero && man.hero.sheet);
  const list = (arr, kind) => (Array.isArray(arr) ? arr : []).filter((a) => a && a.key).map((a) => ({ kind, key: a.key, desc: a.desc || '' }));
  res.json({
    id: game.id, name: game.name, url: base, archetype: meta.archetype || meta.genre || null, style: art.style || '',
    hero: heroPresent ? { kind: 'hero', key: 'hero', desc: meta.hero || '' } : null,
    enemies: list(art.enemies, 'enemy'), tiles: list(art.tiles, 'tile'), props: list(art.props, 'prop'),
  });
});

// Render an art candidate. Every art edit is a Gemini call; without a Gemini SA
// the Art tool is unavailable (clear 503), never a silent fallback. When the game
// exposes the chosen asset we pass it as a reference (image-to-image → on-model edit).
// parse a data: URL → { base64, mimeType } (null if not an image data URL)
function dataUrlToRef(u) {
  const m = typeof u === 'string' && u.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], base64: m[2] } : null;
}

app.post('/api/ide/art/preview', async (req, res) => {
  if (!geminiConfigured()) return res.status(503).json({ error: 'needs-gemini', message: 'Art editing needs Gemini — set GEMINI_SA_JSON' });
  const { gameId, prompt, aspect = '1:1', useRef = true, scope = null, refImage = null } = req.body || {};
  if (!prompt || String(prompt).trim().length < 4) return res.status(400).json({ error: 'prompt required' });
  let refs = [], refUsed = false, refFrom = null;
  const up = dataUrlToRef(refImage);
  if (up) { refs = [up]; refUsed = true; refFrom = 'upload'; }        // a user upload wins (bring-your-own-art)
  else if (useRef && gameId) {
    const game = (await getGames()).find((g) => g.id === gameId);
    if (game && game.url) { const r = await assetRef(game.url, scope); if (r) { refs = [r]; refUsed = true; refFrom = 'asset'; } }
  }
  try {
    const { mimeType, base64 } = await generateImage(String(prompt), { aspectRatio: aspect, refs });
    res.json({ image: `data:${mimeType};base64,${base64}`, refUsed, refFrom });
  } catch (e) { console.error('ide art preview', e); res.status(502).json({ error: 'gemini-failed', message: String(e && e.message || e).slice(0, 300) }); }
});

// run a node script as a child process, capturing output, with a hard timeout.
function runNode(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => { ch.kill('SIGKILL'); reject(new Error('timed out')); }, timeoutMs);
    ch.on('exit', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error('exit ' + code + ': ' + out.slice(-300))); });
    ch.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
const TOOLS = path.join(__dirname, '..', 'tools');

// BRING-YOUR-OWN-ART → SPRITE SHEET. Upload an image; we seed the proven sprite pipeline
// (art-sprites.mjs --ref) with it to generate a coherent, leg-alternating, VALIDATED packed
// sheet of THAT character (run cycle + action poses), and return it for preview.
app.post('/api/ide/art/sheet', async (req, res) => {
  if (!geminiConfigured()) return res.status(503).json({ error: 'needs-gemini', message: 'Sprite-sheet generation needs Gemini — set GEMINI_SA_JSON' });
  const { hero, style, upload } = req.body || {};
  const up = dataUrlToRef(upload);
  if (!up) return res.status(400).json({ error: 'upload-required', message: 'an uploaded image (data URL) is required' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-sheet-'));
  try {
    fs.mkdirSync(path.join(dir, 'src', 'game'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'GAME_META.json'), JSON.stringify({ name: 'upload', hero: hero || 'the uploaded character', art: { style: style || 'claymation, bold outline, glossy' } }, null, 2));
    const ext = (up.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const refPath = path.join(dir, 'upload.' + ext);
    fs.writeFileSync(refPath, Buffer.from(up.base64, 'base64'));
    await runNode([path.join(TOOLS, 'art-sprites.mjs'), dir, '--ref', refPath, '--force'], 330_000);
    const sheetPath = path.join(dir, 'src/assets/sprites/hero.png');
    if (!fs.existsSync(sheetPath)) throw new Error('no sheet produced');
    const png = fs.readFileSync(sheetPath).toString('base64');
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'src/assets/sprites/manifest.json'), 'utf8'));
    res.json({ sheet: 'data:image/png;base64,' + png, manifest: man.hero || man });
  } catch (e) { console.error('ide art sheet', e); res.status(502).json({ error: 'sheet-failed', message: String(e && e.message || e).slice(0, 300) }); }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
});

// Submit a suggestion as a note to the target game (server-to-server, no CORS).
// The note enters the game's existing notes → GitHub issue loop unchanged.
app.post('/api/ide/suggest', async (req, res) => {
  const { gameId, note } = req.body || {};
  if (!gameId || !note || typeof note !== 'object') return res.status(400).json({ error: 'gameId + note required' });
  const game = (await getGames()).find((g) => g.id === gameId);
  if (!game || !game.url) return res.status(404).json({ error: 'game-not-live', message: 'that game has no live URL to receive the note' });
  const base = String(game.url).replace(/\/$/, '');
  try {
    const r = await fetch(base + '/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ ok: false, status: r.status, message: 'game rejected the note' });
    refresh().catch(() => {});   // pull the new note into the dashboard
    res.json({ ok: true, game: gameId, result: j });
  } catch (e) { console.error('ide suggest', e); res.status(502).json({ error: 'submit-failed', message: String(e && e.message || e).slice(0, 300) }); }
});

// ── Asset Manager ────────────────────────────────────────────────────────────
// Inventory every asset a game actually ships (sprites · tiles · props · backdrops)
// and keep a per-game LIBRARY of variants (generated candidates / uploads / built
// sheets) in the store, so you can browse and SWAP them in/out from the IDE.
async function backdropManifest(gameUrl) {
  try {
    const base = String(gameUrl).replace(/\/$/, '');
    return await fetch(base + '/assets/backdrops/manifest.json', { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null));
  } catch { return null; }
}
async function assetInventory(game) {
  const base = String(game.url).replace(/\/$/, '');
  let meta = {};
  try { meta = await fetch(base + '/api/meta', { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : {})); } catch {}
  const man = (await gameManifest(game.url)) || {};
  const bd = await backdropManifest(game.url);
  const art = meta.art || {};
  const descOf = (arr, key) => { const e = (Array.isArray(arr) ? arr : []).find((x) => x.key === key); return e ? e.desc : ''; };
  const abs = (rel) => base + '/assets/' + rel;
  const out = [];
  if (man.hero && man.hero.sheet) out.push({ kind: 'hero', key: 'hero', label: 'hero', desc: meta.hero || '', current: abs(man.hero.sheet) });
  for (const k of Object.keys(man.enemies || {})) out.push({ kind: 'enemy', key: k, label: k, desc: descOf(art.enemies, k), current: abs(man.enemies[k].sheet || ('sprites/' + k + '.png')) });
  for (const k of Object.keys(man.tiles || {})) out.push({ kind: 'tile', key: k, label: k, desc: descOf(art.tiles, k), current: abs(typeof man.tiles[k] === 'string' ? man.tiles[k] : man.tiles[k].sheet || ('tiles/' + k)) });
  for (const k of Object.keys(man.props || {})) out.push({ kind: 'prop', key: k, label: k, desc: descOf(art.props, k), current: abs(typeof man.props[k] === 'string' ? man.props[k] : man.props[k].sheet || ('props/' + k)) });
  if (bd && bd.title) out.push({ kind: 'backdrop', key: '__title', label: 'title keyart', desc: '', current: base + '/assets/backdrops/' + bd.title });
  if (bd && bd.backdrops) for (const [world, file] of Object.entries(bd.backdrops)) out.push({ kind: 'backdrop', key: world, label: world, desc: '', current: base + '/assets/backdrops/' + file });
  return out;
}
const assetStoreKey = (id) => 'assets:' + id;
async function getVariants(id) { return (await store.get(assetStoreKey(id), { variants: [] })).variants || []; }
async function setVariants(id, variants) { await store.set(assetStoreKey(id), { variants }); }

app.get('/api/ide/assets/:id', async (req, res) => {
  const game = (await getGames()).find((g) => g.id === req.params.id);
  if (!game || !game.url) return res.status(404).json({ error: 'game-not-live' });
  const assets = await assetInventory(game);
  const variants = await getVariants(game.id);
  const byAsset = {};
  for (const v of variants) (byAsset[v.kind + ':' + v.key] = byAsset[v.kind + ':' + v.key] || []).push({ vid: v.vid, source: v.source, label: v.label, ts: v.ts, image: v.image });
  for (const a of assets) { a.variants = (byAsset[a.kind + ':' + a.key] || []).sort((x, y) => y.ts - x.ts); }
  res.json({ id: game.id, name: game.name, url: String(game.url).replace(/\/$/, ''), assets });
});

// Save a variant (a generated candidate / upload / built sheet) into the library.
app.post('/api/ide/assets/:id/variant', async (req, res) => {
  const { kind, key, source = 'generated', image, label = '', prompt = '' } = req.body || {};
  if (!kind || !key || !dataUrlToRef(image)) return res.status(400).json({ error: 'kind, key, image required' });
  if (image.length > 1_500_000) return res.status(413).json({ error: 'image-too-large' });
  let variants = await getVariants(req.params.id);
  const v = { vid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, key, source, label, prompt, image, ts: Date.now() };
  variants.push(v);
  // cap: keep the 10 newest per asset, 120 total, so the store stays lean
  const groups = {};
  for (const x of variants) (groups[x.kind + ':' + x.key] = groups[x.kind + ':' + x.key] || []).push(x);
  let kept = [];
  for (const g of Object.values(groups)) { g.sort((a, b) => b.ts - a.ts); kept = kept.concat(g.slice(0, 10)); }
  kept.sort((a, b) => b.ts - a.ts); kept = kept.slice(0, 120);
  await setVariants(req.params.id, kept);
  res.json({ ok: true, variant: { vid: v.vid, kind, key, source, label, ts: v.ts, image } });
});

app.delete('/api/ide/assets/:id/variant/:vid', async (req, res) => {
  let variants = await getVariants(req.params.id);
  const before = variants.length;
  variants = variants.filter((v) => v.vid !== req.params.vid);
  await setVariants(req.params.id, variants);
  res.json({ ok: true, removed: before - variants.length });
});

app.listen(PORT, () => {
  console.log(`game-engine hub on :${PORT}`);
  dashboard(true).catch(() => {});   // warm the cache on boot
  online.init({ getGames }).catch((e) => console.error('online init', e));
});

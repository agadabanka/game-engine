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
  for (const g of stored) byId[g.id] = { ...byId[g.id], ...g, meta: byId[g.id]?.meta || g.meta };
  return Object.values(byId);
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── cached dashboard snapshot ──
let _cache = { at: 0, data: null, refreshing: null };
async function refresh() {
  const games = await getGames();
  const data = await snapshotAll(games, { ghToken: GH_TOKEN });
  _cache = { at: Date.now(), data, refreshing: null };
  await store.set('last_snapshot', data);   // survives restarts for an instant first paint
  return data;
}
async function dashboard(force = false) {
  if (!force && _cache.data && Date.now() - _cache.at < CACHE_MS) return _cache.data;
  if (!_cache.data) _cache.data = await store.get('last_snapshot', null);   // warm from disk
  if (_cache.refreshing) return _cache.data || _cache.refreshing;
  _cache.refreshing = refresh().catch((e) => { console.error('refresh failed', e); return _cache.data; });
  // if we already have something cached, return it now and let refresh run in the background
  return _cache.data || (await _cache.refreshing);
}

// ── routes ──
app.get('/health', (_req, res) => res.json({ ok: true, service: 'game-engine-hub' }));

app.get('/api/dashboard', async (req, res) => {
  try { res.json(await dashboard(req.query.force === '1')); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});
app.post('/api/refresh', async (_req, res) => {
  try { res.json(await refresh()); } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/games', async (_req, res) => res.json({ games: await getGames() }));

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

// Host each game's recorded shorts as GitHub Release assets (tag `shorts`) on
// the game's own repo, and emit out/shorts/hosted.json mapping each game to its
// [{ mp4, title, biome }] for wiring into the hub. Idempotent: recreates the
// release. Uses GH_TOKEN. Skips biome-bash (already checked in + on jsDelivr).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHORTS = path.join(ROOT, 'out/shorts');
const GAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub/games.json'), 'utf8'));
const GH = process.env.GH_TOKEN;
const TAG = 'shorts';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gh(route, method = 'GET', body, raw) {
  const r = await fetch(`https://api.github.com${route}`, {
    method, headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'game-engine' },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  return r;
}
function label(g, lv) {
  const w = (g.meta && Array.isArray(g.meta.worlds)) ? g.meta.worlds : [];
  if (w[lv - 1]) return w[lv - 1];
  const vids = (g.meta && g.meta.videos) || {};
  for (const k of Object.keys(vids)) { const m = new RegExp(`level-?${lv}(?:-(.+))?$`, 'i').exec(k); if (m && m[1]) return m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  return `Level ${lv}`;
}

// Optional CLI filter: `node host-shorts.mjs <id> [id...]` re-hosts only those
// games (each re-host rotates the release's asset IDs, so scope it to the games
// you actually re-recorded and leave the rest of the registry untouched).
const ONLY = process.argv.slice(2);
const hosted = {};
for (const g of GAMES) {
  if (g.id === 'biome-bash') continue;
  if (ONLY.length && !ONLY.includes(g.id)) continue;
  const dir = path.join(SHORTS, g.id);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort();
  if (!files.length) continue;
  const repo = g.repo;
  process.stdout.write(`${g.id} (${files.length})… `);
  // delete existing release + tag (clean re-host)
  const ex = await gh(`/repos/${repo}/releases/tags/${TAG}`);
  if (ex.ok) { const j = await ex.json(); await gh(`/repos/${repo}/releases/${j.id}`, 'DELETE'); await gh(`/repos/${repo}/git/refs/tags/${TAG}`, 'DELETE'); await sleep(800); }
  // create release
  const cr = await gh(`/repos/${repo}/releases`, 'POST', { tag_name: TAG, name: 'Shorts', body: 'Vertical gameplay shorts for the game-engine hub.', draft: false });
  const rel = await cr.json();
  if (!rel.upload_url) { console.log('FAILED:', JSON.stringify(rel).slice(0, 120)); continue; }
  const up = rel.upload_url.split('{')[0];
  const arr = [];
  for (const f of files) {
    const lv = Number(/-(\d+)\.mp4$/.exec(f)?.[1] || 1);
    const bytes = fs.readFileSync(path.join(dir, f));
    const r = await fetch(`${up}?name=${encodeURIComponent(f)}`, { method: 'POST', headers: { Authorization: `token ${GH}`, 'Content-Type': 'video/mp4', 'User-Agent': 'game-engine' }, body: bytes });
    const a = await r.json();
    if (!a.browser_download_url) { console.log(`\n  ! ${f}: ${JSON.stringify(a).slice(0, 100)}`); continue; }
    const lab = label(g, lv);
    // a.url is the api.github.com asset URL — the ONLY reliably-streamable form for
    // PRIVATE repos (browser_download_url 404s w/o a session). The hub /v proxy
    // adds the auth token + Accept: octet-stream. Keep browser_download_url for ref.
    arr.push({ mp4: a.url, browser: a.browser_download_url, level: lv, title: lab, biome: lab });
    process.stdout.write('·');
  }
  hosted[g.id] = arr;
  console.log(` ✓ ${arr.length} hosted`);
}
fs.writeFileSync(path.join(SHORTS, 'hosted.json'), JSON.stringify(hosted, null, 2));
console.log('\nDONE →', path.join(SHORTS, 'hosted.json'));

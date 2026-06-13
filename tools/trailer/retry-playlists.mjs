// Retry the per-game shorts playlists that failed on 429 (rate limit), spacing
// the calls out. Reads/updates out/shorts/wired.json from existing short ids.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WF = path.join(ROOT, 'out/shorts/wired.json');
const wired = JSON.parse(fs.readFileSync(WF, 'utf8'));
const GAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub/games.json'), 'utf8'));
const CID = process.env.YT_CLIENT_ID, CSEC = process.env.YT_CLIENT_SECRET;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function token() {
  const { refresh_token } = JSON.parse(fs.readFileSync('/tmp/yt-creds.json', 'utf8'));
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token, grant_type: 'refresh_token' }) })).json();
  return t.access_token;
}
let tok = await token();
async function api(route, body, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.ok) return j;
    if (r.status === 429 || r.status === 403) { const wait = 8000 * (i + 1); console.log(`    429/403, backoff ${wait/1000}s…`); await sleep(wait); tok = await token(); continue; }
    return j;
  }
  return { error: 'retries exhausted' };
}
const nameOf = (g) => GAMES.find(x => x.id === g)?.name || g;
const urlOf = (g) => GAMES.find(x => x.id === g)?.url || '';
for (const [id, w] of Object.entries(wired)) {
  if (w.shortsPlaylist) continue;             // already has one
  const ids = w.shorts.map(s => s.id);
  if (!ids.length) continue;
  process.stdout.write(`${id}: creating playlist… `);
  const pl = await api('playlists?part=snippet,status', { snippet: { title: `${nameOf(id)} — Shorts`, description: `Vertical highlight reels. Play free: ${urlOf(id)}` }, status: { privacyStatus: 'unlisted' } });
  if (!pl.id) { console.log('FAILED:', JSON.stringify(pl).slice(0, 120)); continue; }
  for (const v of ids) { await api('playlistItems?part=snippet', { snippet: { playlistId: pl.id, resourceId: { kind: 'youtube#video', videoId: v } } }); await sleep(2500); }
  w.shortsPlaylist = `https://www.youtube.com/playlist?list=${pl.id}`;
  console.log(w.shortsPlaylist);
  fs.writeFileSync(WF, JSON.stringify(wired, null, 2));   // persist after each
  await sleep(12000);                                      // space out playlist creates
}
console.log('\nDONE. playlists:', Object.values(wired).filter(w => w.shortsPlaylist).length, '/', Object.keys(wired).length);

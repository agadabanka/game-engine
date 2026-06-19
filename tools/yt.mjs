// ── ENGINE YouTube helper ────────────────────────────────────────────────────
// Upload an MP4 to YouTube (resumable) and manage a playlist, using an installed-app
// OAuth refresh token. Env: YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_TOKEN.
// Importable (used by recorders) AND a small CLI:
//   node tools/yt.mjs upload <file.mp4> "Title" "Description" [public|unlisted|private]
//   node tools/yt.mjs playlist "Playlist title" "Description" <videoId> <videoId> ...
import fs from 'node:fs';

const ID = process.env.YT_CLIENT_ID, SECRET = process.env.YT_CLIENT_SECRET, REFRESH = process.env.YT_REFRESH_TOKEN;

export async function accessToken() {
  if (!ID || !SECRET || !REFRESH) throw new Error('YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN must be set');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ID, client_secret: SECRET, refresh_token: REFRESH, grant_type: 'refresh_token' })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token;
}

// Resumable upload → returns { id, url }. privacy: 'public' | 'unlisted' | 'private'.
export async function upload(file, title, description, privacy = 'public', token) {
  token = token || (await accessToken());
  const bytes = fs.readFileSync(file);
  const meta = { snippet: { title, description, categoryId: '20' }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false } };
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(bytes.length) },
    body: JSON.stringify(meta)
  });
  if (!init.ok) throw new Error('upload init failed: ' + init.status + ' ' + (await init.text()).slice(0, 200));
  const loc = init.headers.get('location');
  if (!loc) throw new Error('no resumable upload URL');
  const put = await fetch(loc, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) }, body: bytes });
  const j = await put.json();
  if (!j.id) throw new Error('upload failed: ' + JSON.stringify(j).slice(0, 200));
  return { id: j.id, url: 'https://youtu.be/' + j.id };
}

export async function createPlaylist(title, description, privacy = 'public', token) {
  token = token || (await accessToken());
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { title, description }, status: { privacyStatus: privacy } })
  });
  const j = await r.json();
  if (!j.id) throw new Error('playlist create failed: ' + JSON.stringify(j).slice(0, 200));
  return { id: j.id, url: 'https://www.youtube.com/playlist?list=' + j.id };
}

export async function addToPlaylist(playlistId, videoId, token) {
  token = token || (await accessToken());
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } })
  });
  const j = await r.json();
  if (!j.id) throw new Error('playlist add failed: ' + JSON.stringify(j).slice(0, 200));
  return j.id;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  const token = await accessToken();
  if (cmd === 'upload') {
    const [file, title, desc, privacy = 'public'] = rest;
    const v = await upload(file, title, desc || '', privacy, token);
    console.log(v.url);
  } else if (cmd === 'playlist') {
    const [title, desc, ...vids] = rest;
    const p = await createPlaylist(title, desc || '', 'public', token);
    for (const v of vids) await addToPlaylist(p.id, v, token);
    console.log(p.url);
  } else {
    console.error('usage: yt.mjs upload <file> "Title" "Desc" [privacy] | yt.mjs playlist "Title" "Desc" <id>...');
    process.exit(2);
  }
}

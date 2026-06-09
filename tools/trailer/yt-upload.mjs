// YouTube uploader via OAuth DEVICE FLOW (no browser on this box). Reuses a saved
// refresh token when present; otherwise prints a code+URL for the user to authorize,
// polls until granted, then resumable-uploads the video.
//   YT_CLIENT_ID=... YT_CLIENT_SECRET=... node tools/yt-upload.mjs <file.mp4> "<title>" "<desc>" [public|unlisted|private]
import fs from 'node:fs';

const CID = process.env.YT_CLIENT_ID, CSEC = process.env.YT_CLIENT_SECRET;
const FILE = process.argv[2];
const TITLE = process.argv[3] || 'Untitled';
const DESC = process.argv[4] || '';
const PRIVACY = process.argv[5] || 'unlisted';
const CREDS = '/tmp/yt-creds.json';
const CODEOUT = '/tmp/yt-code.json';
if (!CID || !CSEC) { console.error('set YT_CLIENT_ID + YT_CLIENT_SECRET'); process.exit(2); }
if (!FILE || !fs.existsSync(FILE)) { console.error('video file not found:', FILE); process.exit(2); }
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function accessToken() {
  // reuse refresh token if we have one
  if (fs.existsSync(CREDS)) {
    const { refresh_token } = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
    if (refresh_token) {
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token, grant_type: 'refresh_token' }) });
      const j = await r.json();
      if (j.access_token) { console.log('reused saved authorization.'); return j.access_token; }
    }
  }
  // device flow
  const dc = await (await fetch('https://oauth2.googleapis.com/device/code', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, scope: SCOPE }) })).json();
  if (!dc.device_code) throw new Error('device code failed: ' + JSON.stringify(dc));
  fs.writeFileSync(CODEOUT, JSON.stringify({ user_code: dc.user_code, verification_url: dc.verification_url || dc.verification_uri }, null, 2));
  console.log('\n================ AUTHORIZE ================');
  console.log('1) Go to:', dc.verification_url || dc.verification_uri);
  console.log('2) Enter code:', dc.user_code);
  console.log('==========================================\n');
  const interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + (dc.expires_in || 1800) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CID, client_secret: CSEC, device_code: dc.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) })).json();
    if (t.access_token) {
      if (t.refresh_token) fs.writeFileSync(CREDS, JSON.stringify({ refresh_token: t.refresh_token }, null, 2));
      console.log('authorized.');
      return t.access_token;
    }
    if (t.error && t.error !== 'authorization_pending' && t.error !== 'slow_down') throw new Error('auth: ' + t.error);
  }
  throw new Error('authorization timed out');
}

const token = await accessToken();
// resumable upload
const meta = { snippet: { title: TITLE, description: DESC, categoryId: '20' }, status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false } };
const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4' },
  body: JSON.stringify(meta) });
const uploadUrl = init.headers.get('location');
if (!uploadUrl) throw new Error('no upload URL: ' + init.status + ' ' + (await init.text()).slice(0, 300));
const bytes = fs.readFileSync(FILE);
const up = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) }, body: bytes });
const res = await up.json();
if (res.id) console.log(`\n✅ UPLOADED: https://youtu.be/${res.id}  (privacy: ${PRIVACY})`);
else { console.error('upload failed:', up.status, JSON.stringify(res).slice(0, 400)); process.exit(1); }

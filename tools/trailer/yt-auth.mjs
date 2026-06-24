// tools/trailer/yt-auth.mjs — mint a YouTube refresh token via OAuth DEVICE FLOW (no
// browser on this box). Auth-only sibling of yt-upload.mjs: it prints a code + URL,
// polls until you authorize, then saves the refresh token to the SAME file yt-upload.mjs
// reads (/tmp/yt-creds.json). Run it once per fresh container so the video/upload stages
// of the make-game pipeline can run unattended to the end.
//
//   YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/trailer/yt-auth.mjs
//
import fs from 'node:fs';

const CID = process.env.YT_CLIENT_ID, CSEC = process.env.YT_CLIENT_SECRET;
const CREDS = '/tmp/yt-creds.json';
const CODEOUT = '/tmp/yt-code.json';
if (!CID || !CSEC) { console.error('set YT_CLIENT_ID + YT_CLIENT_SECRET'); process.exit(2); }
const SCOPE = 'https://www.googleapis.com/auth/youtube';   // upload + playlist (one token does both)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// already have a working token? don't make the user re-auth.
if (fs.existsSync(CREDS)) {
  try {
    const { refresh_token } = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
    if (refresh_token) {
      const r = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token, grant_type: 'refresh_token' }) })).json();
      if (r.access_token) { console.log('✅ already authorized — saved refresh token still valid. Nothing to do.'); process.exit(0); }
    }
  } catch {}
}

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
    if (t.refresh_token) {
      fs.writeFileSync(CREDS, JSON.stringify({ refresh_token: t.refresh_token }, null, 2));
      console.log('✅ authorized — refresh token saved to', CREDS);
    } else {
      console.log('✅ authorized, but Google returned NO refresh token (this account already granted the app).');
      console.log('   Revoke at https://myaccount.google.com/permissions and re-run to mint a fresh one.');
    }
    process.exit(0);
  }
  if (t.error && t.error !== 'authorization_pending' && t.error !== 'slow_down') throw new Error('auth: ' + t.error);
}
throw new Error('authorization timed out');

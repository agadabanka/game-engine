// scripts/preflight-tokens.mjs — the CREDENTIALS doctor. Run this FIRST, before
// scaffolding a new game, so the whole make-game pipeline (scaffold → art → music →
// deploy → videos/upload) can run to the end without stalling on a missing token.
//
//   node scripts/preflight-tokens.mjs
//
// It reports every credential the pipeline touches, grouped by the stage that needs it,
// and VALIDATES the YouTube refresh token by exchanging it for an access token (the one
// credential that can't be checked by presence alone — it's minted interactively).
//
// Severity:
//   ✗ hard   — a stage HARD-fails without it (scaffold, art).
//   ⚠ soft   — the stage degrades or is skipped (music falls back to procedural; no hub link).
// Exits non-zero only if a HARD credential is missing. For the YouTube token, it prints
// the exact command to mint one (tools/trailer/yt-auth.mjs) instead of failing the run.
import fs from 'node:fs';

const YT_CREDS = '/tmp/yt-creds.json';
const checks = [];   // {name, ok, hard, stage, info, fix}
const add = (c) => checks.push({ hard: false, info: '', fix: '', ...c });
const anyEnv = (...keys) => keys.find((k) => process.env[k]);

// ── scaffold + repo ──────────────────────────────────────────────────────────
add({ name: 'GH_TOKEN', stage: 'scaffold/repo', ok: !!process.env.GH_TOKEN, hard: true,
  info: process.env.GH_TOKEN ? 'present' : 'missing — new-game.mjs cannot create the repo',
  fix: 'export GH_TOKEN=<github PAT with repo scope>' });

// ── hub register ─────────────────────────────────────────────────────────────
add({ name: 'HUB_URL', stage: 'hub register', ok: !!process.env.HUB_URL,
  info: process.env.HUB_URL ? process.env.HUB_URL : 'unset — game still scaffolds; register it from the dashboard',
  fix: 'export HUB_URL=<mission-control url>' });

// ── art (Gemini) ─────────────────────────────────────────────────────────────
const geminiKey = anyEnv('GEMINI_SA_JSON', 'GOOGLE_APPLICATION_CREDENTIALS', 'GEMINI_API_KEY');
add({ name: 'GEMINI (art)', stage: 'art', ok: !!geminiKey, hard: true,
  info: geminiKey ? `via ${geminiKey}` : 'missing — art stage hard-fails (geminiConfigured() === false)',
  fix: 'set one of GEMINI_SA_JSON / GOOGLE_APPLICATION_CREDENTIALS / GEMINI_API_KEY' });

// ── music (Lyria — needs a Vertex-capable service account, not a bare API key) ─
const lyriaKey = anyEnv('GEMINI_SA_JSON', 'GOOGLE_APPLICATION_CREDENTIALS');
add({ name: 'LYRIA (music)', stage: 'music', ok: !!lyriaKey,
  info: lyriaKey ? `via ${lyriaKey}` : 'no Vertex SA — music stage skips; game keeps its procedural Studio.Audio',
  fix: 'set GEMINI_SA_JSON or GOOGLE_APPLICATION_CREDENTIALS (a Gemini/Vertex service account)' });

// ── deploy ───────────────────────────────────────────────────────────────────
add({ name: 'RAILWAY_TOKEN', stage: 'deploy', ok: !!process.env.RAILWAY_TOKEN,
  info: process.env.RAILWAY_TOKEN ? 'present' : 'unset — deploy step needs it (or deploy manually per BOOTSTRAP.md)',
  fix: 'export RAILWAY_TOKEN=<railway token>' });

// ── videos / YouTube upload ──────────────────────────────────────────────────
const ytClient = !!(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET);
add({ name: 'YT_CLIENT_ID/SECRET', stage: 'videos/upload', ok: ytClient,
  info: ytClient ? 'present' : 'missing — cannot run the OAuth flow to upload trailers/shorts',
  fix: 'set YT_CLIENT_ID + YT_CLIENT_SECRET' });

// YouTube refresh token: presence isn't enough — exchange it to confirm it still works.
// Source order matches yt-upload.mjs: YT_REFRESH_TOKEN env first (survives ephemeral
// containers), then the on-box /tmp/yt-creds.json file.
let ytTokenOk = false, ytTokenInfo = 'no saved token';
let ytToken = null, ytSrc = '';
if (process.env.YT_REFRESH_TOKEN) { ytToken = process.env.YT_REFRESH_TOKEN; ytSrc = 'YT_REFRESH_TOKEN env'; }
else if (fs.existsSync(YT_CREDS)) {
  try { const { refresh_token } = JSON.parse(fs.readFileSync(YT_CREDS, 'utf8')); if (refresh_token) { ytToken = refresh_token; ytSrc = YT_CREDS; } }
  catch (e) { ytTokenInfo = 'creds file unreadable: ' + e.message; }
}
if (ytClient && ytToken) {
  try {
    const r = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.YT_CLIENT_ID, client_secret: process.env.YT_CLIENT_SECRET, refresh_token: ytToken, grant_type: 'refresh_token' }) })).json();
    ytTokenOk = !!r.access_token;
    ytTokenInfo = r.access_token ? `valid via ${ytSrc} (scope ${r.scope || '?'})` : `token from ${ytSrc} rejected: ${r.error || 'unknown'}`;
  } catch (e) { ytTokenInfo = 'token exchange failed: ' + e.message; }
} else if (ytClient) {
  ytTokenInfo = `no token (set YT_REFRESH_TOKEN env or run yt-auth.mjs) — mint one before the upload stage`;
}
add({ name: 'YT refresh token', stage: 'videos/upload', ok: ytTokenOk, info: ytTokenInfo,
  fix: 'set YT_REFRESH_TOKEN env (persists across containers), or run: YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/trailer/yt-auth.mjs (device flow — relay the code to the user)' });

// ── report ───────────────────────────────────────────────────────────────────
console.log('\n🔑 token preflight — credentials for the full make-game pipeline\n');
let hardFail = 0, softMiss = 0;
for (const c of checks) {
  const icon = c.ok ? '✓' : (c.hard ? '✗' : '⚠');
  console.log(`  ${icon} ${c.name.padEnd(20)} [${c.stage.padEnd(14)}] ${c.info}`);
  if (!c.ok) { if (c.hard) hardFail++; else softMiss++; }
}
const fixes = checks.filter((c) => !c.ok);
if (fixes.length) {
  console.log('\n  to fix:');
  for (const c of fixes) console.log(`    • ${c.name}: ${c.fix}`);
}
console.log(`\n  ${hardFail ? `❌ ${hardFail} hard credential(s) missing — pipeline will stall` : '✅ all hard credentials present'}${softMiss ? ` · ${softMiss} optional/degraded` : ''}\n`);
process.exit(hardFail ? 1 : 0);

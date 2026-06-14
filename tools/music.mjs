// tools/music.mjs — generate a Lyria loop per world + a title theme for a game.
// ENGINE-level: operates on a game dir. Reads GAME_META.worlds and an optional
// meta.music = { style, prompts:{<world>:prompt}, titlePrompt }. Lyria (Vertex
// lyria-002) returns WAV; we transcode to mp3 with ffmpeg-static. Cached via
// gencache (content-addressed on prompt+seed → re-runs are free).
//
//   node tools/music.mjs <gameDir> [--seed N] [--force]
//
// Needs a Vertex service account (GEMINI_SA_JSON / GOOGLE_APPLICATION_CREDENTIALS).
// Skips cleanly if absent. NOTE: Lyria must be ALLOW-LISTED for the GCP project; if it
// isn't it soft-denies every prompt — leave the game's procedural Studio.Audio fallback.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { GoogleAuth } from 'google-auth-library';
import { cached } from './lib/gencache.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/music.mjs <gameDir> [--seed N] [--force]'); process.exit(2); }
const seed0 = process.argv.includes('--seed') ? +process.argv[process.argv.indexOf('--seed') + 1] : 7;
const force = process.argv.includes('--force');

const REGION = process.env.LYRIA_REGION || 'us-central1';
const MODEL = process.env.LYRIA_MODEL || 'lyria-002';
function saJson() {
  if (process.env.GEMINI_SA_JSON) return JSON.parse(process.env.GEMINI_SA_JSON);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  throw new Error('Set GEMINI_SA_JSON or GOOGLE_APPLICATION_CREDENTIALS (a Vertex-capable service account).');
}
function lyriaConfigured() { try { saJson(); return true; } catch { return false; } }
let _client = null;
async function token() {
  if (!_client) _client = await new GoogleAuth({ credentials: saJson(), scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const { token: t } = await _client.getAccessToken();
  return t;
}
async function generateMusic(prompt, { negativePrompt, seed } = {}) {
  const project = saJson().project_id;
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${REGION}/publishers/google/models/${MODEL}:predict`;
  const inst = { prompt };
  if (negativePrompt) inst.negative_prompt = negativePrompt;
  if (seed != null) inst.seed = seed;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [inst], parameters: { sample_count: 1 } }) });
  if (!r.ok) throw new Error(`Lyria ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const p = j?.predictions?.[0];
  const base64 = p?.bytesBase64Encoded || p?.audioContent;
  if (!base64) throw new Error('No audio in Lyria response: ' + JSON.stringify(j).slice(0, 160));
  return Buffer.from(base64, 'base64');
}

if (!lyriaConfigured()) { console.error('No Vertex SA (GEMINI_SA_JSON) — skipping music; the game keeps its procedural Studio.Audio.'); process.exit(0); }

const meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8'));
const worlds = meta.worlds || [];
const music = (meta.music && typeof meta.music === 'object') ? meta.music : {};
const style = music.style || meta.tagline || 'a cheerful instrumental game theme';
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outDir = path.join(gameDir, 'src/assets/music');
fs.mkdirSync(outDir, { recursive: true });

const jobs = worlds.map((w, i) => ({ key: slug(w), seed: seed0 + i + 1, prompt: (music.prompts && music.prompts[w]) || `${style} — level music for "${w}", playful, loopable, instrumental` }));
jobs.push({ key: 'title', seed: seed0, prompt: music.titlePrompt || `${style} — a warm, inviting TITLE theme, instrumental` });

let ok = 0;
for (const j of jobs) {
  try {
    // cache the raw WAV by (prompt, seed, model); encode the mp3 from the cached wav
    const c = await cached('lyria', { prompt: j.prompt, seed: j.seed, model: MODEL }, '.wav',
      async () => await generateMusic(j.prompt, { seed: j.seed, negativePrompt: 'vocals, singing, speech' }),
      { dir: path.join(gameDir, '.cache') });
    const mp3 = path.join(outDir, j.key + '.mp3');
    if (force || !fs.existsSync(mp3)) execFileSync(ffmpegPath, ['-y', '-i', c.path, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], { stdio: 'pipe' });
    console.log(`✓ ${j.key}${c.hit ? ' (cached)' : ''}`); ok++;
  } catch (e) { console.log(`✗ ${j.key}: ${e.message}`); }
}
console.log(`\n${ok}/${jobs.length} tracks → ${outDir}`);
if (!ok) console.log('Lyria likely not enabled for this project — request access, then re-run; the game keeps its procedural Studio.Audio.');

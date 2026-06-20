// tools/hub-thumbs.mjs — square HUB thumbnails for the "all games" grid (issue #86).
//
// Generates a 1:1 thumbnail per game with Gemini (gemini-3-pro-image / nano-banana),
// self-hosted at hub/public/thumbs/<id>.png and served by the hub. The game NAME is
// NOT baked into the image (the hub overlays it via CSS so it's always crisp) — the
// art just needs to read as that game at a glance. Falls back cleanly: if a game has
// a self-hosted cover (hub/public/covers/<id>.jpg) it's passed to Gemini as a style
// reference; if Gemini is unavailable/fails, the hub UI itself falls back to the cover.
//
//   node tools/hub-thumbs.mjs --all            # backfill every registered game (skip existing)
//   node tools/hub-thumbs.mjs <id> [<id> …]    # specific games (used by the Loop stage)
//   node tools/hub-thumbs.mjs --all --force     # regenerate even if a thumb exists
//
// Needs GEMINI_SA_JSON (or GEMINI creds). Idempotent; one game's failure never aborts the rest.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THUMBS = path.join(ROOT, 'hub/public/thumbs');
const COVERS = path.join(ROOT, 'hub/public/covers');
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const ALL = argv.includes('--all');
const ids = argv.filter((a) => !a.startsWith('--'));

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub/games.json'), 'utf8'));
const games = Array.isArray(reg) ? reg : (reg.games || []);
const pick = ALL ? games : games.filter((g) => ids.includes(g.id));
if (!pick.length) { console.error('usage: node tools/hub-thumbs.mjs --all | <id> …  [--force]'); process.exit(2); }
if (!geminiConfigured()) { console.error('hub-thumbs: no Gemini creds (GEMINI_SA_JSON) — UI falls back to /covers/<id>.jpg. Skipping.'); process.exit(0); }
fs.mkdirSync(THUMBS, { recursive: true });

// A square-keyart prompt from the game's own identity (theme/art/hero), centered + clean.
function promptFor(g) {
  const m = g.meta || {};
  const bits = [g.tagline || m.tagline, m.hero && `hero: ${m.hero}`, m.art && `${m.art} style`, m.archetype && `${m.archetype}`]
    .filter(Boolean).join(' · ');
  return [
    `Square (1:1) app-icon-style key art for the game "${g.name}".`,
    bits && `The game: ${bits}.`,
    `A single bold, instantly-readable hero/subject centered on a rich themed background that matches the game's world.`,
    `Polished, toony, vibrant, high-contrast, deep depth; fills the whole square edge-to-edge.`,
    `NO text, NO words, NO letters, NO logo, NO UI — pure illustration (the name is added separately).`,
  ].filter(Boolean).join(' ');
}

function coverRef(id) {
  const p = path.join(COVERS, id + '.jpg');
  if (!fs.existsSync(p)) return [];
  return [{ mimeType: 'image/jpeg', base64: fs.readFileSync(p).toString('base64') }];
}

// Gemini returns a big 1:1 PNG; downscale + transcode to a small square JPEG (the grid
// cells are ~150px, so a 360px jpg is plenty and keeps the repo lean — ~20–40KB each).
function toThumbJpg(pngBuf, dst) {
  const tmp = path.join(os.tmpdir(), 'thumb-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png');
  fs.writeFileSync(tmp, pngBuf);
  try {
    execFileSync(ffmpeg, ['-y', '-i', tmp, '-vf', 'scale=360:360:force_original_aspect_ratio=increase,crop=360:360', '-q:v', '4', dst], { stdio: 'ignore' });
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

let made = 0, skipped = 0, failed = 0;
for (const g of pick) {
  const dst = path.join(THUMBS, g.id + '.jpg');
  if (fs.existsSync(dst) && !FORCE) { skipped++; console.log(`  – ${g.id} (exists)`); continue; }
  try {
    const img = await generateImage(promptFor(g), { aspectRatio: '1:1', refs: coverRef(g.id) });
    toThumbJpg(Buffer.from(img.base64, 'base64'), dst);
    made++; console.log(`  ✓ ${g.id} → hub/public/thumbs/${g.id}.jpg (${Math.round(fs.statSync(dst).size / 1024)}KB)`);
  } catch (e) { failed++; console.error(`  ✗ ${g.id}: ${String(e.message || e).slice(0, 160)}`); }
}
console.log(`\nhub-thumbs: ${made} generated · ${skipped} kept · ${failed} failed (of ${pick.length}).`);

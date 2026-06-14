// Engine art tool — generate themed backdrops per world + title keyart for ANY game,
// via scripts/gemini.js (nano-banana-pro), CACHED through tools/lib/gencache.mjs so a
// re-run never re-bills an identical prompt. Operates on a game directory; reads worlds +
// style from its GAME_META.json (overridable). Saves to <game>/src/assets/backdrops/ and
// writes a manifest the game loads. This is the canonical engine Art stage (the make-game
// runner calls it); a new game does NOT carry its own art script.
//
//   node tools/art.mjs <game-dir> [--style "claymation, …"] [--worlds "A,B,C"] [--title]
import fs from 'node:fs';
import path from 'node:path';
import { generateImage, geminiConfigured } from '../scripts/gemini.js';
import { cached } from './lib/gencache.mjs';

const argv = process.argv.slice(2);
const val = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const dir = path.resolve(argv.find((a) => !a.startsWith('--')) || '.');
if (!fs.existsSync(path.join(dir, 'GAME_META.json'))) { console.error(`no GAME_META.json in ${dir}`); process.exit(2); }
if (!geminiConfigured()) { console.error('GEMINI_SA_JSON not configured — art stage needs it'); process.exit(3); }

const meta = JSON.parse(fs.readFileSync(path.join(dir, 'GAME_META.json'), 'utf8'));
const style = val('--style') || (meta.art && meta.art.style) || (typeof meta.art === 'string' && meta.art.length > 30 ? meta.art : null)
  || 'polished toony game art, bold clean outlines, vivid saturated palette';
const worlds = (val('--worlds') ? val('--worlds').split(',') : meta.worlds || []).map((w) => String(w).trim()).filter(Boolean);
if (!worlds.length) { console.error('no worlds — set meta.worlds or pass --worlds "A,B,C"'); process.exit(2); }

const outDir = path.join(dir, 'src/assets/backdrops');
fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cacheDir = path.join(dir, '.artcache');

// bottom third MUST stay gameplay-clean (per the owner's standing rule); NO text.
const backdropPrompt = (w) => `${style}. A wide side-scrolling platformer BACKDROP for a world called "${w}". Lush, colorful, deep parallax. The BOTTOM THIRD must be simple and uncluttered (gameplay happens there). Absolutely NO text, words, letters, numbers, logos, or UI.`;
const keyartPrompt = () => `${style}. Hero key art / title illustration for "${meta.name}" — ${meta.hero || 'the hero'}. ${meta.tagline || ''}. Dynamic, characterful, poster-like. Absolutely NO text, words, or letters.`;

async function gen(kind, params, prompt, aspect, dest) {
  process.stdout.write(`  ● ${kind}… `);
  const { path: file, hit } = await cached(kind, { style, ...params, aspect }, '.jpg', async () => {
    const { base64 } = await generateImage(prompt, { aspectRatio: aspect });
    return Buffer.from(base64, 'base64');
  }, { dir: cacheDir });
  fs.copyFileSync(file, dest);
  console.log(`${hit ? '(cached)' : '(generated)'} → ${path.relative(dir, dest)} ${(fs.statSync(dest).size / 1024).toFixed(0)}KB`);
}

console.log(`\nart · ${meta.name} · ${worlds.length} worlds\n  style: ${style.slice(0, 80)}…\n`);
const manifest = { style, title: 'title.jpg', backdrops: {} };
try {
  for (const w of worlds) { const f = `${slug(w)}.jpg`; await gen('backdrop', { world: w }, backdropPrompt(w), '16:9', path.join(outDir, f)); manifest.backdrops[w] = f; }
  if (argv.includes('--title') || true) await gen('keyart', { game: meta.name }, keyartPrompt(), '16:9', path.join(outDir, 'title.jpg'));
} catch (e) { console.error('\nart generation failed:', e.message); process.exit(1); }
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n✓ art complete → ${path.relative(dir, outDir)} (manifest.json wired)`);

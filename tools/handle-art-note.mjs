// tools/handle-art-note.mjs — HANDLE a structured art note from the Studio IDE.
//
// The IDE lets the owner SUGGEST an art edit; the suggestion is a structured note
// ({ tool:"art", scope, proposal:{ hero, style, instruction }, prompt }). This is
// the HANDLING step of the notes loop for art: apply the proposal to a game dir,
// REGENERATE the sprite via the proven art pipeline, VALIDATE it (the 0-hop sprite
// gate), and optionally COMMIT + DISMISS the note. Humans suggest; this applies.
//
//   node tools/handle-art-note.mjs <gameDir> --note '<json>'|<file.json>  [--commit] [--dry-run]
//   node tools/handle-art-note.mjs <gameDir> --from <gameUrl> [--id <noteId>] [--commit] [--dismiss]
//
// --note      a structured note as inline JSON or a path to a .json file
// --from      fetch the latest unhandled art note from a live game's /api/notes
// --id        with --from, pick a specific note id (default: newest art note)
// --commit    git add/commit the regenerated art in <gameDir>
// --dismiss   with --from, DELETE the note via /api/notes (needs NOTES_GH_TOKEN)
// --dry-run   apply meta + print the plan, but DON'T run the generator
//
// Needs GEMINI_SA_JSON for the actual regeneration (art-sprites). Skips cleanly
// in --dry-run. Mirrors how every other engine tool operates on a <gameDir>.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const gameDir = argv.find((a) => !a.startsWith('--') && a !== val('--note') && a !== val('--from') && a !== val('--id'));

if (!gameDir || !fs.existsSync(path.join(gameDir, 'GAME_META.json'))) {
  console.error('usage: node tools/handle-art-note.mjs <gameDir> --note <json|file> | --from <url> [--commit] [--dry-run]');
  process.exit(2);
}

// ── resolve the note (inline json | file | newest art note from a live game) ──
async function resolveNote() {
  const noteArg = val('--note');
  if (noteArg) {
    const raw = fs.existsSync(noteArg) ? fs.readFileSync(noteArg, 'utf8') : noteArg;
    return JSON.parse(raw);
  }
  const url = val('--from');
  if (url) {
    const base = url.replace(/\/$/, '');
    const all = await fetch(base + '/api/notes').then((r) => r.json());
    const id = val('--id');
    const arts = all.filter((n) => (n.tool === 'art' || n.kind === 'art') && n.status !== 'closed');
    const note = id ? all.find((n) => String(n.id) === String(id)) : arts.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
    if (!note) throw new Error('no matching art note found at ' + base + '/api/notes');
    return note;
  }
  throw new Error('provide --note <json|file> or --from <gameUrl>');
}

const note = await resolveNote();
const prop = note.proposal || {};
const hero = prop.hero || note.hero || null;
const style = prop.style || (prop.art && prop.art.style) || null;
const instruction = prop.instruction || note.text || '';

console.log(`\n🎨 handle-art-note · ${gameDir}`);
console.log(`   note #${note.id || '—'} · scope ${JSON.stringify(note.scope || {})}`);
console.log(`   instruction: ${instruction}`);

// ── apply the proposal to GAME_META.json ──
const metaPath = path.join(gameDir, 'GAME_META.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const before = { hero: meta.hero, style: (meta.art && meta.art.style) || meta.art };
if (hero) meta.hero = hero;
if (style) meta.art = typeof meta.art === 'object' && meta.art ? { ...meta.art, style } : { style };
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log(`   meta.hero:  ${before.hero ?? '—'}  →  ${meta.hero ?? '—'}`);
console.log(`   art.style:  ${before.style ?? '—'}  →  ${(meta.art && meta.art.style) || '—'}`);

if (flag('--dry-run')) {
  console.log('\n   --dry-run: meta updated; would now run tools/art-sprites.mjs --force + validate. Stopping.');
  process.exit(0);
}

// ── regenerate the sprite via the proven pipeline (it validates internally) ──
console.log('\n   regenerating sprite sheet (tools/art-sprites.mjs --force)…');
try {
  execFileSync('node', [path.join(here, 'art-sprites.mjs'), gameDir, '--force'], { stdio: 'inherit' });
} catch (e) {
  console.error('   ✗ generation/validation failed — NOT committing.');
  process.exit(1);
}

// ── optional: commit the regenerated art in the game repo ──
if (flag('--commit')) {
  try {
    execFileSync('git', ['-C', gameDir, 'add', '-A'], { stdio: 'inherit' });
    const msg = '🎨 art: handle in-game note — ' + (instruction || 'hero edit').slice(0, 72);
    execFileSync('git', ['-C', gameDir, 'commit', '-m', msg], { stdio: 'inherit' });
    console.log('   ✓ committed regenerated art');
  } catch (e) { console.error('   (commit skipped: ' + (e.message || e) + ')'); }
}

// ── optional: dismiss the handled note on the live game ──
if (flag('--dismiss') && val('--from')) {
  const token = process.env.NOTES_GH_TOKEN;
  if (!token) console.error('   (--dismiss needs NOTES_GH_TOKEN — skipped)');
  else {
    const base = val('--from').replace(/\/$/, '');
    const r = await fetch(base + '/api/notes?id=' + encodeURIComponent(note.id), { method: 'DELETE', headers: { 'x-admin-token': token } });
    console.log('   dismiss note #' + note.id + ' → ' + (r.ok ? 'closed' : 'HTTP ' + r.status));
  }
}

console.log('\n✅ handled — the game now carries the regenerated art. (Push the game repo to deploy.)');

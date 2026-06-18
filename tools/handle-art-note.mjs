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
const scope = note.scope || {};
// scope-aware: hero/enemy → sprite sheets; tile → ground texture; prop → object.
// (legacy notes used scope.char='hero'.)
const kind = prop.kind || scope.kind || (scope.char ? 'hero' : 'hero');
const key = prop.key || scope.key || scope.char || 'hero';
const desc = prop.desc || prop.hero || null;
const style = prop.style || (prop.art && prop.art.style) || null;
const instruction = prop.instruction || note.text || '';
const GEN = { hero: 'art-sprites.mjs', enemy: 'art-sprites.mjs', tile: 'art-tiles.mjs', prop: 'art-props.mjs' };
const generator = prop.generator || GEN[kind] || 'art-sprites.mjs';

console.log(`\n🎨 handle-art-note · ${gameDir}`);
console.log(`   note #${note.id || '—'} · ${kind} "${key}"`);
console.log(`   instruction: ${instruction}`);

// ── apply the proposal to GAME_META.json (scope-aware) ──
const metaPath = path.join(gameDir, 'GAME_META.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
if (!meta.art || typeof meta.art !== 'object') meta.art = meta.art ? { style: String(meta.art) } : {};
if (style) meta.art.style = style;

// update the key+desc descriptor list (enemies/tiles/props) for the chosen asset
function setDesc(listName) {
  const arr = Array.isArray(meta.art[listName]) ? meta.art[listName] : (meta.art[listName] = []);
  let e = arr.find((x) => x.key === key);
  if (!e) { e = { key }; arr.push(e); }
  const was = e.desc; if (desc) e.desc = desc;
  return was;
}
let changed;
if (kind === 'hero') { const was = meta.hero; if (desc) meta.hero = desc; changed = `meta.hero: ${was ?? '—'} → ${meta.hero ?? '—'}`; }
else if (kind === 'enemy') { const was = setDesc('enemies'); changed = `enemy "${key}": ${was ?? '—'} → ${desc ?? '(unchanged)'}`; }
else if (kind === 'tile')  { const was = setDesc('tiles');   changed = `tile "${key}": ${was ?? '—'} → ${desc ?? '(unchanged)'}`; }
else if (kind === 'prop')  { const was = setDesc('props');   changed = `prop "${key}": ${was ?? '—'} → ${desc ?? '(unchanged)'}`; }
else { changed = `(unknown kind "${kind}" — style only)`; }
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log(`   ${changed}`);
console.log(`   art.style: ${meta.art.style ?? '—'}`);

if (flag('--dry-run')) {
  console.log(`\n   --dry-run: meta updated; would now run tools/${generator} --force + validate. Stopping.`);
  process.exit(0);
}

// ── regenerate via the proven pipeline (sprites validate internally) ──
const genArgs = [path.join(here, generator), gameDir, '--force'];
// bring-your-own-art: seed the HERO identity from the note's uploaded image
if (kind === 'hero' && note.upload) {
  const m = String(note.upload).match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
  if (m) {
    const ext = (m[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
    const upPath = path.join(gameDir, '.ide-upload.' + ext);
    fs.writeFileSync(upPath, Buffer.from(m[2], 'base64'));
    genArgs.push('--ref', upPath);
    console.log('   seeding hero from uploaded art (' + path.basename(upPath) + ')');
  }
}
console.log(`\n   regenerating (tools/${generator}${genArgs.includes('--ref') ? ' --ref <upload>' : ''} --force)…`);
try {
  execFileSync('node', genArgs, { stdio: 'inherit' });
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

/* Minimal Express host implementing the hub convention contracts
 * (/health, /api/meta, /api/diary, /api/config, /api/notes) + static game. */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DATA = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
app.use(express.json({ limit: '2mb' }));   // notes carry a small JPEG screenshot — the 100kb default is too small

const read = (f, d) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch { return d; } };
const notesFile = path.join(DATA, 'notes.json');
const notes = () => { try { return JSON.parse(fs.readFileSync(notesFile, 'utf8')); } catch { return []; } };

// ── notes → GitHub issues (automatic) ──────────────────────────────────────
// Every in-game note becomes a tracked GitHub issue. Opt-in per deploy via env:
//   NOTES_GH_REPO = "owner/repo"   NOTES_GH_TOKEN = a PAT with issues:write
// Fire-and-forget (the note is already saved); the issue number is stored back
// on the note so it's never double-promoted. Best-effort: failures never break
// note-taking, and without the env vars it's a no-op (the template stays safe).
let _labelTried = false;
async function ghIssue(note) {
  const repo = process.env.NOTES_GH_REPO, token = process.env.NOTES_GH_TOKEN;
  const text = ((note && note.text) || '').trim();
  if (!repo || !token || text.length < 3 || note.issue) return;
  const H = { Authorization: 'token ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'studio-notes', 'Content-Type': 'application/json' };
  try {
    if (!_labelTried) { _labelTried = true; await fetch('https://api.github.com/repos/' + repo + '/labels', { method: 'POST', headers: H, body: JSON.stringify({ name: 'in-game-note', color: 'ff5d8f', description: 'A note left in-game by the owner' }) }).catch(() => {}); }
    const first = text.split('\n')[0];
    const title = '📝 ' + (first.length > 70 ? first.slice(0, 69) + '…' : first);
    const where = [note.level != null ? 'Level ' + note.level : '', note.kind || 'in-game'].filter(Boolean).join(' · ');
    const body = '> ' + text.replace(/\n/g, '\n> ') + '\n\n---\n_Left in-game (' + where + ') on ' + (note.created_at || '') + '._' + (note.shot ? '\n_(a screenshot was captured in-game — see the build diary.)_' : '');
    const r = await fetch('https://api.github.com/repos/' + repo + '/issues', { method: 'POST', headers: H, body: JSON.stringify({ title, body, labels: ['in-game-note'] }) });
    if (!r.ok) return;
    const j = await r.json();
    const all = notes(), i = all.findIndex((x) => x.id === note.id);
    if (i >= 0) { all[i].issue = j.number; all[i].issueUrl = j.html_url; fs.writeFileSync(notesFile, JSON.stringify(all, null, 2)); }
  } catch (e) { /* the note is saved regardless; promotion is best-effort */ }
}

app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/api/meta', (_, res) => res.type('application/json').send(read('GAME_META.json', '{}')));
app.get('/api/diary', (_, res) => res.type('text/markdown').send(read('DIARY.md', '# Diary')));
app.get('/api/config', (_, res) => res.json({ engine: 'studio-phaser4', phaser: '4.1.0', renderer: 'webgl-canvas' }));
app.get('/api/notes', (_, res) => res.json(notes()));
app.post('/api/notes', (req, res) => {
  const n = notes(), b = req.body || {};
  const shot = (typeof b.shot === 'string' && b.shot.length < 500000) ? b.shot : null;   // keep only a small JPEG screenshot
  const note = { id: Date.now(), ...b, shot, created_at: b.created_at || new Date().toISOString() };
  n.push(note);
  fs.writeFileSync(notesFile, JSON.stringify(n, null, 2));
  res.json({ ok: true });
  ghIssue(note);   // → auto-create a GitHub issue (a no-op unless NOTES_GH_* env is set)
});

app.use(express.static(path.join(__dirname, 'src')));
app.listen(PORT, () => console.log('studio game-template on :' + PORT));

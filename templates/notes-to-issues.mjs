// ── Notes → GitHub issues (own repo + upstream cross-filing) ─────────────────
// Turn the in-game design notes (/api/notes) into GitHub issues. The structure
// (so every fix stays tractable):
//   • EVERY note → an issue in THIS GAME'S OWN repo (auto-detected from the git
//     remote, not hardcoded). This was the bug — it used to file into jazz.
//   • If a note's fix is against SHARED code (the engine, the harness, the
//     platformer, or another game), file a linked issue in THAT repo too, via
//     UPSTREAM_REPOS — so the root cause is tracked where it actually lives.
//
//   GH_TOKEN=... node tools/notes-to-issues.mjs                 (own repo)
//   GH_TOKEN=... UPSTREAM_REPOS=agadabanka/game-engine node tools/notes-to-issues.mjs
//   REPO=owner/name BASE=http://127.0.0.1:3351 DRY=1 ...        (overrides)
import { execSync } from 'node:child_process';

const TOKEN = process.env.GH_TOKEN;
const DRY = process.env.DRY === '1';
if (!TOKEN) { console.error('set GH_TOKEN'); process.exit(2); }

// own repo: explicit env, else derive from `git remote get-url origin`.
function ownRepo() {
  if (process.env.REPO) return process.env.REPO;
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const m = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(url);
    if (m) return m[1];
  } catch {}
  throw new Error('cannot determine repo — set REPO=owner/name');
}
const REPO = ownRepo();
const UPSTREAM = (process.env.UPSTREAM_REPOS || '').split(',').map((s) => s.trim()).filter(Boolean);
const BASE = process.env.BASE || process.env.GAME_URL || 'https://game-production-3243.up.railway.app';

const ghRepo = (repo, path, opt = {}) => fetch(`https://api.github.com/repos/${repo}${path}`, {
  ...opt, headers: { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(opt.headers || {}) },
});

async function alreadyFiled(repo) {
  const existing = await ghRepo(repo, '/issues?state=all&per_page=100&labels=playtest-note').then((r) => r.json()).catch(() => []);
  const filed = new Set();
  for (const iss of Array.isArray(existing) ? existing : []) {
    const m = /note-id:\s*([a-z0-9-]+)/i.exec(iss.body || ''); if (m) filed.add(m[1]);
  }
  return filed;
}

async function fileIssue(repo, title, body, extraLabels = []) {
  if (DRY) { console.log(`WOULD FILE [${repo}]: ${title}`); return null; }
  const res = await ghRepo(repo, '/issues', { method: 'POST', body: JSON.stringify({ title, body, labels: ['bug', 'playtest-note', ...extraLabels] }) });
  if (res.ok) { const j = await res.json(); console.log(`filed ${repo}#${j.number}: ${title}`); return j; }
  console.error(`FAIL [${repo}]`, res.status, (await res.text()).slice(0, 140)); return null;
}

const notes = await fetch(`${BASE}/api/notes`).then((r) => r.json()).then((j) => j.notes || []).catch(() => []);
console.log(`repo: ${REPO} · upstream: ${UPSTREAM.join(', ') || '(none)'} · notes: ${notes.length} (from ${BASE})`);
if (!notes.length) { console.log('nothing to file — leave notes in-game (⏸ Pause → 📝).'); process.exit(0); }

const filedOwn = await alreadyFiled(REPO);
let made = 0;
for (const n of notes) {
  if (n.id && filedOwn.has(n.id)) { console.log(`skip (filed): ${n.id}`); continue; }
  const oneLine = (n.text || '').split('\n')[0].slice(0, 70);
  const where = [n.level != null ? `World/Level ${n.level}` : null, n.tileC != null ? `tile ${n.tileC}` : null].filter(Boolean).join(' · ');
  const title = `[playtest] ${oneLine || 'note'}${where ? ` (${where})` : ''}`;
  const body = `**From an in-game note** (${n.kind || 'note'})\n\n> ${(n.text || '').replace(/\n/g, '\n> ')}\n\n`
    + `- where: ${where || 'n/a'}${n.x != null ? ` · x=${n.x}` : ''}\n- when: ${n.created_at || '?'}\n\n_note-id: ${n.id}_`;
  const created = await fileIssue(REPO, title, body);
  if (created || DRY) made++;
  // cross-file the root cause upstream (shared engine/harness/platformer/etc.)
  for (const up of UPSTREAM) {
    const upBody = `**Cross-filed from ${REPO}** — a playtest note whose fix is (or may be) against shared code that lives here.\n\n`
      + `> ${(n.text || '').replace(/\n/g, '\n> ')}\n\n`
      + (created ? `Downstream issue: ${created.html_url}\n` : '')
      + `\n_note-id: ${n.id}_ · _origin: ${REPO}_`;
    await fileIssue(up, `[upstream] ${oneLine} (from ${REPO})`, upBody, ['upstream']);
  }
}
console.log(`\ndone — ${made} note(s) filed in ${REPO}${UPSTREAM.length ? ` (+ cross-filed to ${UPSTREAM.join(', ')})` : ''}.`);

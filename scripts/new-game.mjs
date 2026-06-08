#!/usr/bin/env node
// ── "NEW GAME" ───────────────────────────────────────────────────────────────
// The button. One command scaffolds a fresh, fully-playable game from the proven
// base, rebrands it, writes its GAME_META.json (so the hub shows a rich card),
// creates its GitHub repo, pushes, and registers it with the mission-control hub.
//
//   node scripts/new-game.mjs "My Game" --tagline "..." --hero "..." --verb "..."
//
// Flags:
//   --tagline  one-line pitch            --hero  e.g. "a robot ninja"
//   --verb     e.g. "dash · slash"       --base  base repo (default agadabanka/the-platformer)
//   --owner    GitHub owner (default = the token's user)
//   --dir      where to scaffold (default /home/user/<slug>)
//   --hub      hub URL to register with (default $HUB_URL)
//   --private  create the repo private    --dry-run  scaffold locally, skip GitHub/push/register
//
// Needs GH_TOKEN. After it runs, finish the deploy with the printed Railway steps.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith('--'));
const flag = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);
if (!name) { console.error('usage: node scripts/new-game.mjs "My Game" [--tagline .. --hero .. --verb ..]'); process.exit(1); }

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tagline = flag('tagline', `A new game built on the game-engine.`);
const hero = flag('hero', 'your hero');
const verb = flag('verb', 'run · jump');
const baseRepo = flag('base', 'agadabanka/the-platformer');
const dir = flag('dir', `/home/user/${slug}`);
const hubUrl = flag('hub', process.env.HUB_URL || '');
const isPrivate = has('private');
const dryRun = has('dry-run');
const GH = process.env.GH_TOKEN;
if (!GH && !dryRun) { console.error('GH_TOKEN required (or use --dry-run)'); process.exit(1); }

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
const gh = async (route, method = 'GET', body) => {
  const r = await fetch(`https://api.github.com${route}`, {
    method, headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'game-engine' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${method} ${route} → ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};

console.log(`\n🎮 new game: "${name}"  (slug: ${slug})`);
console.log(`   base ${baseRepo} → ${dir}${dryRun ? '   [DRY RUN]' : ''}\n`);

// 1. clone the proven base (a complete, playable game)
if (fs.existsSync(dir)) { console.error(`✗ ${dir} already exists — pick another --dir or remove it.`); process.exit(1); }
const cloneUrl = GH ? `https://x-access-token:${GH}@github.com/${baseRepo}.git` : `https://github.com/${baseRepo}.git`;
console.log('• cloning base…');
run('git', ['clone', '--depth', '1', cloneUrl, dir]);
fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });

// 2. rebrand the safe, structural touch-points (name/description/title + fresh diary).
const edit = (rel, fn) => { const p = path.join(dir, rel); if (!fs.existsSync(p)) return; fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
edit('package.json', (s) => { const j = JSON.parse(s); j.name = slug; j.description = tagline; return JSON.stringify(j, null, 2) + '\n'; });
edit('README.md', (s) => `# ${name}\n\n> ${tagline}\n\n_Scaffolded from \`${baseRepo}\` with the **game-engine**. Re-skin the hero, verb, art, and music via the documented pipeline (see the engine's playbook), then deploy._\n\n---\n\n${s}`);

// 3. a fresh diary + the meta the hub reads
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(dir, 'DIARY.md'),
  `# ${name} — build diary\n\nNewest at the bottom. Viewable in-game at **/diary.html**.\n\n---\n\n### Day one — scaffolded from the engine (${today})\n- Created with \`new-game\` off \`${baseRepo}\`: a complete, playable platformer wired to the\n  whole stack (server/store/Gemini/Lyria · Phaser engine · level DSL + merge · the 0-death\n  gate, felt-fun, recorder, vision judge · in-game notes → diary → issues · the builder).\n- Next: re-skin the hero ("${hero}"), define the core verb ("${verb}"), generate the art\n  + a Lyria score, rework the worlds, and deploy. Leave notes in-game as you playtest.\n`);

const meta = {
  name, tagline, hero, verb,
  worlds: [], levelCount: null,
  controls: 'on-screen + keyboard', art: 'inherited base (re-skin me)', music: 'procedural (add Lyria)',
  engine: 'game-engine', builder: '/build.html', designLens: '/design.html',
  scaffolded_from: baseRepo, scaffolded_at: new Date().toISOString(),
};
fs.writeFileSync(path.join(dir, 'GAME_META.json'), JSON.stringify(meta, null, 2) + '\n');

// 3b. install the repo-agnostic notes-to-issues (the base ships one hardcoded to
// its own repo; a scaffolded game must file its in-game notes into ITS OWN repo,
// and cross-file shared-code fixes upstream). Keeps the feedback loop tractable.
try {
  const tmpl = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'templates', 'notes-to-issues.mjs');
  if (fs.existsSync(tmpl) && fs.existsSync(path.join(dir, 'tools'))) {
    fs.copyFileSync(tmpl, path.join(dir, 'tools', 'notes-to-issues.mjs'));
    console.log('• installed repo-agnostic notes-to-issues (files into the new repo, not the base).');
  }
} catch (e) { console.log('• (could not install notes-to-issues template:', e.message, ')'); }

// 4. fresh git history
run('git', ['init', '-q'], { cwd: dir });
run('git', ['add', '-A'], { cwd: dir });
run('git', ['commit', '-q', '--no-gpg-sign', '-m', `scaffold ${name} from ${baseRepo} via game-engine`], { cwd: dir });
run('git', ['branch', '-M', 'main'], { cwd: dir });
console.log('• rebranded + committed (fresh history).');

if (dryRun) {
  console.log(`\n✓ DRY RUN complete. Scaffolded at ${dir}`);
  console.log('  files written: package.json · README.md · DIARY.md · GAME_META.json');
  console.log('  (skipped: GitHub repo, push, hub registration)\n');
  process.exit(0);
}

// 5. create the GitHub repo + push
const owner = flag('owner') || (await gh('/user')).login;
console.log(`• creating GitHub repo ${owner}/${slug}…`);
let repoFull;
try {
  const repo = await gh('/user/repos', 'POST', { name: slug, description: tagline, private: isPrivate });
  repoFull = repo.full_name;
} catch (e) {
  // maybe owner is an org, or repo exists — try the org route, else surface it
  try { const repo = await gh(`/orgs/${owner}/repos`, 'POST', { name: slug, description: tagline, private: isPrivate }); repoFull = repo.full_name; }
  catch { throw e; }
}
run('git', ['remote', 'add', 'origin', `https://x-access-token:${GH}@github.com/${repoFull}.git`], { cwd: dir });
run('git', ['push', '-u', 'origin', 'main'], { cwd: dir });
console.log(`• pushed → https://github.com/${repoFull}`);

// 6. register with the hub (so it shows up on mission control immediately)
if (hubUrl) {
  try {
    const r = await fetch(`${hubUrl.replace(/\/$/, '')}/api/games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ADMIN_TOKEN ? { 'x-admin-token': process.env.ADMIN_TOKEN } : {}) },
      body: JSON.stringify({ id: slug, name, repo: repoFull, tagline, hero, verb }),
    });
    console.log(r.ok ? `• registered with hub ${hubUrl}` : `• hub registration returned ${r.status}`);
  } catch (e) { console.log(`• could not reach hub (${e.message}) — add it from the dashboard later.`); }
} else {
  console.log('• no --hub given: register it from the mission-control dashboard ("+ register game").');
}

console.log(`\n✓ "${name}" is live on GitHub. To deploy on Railway (one project per game):`);
console.log(`   see BOOTSTRAP.md §3–7 in the repo, or:`);
console.log(`   1) railway.com/new → Empty Project → connect ${repoFull}`);
console.log(`   2) add a volume at /data, set ANTHROPIC_API_KEY, generate a domain`);
console.log(`   3) set the game's live URL on the hub card so notes start flowing.\n`);

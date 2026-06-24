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
//   --verb     e.g. "dash · slash"       --base  base repo (default agadabanka/studio-game-template)
//   --owner    GitHub owner (default = the token's user)
//   --dir      where to scaffold (default /home/user/<slug>)
//   --hub      hub URL to register with (default $HUB_URL)
//   --public   create the repo PUBLIC     --dry-run  scaffold locally, skip GitHub/push/register
//              (game repos are PRIVATE by default — standing owner rule)
//   --local    scaffold from the vendored base in engine/game-template/ instead of cloning --base
//   --engine <phaser|claystone>  which engine to build on (default phaser). claystone =
//             the determinism-first, zero-dependency option, scaffolded via
//             agadabanka/claystone-engine (same Studio.* seam, headless 0-death gate).
//
// Needs GH_TOKEN. After it runs, finish the deploy with the printed Railway steps.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeMarkdown } from '../tools/lib/pipeline.mjs';

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith('--'));
const flag = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);
if (!name) { console.error('usage: node scripts/new-game.mjs "My Game" [--tagline .. --hero .. --verb ..]'); process.exit(1); }

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tagline = flag('tagline', `A new game built on the game-engine.`);
const hero = flag('hero', 'your hero');
const verb = flag('verb', 'run · jump');
const baseRepo = flag('base', 'agadabanka/studio-game-template');
const dir = flag('dir', `/home/user/${slug}`);
const hubUrl = flag('hub', process.env.HUB_URL || '');
// Standing owner rule: every created game repo is PRIVATE by default. `--public`
// is the only way to opt out (kept explicit so it can never be the silent default).
const isPrivate = !has('public');
const dryRun = has('dry-run');
const useLocal = has('local');
// Which engine to build on. Phaser (the proven base) stays the default; `--engine claystone`
// is the determinism-first option, scaffolded via the claystone-engine repo.
const engine = (flag('engine', 'phaser') || 'phaser').toLowerCase();
if (!['phaser', 'claystone'].includes(engine)) { console.error('✗ --engine must be phaser|claystone'); process.exit(1); }
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

// The vendored base lives in engine/game-template/ (a local, de-branded copy of
// agadabanka/studio-game-template). --local scaffolds from it instead of cloning.
const localBase = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'engine', 'game-template');

console.log(`\n🎮 new game: "${name}"  (slug: ${slug})`);
console.log(`   engine ${engine}${engine === 'phaser' ? ` · base ${useLocal ? 'engine/game-template (local)' : baseRepo}` : ' (claystone-engine)'} → ${dir}${dryRun ? '   [DRY RUN]' : ''}\n`);

// 1. acquire the game tree.
if (fs.existsSync(dir)) { console.error(`✗ ${dir} already exists — pick another --dir or remove it.`); process.exit(1); }

if (engine === 'claystone') {
  // OPTION: build on the determinism-first Claystone engine instead of Phaser. We clone
  // claystone-engine and delegate to its scaffolder, which writes a self-contained, playable
  // game (vendored engine/ · Canvas2D index.html · game.js on the Studio.* seam · headless
  // eval.mjs) plus package.json / README.md / DIARY.md / GAME_META.json (engine:"claystone").
  // --gate makes it self-verify the deterministic 0-death gate before we ever push.
  // Engine source: clone claystone-engine, OR reuse a local copy provided via
  // --claystone-src <dir> / $CLAYSTONE_SRC. The local path is the escape hatch for sandboxed
  // or offline environments where git transport to other repos is blocked (the GitHub API
  // still works, so the engine can be fetched as a tarball and pointed at here).
  const localSrc = flag('claystone-src', process.env.CLAYSTONE_SRC || '');
  let cstone, cstoneIsLocal = false;
  if (localSrc && fs.existsSync(path.join(localSrc, 'scripts', 'new-claystone-game.mjs'))) {
    cstone = path.resolve(localSrc); cstoneIsLocal = true;
    console.log(`• using local claystone-engine source: ${cstone}`);
  } else {
    cstone = path.join(os.tmpdir(), `claystone-engine-${Date.now()}`);
    const cUrl = GH ? `https://x-access-token:${GH}@github.com/agadabanka/claystone-engine.git`
                    : `https://github.com/agadabanka/claystone-engine.git`;
    console.log('• cloning claystone-engine (engine source)…');
    run('git', ['clone', '--depth', '1', cUrl, cstone]);
  }
  console.log('• scaffolding on Claystone (with the 0-death gate)…');
  run('node', [path.join(cstone, 'scripts', 'new-claystone-game.mjs'), name,
    '--hero', hero, '--tagline', tagline, '--verb', verb, '--dir', dir, '--gate'], { stdio: 'inherit' });
  if (!cstoneIsLocal) fs.rmSync(cstone, { recursive: true, force: true });
} else {
  if (useLocal) {
    if (!fs.existsSync(localBase)) { console.error(`✗ --local given but ${localBase} is missing.`); process.exit(1); }
    console.log('• copying vendored base from engine/game-template…');
    fs.cpSync(localBase, dir, { recursive: true });
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true }); // no-op if vendored copy has none
  } else {
    const cloneUrl = GH ? `https://x-access-token:${GH}@github.com/${baseRepo}.git` : `https://github.com/${baseRepo}.git`;
    console.log('• cloning base…');
    run('git', ['clone', '--depth', '1', cloneUrl, dir]);
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
  }

  // 2. rebrand the safe, structural touch-points (name/description/title + fresh diary).
  const edit = (rel, fn) => { const p = path.join(dir, rel); if (!fs.existsSync(p)) return; fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  edit('package.json', (s) => { const j = JSON.parse(s); j.name = slug; j.description = tagline; return JSON.stringify(j, null, 2) + '\n'; });
  edit('README.md', (s) => `# ${name}\n\n> ${tagline}\n\n_Scaffolded from \`${baseRepo}\` with the **game-engine**. Re-skin the hero, verb, art, and music via the documented pipeline (see the engine's playbook), then deploy._\n\n---\n\n${s}`);
  // analytics (a creation step): ship the eval-aware telemetry client with every
  // game, copied from the engine so it doesn't depend on the base repo carrying it.
  const telSrc = path.join(localBase, 'src', 'game', 'telemetry.js');
  if (fs.existsSync(telSrc)) {
    fs.mkdirSync(path.join(dir, 'src', 'game'), { recursive: true });
    fs.copyFileSync(telSrc, path.join(dir, 'src', 'game', 'telemetry.js'));
    edit('src/index.html', (s) => {
      if (s.includes('telemetry.js')) return s.replace("game: ''", `game: '${slug}'`);   // config already present → just stamp the slug
      const cfg = `  <script>\n    window.ANALYTICS = { game: '${slug}', posthogKey: 'phc_tbmWC7oDBVoamkb22JW5GnuPXmt7D9fWeH4b6iWmHPgz', posthogHost: 'https://us.i.posthog.com', trackUrl: 'https://hub-production-6d28.up.railway.app/api/track' };\n  </script>\n  <script src="./game/telemetry.js"></script>\n`;
      return s.includes('</body>') ? s.replace('</body>', cfg + '</body>') : s + '\n' + cfg;
    });
  }

  // 3. a fresh diary + the meta the hub reads
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(dir, 'DIARY.md'),
    `# ${name} — build diary\n\nNewest at the bottom. Viewable in-game at **/diary.html**.\n\n---\n\n### Day one — scaffolded from the engine (${today})\n- Created with \`new-game\` off \`${baseRepo}\`: a complete, playable platformer wired to the\n  whole stack (server/store/Gemini/Lyria · Phaser engine · level DSL + merge · the 0-death\n  gate, felt-fun, recorder, vision judge · in-game notes → diary → issues · the builder).\n- Next: re-skin the hero ("${hero}"), define the core verb ("${verb}"), generate the art\n  + a Lyria score, rework the worlds, and deploy. Leave notes in-game as you playtest.\n\n## The build plan — every step\nEach stage below is also a GitHub issue (created automatically), worked **strictly in order**.\nThe pinned **Build tracker** issue always names the next step.\n\n${treeMarkdown()}\n`);

  const meta = {
    name, tagline, hero, verb,
    worlds: [], levelCount: null,
    controls: 'on-screen + keyboard', art: 'inherited base (re-skin me)', music: 'procedural (add Lyria)',
    engine: 'game-engine', builder: '/build.html', designLens: '/design.html',
    scaffolded_from: baseRepo, scaffolded_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'GAME_META.json'), JSON.stringify(meta, null, 2) + '\n');
}

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
console.log(`• creating GitHub repo ${owner}/${slug} (${isPrivate ? 'private' : 'PUBLIC'})…`);
let repoFull;
try {
  const repo = await gh('/user/repos', 'POST', { name: slug, description: tagline, private: isPrivate });
  repoFull = repo.full_name;
} catch (e) {
  // maybe owner is an org, or repo exists — try the org route, else surface it
  try { const repo = await gh(`/orgs/${owner}/repos`, 'POST', { name: slug, description: tagline, private: isPrivate }); repoFull = repo.full_name; }
  catch { throw e; }
}
let pushed = false;
try {
  run('git', ['remote', 'add', 'origin', `https://x-access-token:${GH}@github.com/${repoFull}.git`], { cwd: dir });
  run('git', ['push', '-u', 'origin', 'main'], { cwd: dir });
  pushed = true;
  console.log(`• pushed → https://github.com/${repoFull}`);
} catch (e) {
  console.log(`• git push blocked (${String(e.message || e).split('\n')[0].slice(0, 100)}).`);
  console.log(`  Repo exists at https://github.com/${repoFull} — push the scaffold with the GitHub Contents/Git-Data API`);
  console.log(`  (e.g. in a sandbox where git transport is restricted but the API is reachable).`);
}

// 5b. create ALL pipeline issues + the pinned Build tracker (every stage × sub-steps, in order).
try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  run('node', [path.join(here, 'make-game-issues.mjs'), repoFull, '--game-dir', dir], { env: { ...process.env, GH_TOKEN: GH } });
  console.log('• created all pipeline issues + the pinned Build tracker (the build plan as ordered work items).');
} catch (e) { console.log(`• (could not create pipeline issues: ${String(e.message || e).slice(0, 120)} — run \`node scripts/make-game-issues.mjs ${repoFull}\` manually)`); }

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

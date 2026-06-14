// Issue-driven make-game — the pipeline as ENFORCED work items, not prose I can skip.
//
// Emits one GitHub issue per pipeline stage on the game's repo, each with a sharp
// ACCEPTANCE CRITERION (the deepfin quality bar). The agent then completes them ONE AT A
// TIME, closing an issue only when it genuinely meets the bar. An open issue = a step
// that isn't done — visible and un-skippable. Idempotent (matches by a [make-game:<stage>]
// marker), and closes stages that GAME_META.stages already marks 'done'.
//
//   node scripts/make-game-issues.mjs <owner/repo> [--game-dir <dir>] [--reopen]
// Needs GH_TOKEN. Use this as STEP 0 of every new game.
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const gameDir = process.argv.includes('--game-dir') ? process.argv[process.argv.indexOf('--game-dir') + 1] : null;
const GH = process.env.GH_TOKEN;
if (!repo || !GH) { console.error('usage: node scripts/make-game-issues.mjs <owner/repo> [--game-dir <dir>]  (needs GH_TOKEN)'); process.exit(2); }

const meta = gameDir && fs.existsSync(path.join(gameDir, 'GAME_META.json')) ? JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8')) : {};
const done = (meta.stages || {});

// The pipeline as work items, each with the BAR that defines "done".
const STAGES = [
  ['scaffold', 'Scaffold the game', 'Repo created, pushed, and registered on the hub; `eval.mjs` present and runnable.'],
  ['identity', 'Identity — name, hero, worlds', 'GAME_META has the hero, a tagline, and 5 distinctly-named worlds.'],
  ['levels', 'Levels — 5 RICH, distinct worlds', 'Five levels, each a DISTINCT biome with its own mechanics/hazards/verticality (NOT flat ground + gaps). Lint-clean via `tools/lib/levelkit`. The autopilot wins every level, 0 deaths.'],
  ['character', 'Character art — an animated hero (NOT a tinted blob)', 'The hero is a `Studio.Toon` rig (or a generated sprite sheet) with 6+ animation states (idle/run/jump/fall/land + reactions) and real personality — never the template’s tinted placeholder. Enemies have character too.'],
  ['feel', 'Feel — animation states + juice', 'Animation states driven by movement on hero AND enemies; hitstop/shake/flash tuned; particles on every event (pickup/land/bounce); an expressive HUD.'],
  ['art', 'Art — backdrops + title keyart', 'A Gemini backdrop per world + a title keyart, on-theme, bottom third kept gameplay-clean, NO text in the images. Wired into the game.'],
  ['music', 'Music — a Lyria loop per world', 'One Lyria loop per world + a title theme, mp3s in `src/assets/music`, wired so each level plays its own track.'],
  ['gate', 'Gate — eval GREEN (incl. the felt-gate)', 'Menu/human-path smoke test (0 page errors) + autopilot WINS every level, 0 deaths, deterministic, non-black on BOTH renderers, and the genre felt-gate passes (FUN≥70 and/or e.g. MIRTH≥65).'],
  ['deploy', 'Deploy — Railway live', 'Live URL with /health, /api/meta, /api/diary responding; a headless page renders non-black off the live URL.'],
  ['videos', 'Videos — per-level + YouTube', 'Each level’s autopilot run recorded to MP4 with its music, a montage built, uploaded to YouTube + a playlist created; links in GAME_META.'],
  ['shorts', 'Shorts — mobile vertical feed', 'Levels 1/3/5 recorded off the LIVE deploy (mobile-encoded), hosted, auto-wired into the hub feed; a mid-clip frame shows GAMEPLAY (not a menu).'],
  ['diary', 'Diary — the build log the owner reads', 'DIARY.md is rich (concept, engine investments, gotchas+fixes, the scorecard, links) and surfaces at /api/diary + on the hub.'],
  ['loop', 'Loop closed', 'Registered in hub/games.json with meta/videos/shorts; game repo (main) AND engine branch pushed; final reply lists repo · URL · playlist · diary · shorts.'],
];

async function gh(route, method = 'GET', body) {
  const r = await fetch(`https://api.github.com${route}`, {
    method, headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'make-game' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && r.status !== 422) console.error(`  gh ${method} ${route} → ${r.status}`);
  return r.json();
}

// existing pipeline issues, by stage marker
const existing = {};
for (let page = 1; page <= 5; page++) {
  const list = await gh(`/repos/${repo}/issues?state=all&per_page=100&page=${page}&labels=make-game`);
  if (!Array.isArray(list) || !list.length) break;
  for (const i of list) { const m = /\[make-game:([a-z]+)\]/.exec(i.title + ' ' + (i.body || '')); if (m) existing[m[1]] = i; }
}
// ensure the label exists (ignore failure if it already does)
await gh(`/repos/${repo}/labels`, 'POST', { name: 'make-game', color: 'ff5d8f', description: 'make-game pipeline stage' });

console.log(`\nmake-game issues · ${repo}\n`);
let open = 0;
for (let n = 0; n < STAGES.length; n++) {
  const [stage, title, accept] = STAGES[n];
  const isDone = done[stage] === 'done';
  const body = `**Stage ${n + 1}/${STAGES.length} — ${title}**  \n\`[make-game:${stage}]\`\n\n### Acceptance criteria (the bar — don't close until it's truly met)\n${accept}\n\n_Complete the stages in order; close this issue only with evidence (a screenshot, the green scorecard, the live link)._`;
  let issue = existing[stage];
  if (!issue) { issue = await gh(`/repos/${repo}/issues`, 'POST', { title: `${n + 1}. ${title}  [make-game:${stage}]`, body, labels: ['make-game'] }); }
  else { await gh(`/repos/${repo}/issues/${issue.number}`, 'PATCH', { body }); }
  // sync state to GAME_META (close done stages; leave the rest open)
  const want = isDone ? 'closed' : 'open';
  if (issue.number && issue.state !== want && !(want === 'open' && process.argv.includes('--no-reopen'))) {
    await gh(`/repos/${repo}/issues/${issue.number}`, 'PATCH', { state: want });
    issue.state = want;
  }
  if (issue.state === 'open') open++;
  console.log(`  ${issue.state === 'closed' ? '✓' : '○'} #${issue.number} ${title}`);
}
console.log(`\n${open} open stage(s) to complete, in order. Work them one at a time → close with evidence.`);
console.log(`Issues: https://github.com/${repo}/issues?q=label:make-game`);

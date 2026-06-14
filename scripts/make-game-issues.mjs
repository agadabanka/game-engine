// Issue-driven make-game — the pipeline as ENFORCED, ORDERED work items, not prose I can skip.
//
// Emits one GitHub issue per pipeline stage on the game's repo, each with a sharp
// ACCEPTANCE CRITERION (the deepfin quality bar), PLUS a single pinned "Build tracker"
// meta-issue that always names the NEXT step. The agent then completes them ONE AT A
// TIME, IN ORDER, closing an issue only when it genuinely meets the bar. An open issue =
// a step that isn't done — visible and un-skippable. Idempotent (matches by a
// [make-game:<stage>] marker), and closes stages that GAME_META.stages already marks 'done'.
//
//   node scripts/make-game-issues.mjs <owner/repo> [--game-dir <dir>] [--reopen]
//   node scripts/make-game-issues.mjs <owner/repo> [--game-dir <dir>] --next
//        → prints ONLY the next open stage (the one stage you're allowed to work on now)
//
// Needs GH_TOKEN. Use this as STEP 0 of every new game, and re-run after each stage closes.
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const gameDir = process.argv.includes('--game-dir') ? process.argv[process.argv.indexOf('--game-dir') + 1] : null;
const NEXT_ONLY = process.argv.includes('--next');
const GH = process.env.GH_TOKEN;
if (!repo || !GH) { console.error('usage: node scripts/make-game-issues.mjs <owner/repo> [--game-dir <dir>] [--next]  (needs GH_TOKEN)'); process.exit(2); }

const meta = gameDir && fs.existsSync(path.join(gameDir, 'GAME_META.json')) ? JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8')) : {};
const done = (meta.stages || {});

// The pipeline as work items, IN ORDER, each with the BAR that defines "done".
// The FINER pipeline (#48): the coarse 13 split to match the engine's design toolkit (tools/lib/*).
// Each new stage runs a real tool and leaves an artifact. Keys are [a-z]+ (the marker regex).
const STAGES = [
  ['scaffold', 'Scaffold the game', 'Repo created (PRIVATE), pushed, and registered on the hub; `eval.mjs` present and runnable. From the RICH base template (shell + Scale.FIT + touch + HUD/menu + mechanic runtime + art-ready Studio.Hero).'],
  ['identity', 'Identity — name, hero, worlds', 'GAME_META has the hero, a tagline, and 5 distinctly-named worlds.'],
  ['design', 'Design — intent + per-level FUN', 'Run `tools/design-pass.mjs`: per-level interest curve + FUN (engagement/dynamics/arc/flow), the MDA aesthetic + Schell lenses, and the signature mechanic per level (`tools/lib/{design,feelmodel,elements}`). Writes DESIGN.md + src/design.json; no level mostly dead-air.'],
  ['story', 'Story — premise, protagonist, antagonist, beats', 'Run `tools/story.mjs --write`: STORY.md (premise who/what/why · protagonist arc · named antagonist/boss · one beat per world) + src/story.json; SHELL.beats feed the intro cards and the title surfaces the arc (`tools/lib/story`).'],
  ['cast', 'Cast — a named roster', 'Build the CAST (`tools/lib/cast`): hero + one named adversary per world + the boss, each a role + look + personality (CAST.md). Drives the art pipeline + HUD mood portraits.'],
  ['mechanics', 'Mechanics — a signature verb per level', 'Each level teaches ONE distinct mechanic (Studio.Mechanics: conveyor/dashpad/crumble/one-way/updraft/lowgrav + spring), placed by the builders (`tools/lib/builders`) via the signature rotation (`signatureFor`) + the difficulty ramp (`tools/lib/difficulty`). Autopilot-transparent; telegraphed.'],
  ['levels', 'Levels — 5 RICH, distinct worlds', 'Five levels, each a DISTINCT biome (NOT flat ground + gaps) built with the engine builders; reachability-clean (`tools/lib/reach`), lint-clean via `tools/lib/levelkit`. The autopilot wins every level, 0 deaths.'],
  ['funtune', 'Fun-tune — fun-max the campaign', 'Run `tools/fun-max.mjs --write` to hill-climb each level by the feel model under the 0-death safety proxy, then RE-GATE. Campaign mean FUN rises; no level mostly dead-air; the climax lands late (`tools/lib/{funmax,evolve}`).'],
  ['character', 'Character art — an animated hero (NOT a tinted blob)', 'The hero is a `Studio.Toon` rig (or a generated sprite sheet via `tools/art-sprites.mjs`) with 6+ animation states (idle/run/jump/fall/land + reactions) and real personality. Enemies have character too (the cast).'],
  ['feel', 'Feel — animation states + juice', 'Animation states driven by movement on hero AND enemies; hitstop/shake/flash tuned; particles on every event (pickup/land/bounce); an expressive HUD.'],
  ['art', 'Art — backdrops + title keyart', 'A Gemini backdrop per world + a title keyart (`tools/full-art.mjs`), on-theme, bottom third kept gameplay-clean, NO text in the images. Wired into the game.'],
  ['music', 'Music — a Lyria loop per world', 'One Lyria loop per world + a title theme, mp3s in `src/assets/music`, wired so each level plays its own track.'],
  ['narrative', 'Narrative coherence — primitives → fiction', 'Run `tools/lib/narrative`: every engine primitive the game uses maps to the world fiction (NARRATIVE.md, surfaced on /design); none generic ("void replaces the pit" bar).'],
  ['gate', 'Gate — eval + PARITY GREEN', 'Menu/human-path smoke (0 page errors) + autopilot WINS every level 0-death, deterministic, non-black on BOTH renderers, the genre felt-gate passes (FUN≥70 and/or MIRTH≥65), AND the parity gate (`tools/parity.mjs`) passes: menu + mobile + touch + real art + ≥K mechanics + ≥E enemy kinds + a story.'],
  ['deploy', 'Deploy — Railway live', 'Live URL with /health, /api/meta, /api/diary responding; a headless page renders non-black off the live URL.'],
  ['videos', 'Videos — per-level + YouTube', 'Each level’s autopilot run recorded to MP4 with its music, a montage built, uploaded to YouTube + a playlist created; links in GAME_META.'],
  ['shorts', 'Shorts — mobile vertical feed', 'Levels 1/3/5 recorded off the LIVE deploy (mobile-encoded), hosted as PRIVATE-repo Release assets (api.github.com asset URLs), auto-wired into the hub feed; a mid-clip frame shows GAMEPLAY (not a menu).'],
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
// GraphQL (only used to pin the tracker — there's no REST endpoint for pinned issues)
async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { Authorization: `bearer ${GH}`, 'User-Agent': 'make-game' },
    body: JSON.stringify({ query, variables }),
  });
  return r.json().catch(() => ({}));
}

// existing pipeline issues, by stage marker (incl. the tracker)
const existing = {};
for (let page = 1; page <= 5; page++) {
  const list = await gh(`/repos/${repo}/issues?state=all&per_page=100&page=${page}&labels=make-game`);
  if (!Array.isArray(list) || !list.length) break;
  for (const i of list) { const m = /\[make-game:([a-z]+)\]/.exec(i.title + ' ' + (i.body || '')); if (m) existing[m[1]] = i; }
}

// --next: print ONLY the lowest-numbered open stage (the single stage you may work now).
// This is the ORDER GUARD: the agent asks the repo "what's next?" instead of choosing.
if (NEXT_ONLY) {
  for (let n = 0; n < STAGES.length; n++) {
    const [stage, title] = STAGES[n];
    const iss = existing[stage];
    const isOpen = iss ? iss.state === 'open' : done[stage] !== 'done';
    if (isOpen) { console.log(`${n + 1}. ${title}  [make-game:${stage}]${iss ? `  (#${iss.number})` : ''}`); process.exit(0); }
  }
  console.log('ALL STAGES DONE — every make-game issue is closed.');
  process.exit(0);
}

// ensure the label exists (ignore failure if it already does)
await gh(`/repos/${repo}/labels`, 'POST', { name: 'make-game', color: 'ff5d8f', description: 'make-game pipeline stage' });

console.log(`\nmake-game issues · ${repo}\n`);
const rows = []; // { n, stage, title, number, state }
for (let n = 0; n < STAGES.length; n++) {
  const [stage, title, accept] = STAGES[n];
  const isDone = done[stage] === 'done';
  const body = `**Stage ${n + 1}/${STAGES.length} — ${title}**  \n\`[make-game:${stage}]\`\n\n### Acceptance criteria (the bar — don't close until it's truly met)\n${accept}\n\n_Work the stages **in order** (lowest-numbered open issue first). Close this issue only with evidence (a screenshot, the green scorecard, the live link)._`;
  let issue = existing[stage];
  if (!issue) { issue = await gh(`/repos/${repo}/issues`, 'POST', { title: `${n + 1}. ${title}  [make-game:${stage}]`, body, labels: ['make-game'] }); }
  else { await gh(`/repos/${repo}/issues/${issue.number}`, 'PATCH', { body }); }
  // sync state to GAME_META (close done stages; leave the rest open)
  const want = isDone ? 'closed' : 'open';
  if (issue.number && issue.state !== want && !(want === 'open' && process.argv.includes('--no-reopen'))) {
    await gh(`/repos/${repo}/issues/${issue.number}`, 'PATCH', { state: want });
    issue.state = want;
  }
  rows.push({ n: n + 1, stage, title, number: issue.number, state: issue.state });
  console.log(`  ${issue.state === 'closed' ? '✓' : '○'} #${issue.number} ${title}`);
}

// the NEXT actionable stage = the lowest-numbered OPEN one
const next = rows.find((r) => r.state === 'open');
// ORDER INVARIANT: a later stage closed while an earlier one is open == a SKIPPED step.
const outOfOrder = next ? rows.filter((r) => r.n > next.n && r.state === 'closed') : [];

// ── the pinned "Build tracker" meta-issue — always names the next step ───────────────
// This is the answer to "how do you do the steps in order?": a single, pinned, always-current
// checklist with a 👉 NEXT pointer, so the next step is never a matter of memory.
const doneCount = rows.filter((r) => r.state === 'closed').length;
const checklist = rows.map((r) =>
  `- [${r.state === 'closed' ? 'x' : ' '}] ${r.n}. ${r.title} — #${r.number}${next && r.number === next.number ? '   👈 **NEXT**' : ''}`
).join('\n');
const trackerBody = `# 🎯 Build tracker  \`[make-game:tracker]\`

Work the stages **strictly in order** — always the lowest-numbered OPEN issue below. Do **not**
start a later stage while an earlier one is open. Close a stage only with evidence that meets its bar.

${next ? `**👉 NEXT: #${next.number} — ${next.n}. ${next.title}**` : '**✅ ALL STAGES DONE.**'}

${checklist}

${outOfOrder.length ? `\n> ⚠️ **Out of order:** ${outOfOrder.map((r) => `#${r.number} (${r.title})`).join(', ')} ${outOfOrder.length === 1 ? 'is' : 'are'} closed while an earlier stage is still open. A later stage finished before an earlier one usually means a step was skipped — re-verify.\n` : ''}
_Progress: **${doneCount}/${rows.length}** stages done. Regenerate after each close: \`node scripts/make-game-issues.mjs ${repo}${gameDir ? ` --game-dir ${gameDir}` : ''}\`._`;

let tracker = existing['tracker'];
if (!tracker) {
  tracker = await gh(`/repos/${repo}/issues`, 'POST', { title: `🎯 Build tracker — work stages in order  [make-game:tracker]`, body: trackerBody, labels: ['make-game'] });
} else {
  await gh(`/repos/${repo}/issues/${tracker.number}`, 'PATCH', { body: trackerBody, state: next ? 'open' : 'closed' });
}
// pin it (best-effort; GraphQL only). Up to 3 pinned issues per repo.
if (tracker && tracker.node_id) { await gql(`mutation($id:ID!){ pinIssue(input:{issueId:$id}){ issue{ number } } }`, { id: tracker.node_id }).catch(() => {}); }

console.log(`\n${rows.filter((r) => r.state === 'open').length} open stage(s) — work them IN ORDER, one at a time → close with evidence.`);
if (next) console.log(`👉 NEXT: #${next.number} — ${next.n}. ${next.title}  (\`make-game:${next.stage}\`)`);
if (outOfOrder.length) console.log(`⚠️  out of order (later stage closed before an earlier one): ${outOfOrder.map((r) => `#${r.number}`).join(', ')}`);
if (tracker && tracker.number) console.log(`📌 Build tracker (pinned): https://github.com/${repo}/issues/${tracker.number}`);
console.log(`Issues: https://github.com/${repo}/issues?q=label:make-game`);

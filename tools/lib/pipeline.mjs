// tools/lib/pipeline.mjs — the make-game pipeline as a TREE (the single source of truth).
// Every stage (main step) + its sub-steps live here ONCE, and drive three things:
//   • the tree visualization (treeMarkdown / treeText / the rendered PNG)
//   • the per-game GitHub issues (scripts/make-game-issues.mjs reads PIPELINE)
//   • the diary (new-game embeds the tree; tools/pipeline-tree.mjs renders the image)
// Grouped into PHASES so the tree reads phase → stage → sub-step. Pure data + renderers.

export const PHASES = [
  ['setup', 'Set up', '#7cc6ff'],
  ['design', 'Design the game', '#ffd166'],
  ['make', 'Make it real', '#ff6f9c'],
  ['ship', 'Ship it', '#06d6a0'],
];

// each: { key, phase, title, sub:[…], accept }  — `accept` is the issue's bar.
export const PIPELINE = [
  { key: 'scaffold', phase: 'setup', title: 'Scaffold the game',
    sub: ['clone the rich base template', 'rebrand (package · README · DIARY)', 'write GAME_META.json', 'create + push the GitHub repo', 'register with the hub', 'create all pipeline issues'],
    accept: 'Repo created (PRIVATE), pushed, and registered on the hub; `eval.mjs` present and runnable. From the RICH base template (shell + Scale.FIT + touch + HUD/menu + mechanic runtime + art-ready Studio.Hero).' },
  { key: 'identity', phase: 'setup', title: 'Identity — name, hero, worlds',
    sub: ['name + tagline', 'hero / roster defs', '5 distinctly-named worlds'],
    accept: 'GAME_META has the hero, a tagline, and 5 distinctly-named worlds.' },
  { key: 'design', phase: 'design', title: 'Design — intent + per-level FUN',
    sub: ['run design-pass (per-level FUN)', 'interest curves + sparklines', 'a signature mechanic per level', 'DESIGN.md + design.json'],
    accept: 'Run `tools/design-pass.mjs`: per-level interest curve + FUN (engagement/dynamics/arc/flow), the MDA aesthetic + lenses, the signature mechanic per level (`tools/lib/{design,feelmodel,elements}`). No level mostly dead-air.' },
  { key: 'story', phase: 'design', title: 'Story — premise, protagonist, antagonist, beats',
    sub: ['premise (who / what / why)', 'protagonist arc', 'a named antagonist / boss', 'one beat per world → STORY.md'],
    accept: 'Run `tools/story.mjs --write`: STORY.md (premise · protagonist arc · named antagonist/boss · one beat per world) + src/story.json; SHELL.beats feed the intro cards, the title surfaces the arc (`tools/lib/story`).' },
  { key: 'cast', phase: 'design', title: 'Cast — a named roster',
    sub: ['hero + one adversary per world + boss', 'a role + look + personality each', 'CAST.md'],
    accept: 'Build the CAST (`tools/lib/cast`): hero + one named adversary per world + the boss, each a role + look + personality (CAST.md). Drives the art pipeline + HUD mood portraits.' },
  { key: 'mechanics', phase: 'design', title: 'Mechanics — a signature verb per level',
    sub: ['one distinct mechanic per level', 'Studio.Mechanics placements', 'difficulty ramp', 'autopilot-transparent + telegraphed'],
    accept: 'Each level teaches ONE distinct mechanic (Studio.Mechanics) placed by the builders (`tools/lib/builders`, `signatureFor`) ramped by `tools/lib/difficulty`. Autopilot-transparent; telegraphed.' },
  { key: 'levels', phase: 'design', title: 'Levels — 5 RICH, distinct worlds',
    sub: ['5 distinct biomes (not flat + gaps)', 'built with the engine builders', 'reachability-clean', 'autopilot wins every level 0-death'],
    accept: 'Five levels, each a DISTINCT biome built with the engine builders; reachability-clean (`tools/lib/reach`), lint-clean via `tools/lib/levelkit`. The autopilot wins every level, 0 deaths.' },
  { key: 'funtune', phase: 'design', title: 'Fun-tune — fun-max the campaign',
    sub: ['fun-max hill-climb', '0-death safety proxy', 're-gate after writing', 'campaign mean FUN rises'],
    accept: 'Run `tools/fun-max.mjs --write` to hill-climb each level by the feel model under the 0-death safety proxy, then RE-GATE. Mean FUN rises; the climax lands late (`tools/lib/{funmax,evolve}`).' },
  { key: 'character', phase: 'make', title: 'Character art — animated hero AND enemies (sprite SHEETS, legs alternate)',
    sub: ['locomotion as a 6-frame CYCLE sheet (legs scissor left/right)', 'action poses as a grid sheet (idle/jump/fall/land/hurt/cheer)', 'generated whole-sheet via tools/art-sprites.mjs (nano-banana-pro)', 'sliced by connected components; Studio.Hero adds only a subtle lean'],
    accept: 'Every actor — hero AND every enemy — is generated as coherent SPRITE SHEETS by `tools/art-sprites.mjs` (gemini-3-pro-image / nano-banana-pro): a **6-frame run/walk CYCLE drawn in ONE image so the legs visibly ALTERNATE** (per-pose generation can NOT keep a cycle consistent → it reads as hopping), plus an action-pose grid (idle/jump/fall/land/hurt/cheer for the hero; idle/hurt/hop/happy/turn/jump for enemies). Sheets are chroma-keyed + segmented by connected-component labelling, then packed. `Studio.Hero` keeps the procedural layer MINIMAL (a gentle lean + idle breathe + impact squash) because the bob/scissor lives in the ART. Never a tinted blob; legs alternate, not hop.' },
  { key: 'feel', phase: 'make', title: 'Feel — animation states + juice',
    sub: ['anim states on hero AND enemies', 'hitstop / shake / flash tuned', 'particles on every event', 'an expressive HUD'],
    accept: 'Animation states driven by movement on hero AND enemies; hitstop/shake/flash tuned; particles on every event (pickup/land/bounce); an expressive HUD.' },
  { key: 'art', phase: 'make', title: 'Art — backdrops + title keyart',
    sub: ['a backdrop per world', 'title keyart', 'sprite sheets + tiles + props', 'gameplay-clean, no text in images'],
    accept: 'One command: `node tools/full-art.mjs <dir>` (backdrops + title keyart + hero/enemy sheets + tiles + props from `GAME_META.art`, chroma-keyed + packed, `gencache`d). Bottom third gameplay-clean; NO text.' },
  { key: 'music', phase: 'make', title: 'Music — a Lyria loop per world',
    sub: ['a Lyria loop per world', 'a title theme', 'wired so each level plays its track'],
    accept: 'One Lyria loop per world + a title theme, mp3s in `src/assets/music`, wired so each level plays its own track.' },
  { key: 'narrative', phase: 'make', title: 'Narrative coherence — primitives → fiction',
    sub: ['map every used primitive → fiction', 'NARRATIVE.md', 'none generic ("void replaces the pit")'],
    accept: 'Run `tools/lib/narrative`: every engine primitive the game uses maps to the world fiction (NARRATIVE.md, surfaced on /design); none generic.' },
  { key: 'shots', phase: 'make', title: 'Shots — per-level menu thumbnails',
    sub: ['capture a clean in-game frame per level (tools/shots.mjs, local boot)', 'write src/assets/shots/level<N>.jpg', 'menu shows each world\'s screenshot (Studio.Shell.title auto-loads them)'],
    accept: 'Run `node tools/shots.mjs <dir>`: every level has a non-black screenshot at `src/assets/shots/level<N>.jpg`, and the level-select menu renders them (not flat color) — verify on the live deploy.' },
  { key: 'gate', phase: 'ship', title: 'Gate — eval + PARITY GREEN',
    sub: ['menu / human-path smoke (0 errors)', 'autopilot wins 0-death, both renderers', 'felt-gate (FUN≥70 / MIRTH≥65)', 'parity gate (tools/parity.mjs)'],
    accept: 'Menu/human-path smoke (0 page errors) + autopilot WINS every level 0-death, deterministic, non-black on BOTH renderers, the felt-gate passes, AND the parity gate (`tools/parity.mjs`) passes: menu + mobile + touch + real art + ≥3 mechanics + ≥2 enemy kinds + a story.' },
  { key: 'deploy', phase: 'ship', title: 'Deploy — Railway live',
    sub: ['Railway up (one project per game)', '/health · /api/meta · /api/diary', 'non-black off the live URL'],
    accept: 'Live URL with /health, /api/meta, /api/diary responding; a headless page renders non-black off the live URL.' },
  { key: 'videos', phase: 'ship', title: 'Videos — per-level + YouTube',
    sub: ['record each level (with music)', 'a montage', 'YouTube upload + a playlist', 'links in GAME_META'],
    accept: 'Each level’s autopilot run recorded to MP4 with its music, a montage built, uploaded to YouTube + a playlist created; links in GAME_META.' },
  { key: 'shorts', phase: 'ship', title: 'Shorts — mobile vertical feed',
    sub: ['record levels 1/3/5 (mobile-encoded)', 'host as private-repo Release assets', 'wire into the hub feed', 'a mid-clip frame shows GAMEPLAY'],
    accept: 'Levels 1/3/5 recorded off the LIVE deploy (mobile-encoded), hosted as PRIVATE-repo Release assets, auto-wired into the hub feed; a mid-clip frame shows GAMEPLAY (not a menu).' },
  { key: 'diary', phase: 'ship', title: 'Diary — the build log the owner reads',
    sub: ['concept + engine investments', 'gotchas + fixes', 'the scorecard + links', 'the pipeline tree'],
    accept: 'DIARY.md is rich (concept, engine investments, gotchas+fixes, the scorecard, the pipeline tree, links) and surfaces at /api/diary + on the hub.' },
  { key: 'loop', phase: 'ship', title: 'Loop closed',
    sub: ['register in hub/games.json', 'push game repo (main) + engine branch', 'final reply: repo · URL · playlist · diary'],
    accept: 'Registered in hub/games.json with meta/videos/shorts; game repo (main) AND engine branch pushed; final reply lists repo · URL · playlist · diary · shorts.' },
];

/** Stages grouped by phase, in order → [{ phase, title, color, stages:[…] }]. */
export function tree() {
  return PHASES.map(([key, title, color]) => ({ phase: key, title, color, stages: PIPELINE.filter((s) => s.phase === key) }));
}

/** A Markdown tree (renders in the diary). `done` = { stageKey: 'done' } marks ✓. */
export function treeMarkdown(done = {}) {
  const out = ['```', 'make-game · concept → shipped game'];
  const groups = tree();
  groups.forEach((g, gi) => {
    const lastG = gi === groups.length - 1;
    out.push(`${lastG ? '└─' : '├─'} ${g.title.toUpperCase()}`);
    g.stages.forEach((s, si) => {
      const n = PIPELINE.indexOf(s) + 1, mark = done[s.key] === 'done' ? '✓' : '○';
      const lastS = si === g.stages.length - 1;
      const gpipe = lastG ? '   ' : '│  ';
      out.push(`${gpipe}${lastS ? '└─' : '├─'} ${mark} ${n}. ${s.title}`);
      s.sub.forEach((sub, ui) => {
        const spipe = lastS ? '   ' : '│  ';
        out.push(`${gpipe}${spipe}${ui === s.sub.length - 1 ? '└' : '├'}· ${sub}`);
      });
    });
  });
  out.push('```');
  return out.join('\n');
}

/** A plain-text tree for the console. */
export function treeText(done = {}) { return treeMarkdown(done).replace(/^```.*$/gm, '').trim(); }

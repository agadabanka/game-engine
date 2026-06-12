// ── THE DEVELOPMENT PIPELINE ──────────────────────────────────────────────────
// The canonical stages every game built on the engine proceeds through, grouped
// into the THREE PHASES of the real workflow:
//   ① Design & build  → conceive it, build the levels, make it feel good, draw it, score it
//   ② Prove & ship     → the AI proves it (0-death gate), deploy it, film it
//   ③ Iterate          → the playbook + the notes→issues loop that improves it forever
// The hub owns this list — it's the engine's job to know what "done" means and to
// surface, per game, which stages are complete, which are weak, and which are todo.
//
// A game self-reports in GAME_META.json:  "stages": { "gate": "done", "feel": "weak", ... }
//   status ∈ "done" | "partial" | "weak" | "todo"   (absent = unknown)
// The hub also AUTO-DERIVES a few stages from live signals (deploy, videos, notes,
// diary) so the picture isn't purely self-reported — truth beats self-report.

export const PHASES = [
  { id: 'build', label: 'Design & build', hint: 'conceive · design · make it feel good · draw it · score it' },
  { id: 'ship',  label: 'Prove & ship',   hint: 'AI proves it (0-death) · deploy · film' },
  { id: 'loop',  label: 'Iterate',        hint: 'playbook · in-game notes → GitHub issues → fixes' },
];

export const STAGES = [
  { id: 'scaffold', phase: 'build', label: 'Scaffold',  hint: 'created from game-template' },
  { id: 'identity', phase: 'build', label: 'Identity',  hint: 'name · story · concept · system prompt (not placeholder)' },
  { id: 'levels',   phase: 'build', label: 'Levels',    hint: '5 levels, each with a distinct mechanic' },
  { id: 'feel',     phase: 'build', label: 'Feel',      hint: 'felt-fun design pass + particle FX (FUN score)' },
  { id: 'hero',     phase: 'build', label: 'Characters',hint: 'custom hero / cast sprites (not placeholder)' },
  { id: 'art',      phase: 'build', label: 'Art',       hint: 'concept art · backdrops · materials · UI' },
  { id: 'music',    phase: 'build', label: 'Music',     hint: 'a track per level' },
  { id: 'gate',     phase: 'ship',  label: '0-death',   hint: 'AI plays + evaluates — every level beatable at 0 deaths' },
  { id: 'deploy',   phase: 'ship',  label: 'Deploy',    hint: 'live on Railway' },
  { id: 'videos',   phase: 'ship',  label: 'Videos',    hint: 'AI playthroughs filmed + uploaded to YouTube' },
  { id: 'book',     phase: 'loop',  label: 'Book',      hint: 'illustrated PDF playbook' },
  { id: 'loop',     phase: 'loop',  label: 'Notes loop',hint: 'in-game notes → GitHub issues → fixes' },
];

const SCORE = { done: 1, partial: 0.5, weak: 0.5, todo: 0, unknown: 0 };
const VALID = new Set(['done', 'partial', 'weak', 'todo']);
// Normalize a self-reported stage value. Games use TWO conventions: the studio
// pipeline writes booleans (`"scaffold": true`), while the hub registry uses
// strings (`"gate": "done"`). Coerce both: true → done, falsy → todo, a known
// status string passes through, any other truthy value counts as done.
const normStatus = (v) => { if (v === true) return 'done'; if (!v) return 'todo'; const s = String(v); return VALID.has(s) ? s : 'done'; };

// Resolve each game's stage statuses: start from its declared GAME_META.stages,
// then let live signals override where the hub can see the truth directly.
export function resolveStages(snap) {
  const declared = (snap.meta && snap.meta.stages) || {};
  const out = {};
  for (const s of STAGES) out[s.id] = normStatus(declared[s.id]);

  // ── auto-derivation from live signals (truth beats self-report) ──
  out.scaffold = 'done';                                  // it's registered → it exists
  if (snap.live) out.deploy = 'done';                     // the deploy answered
  else if (out.deploy === 'done') out.deploy = 'partial'; // claimed live but not responding
  // videos: if the game actually carries uploaded clip links, it's DONE for real
  if (snap.videos && snap.videos.length) out.videos = 'done';
  else if (snap.meta && snap.meta.videos && Object.keys(snap.meta.videos).length) out.videos = 'done';
  if (snap.diary && snap.diary.count > 0 && out.loop === 'todo') out.loop = 'partial';
  if (snap.notes && snap.notes.total > 0) out.loop = out.loop === 'todo' ? 'partial' : out.loop;
  if (snap.meta && Array.isArray(snap.meta.worlds) && snap.meta.worlds.length && out.levels === 'todo') out.levels = 'done';

  const total = STAGES.length;
  const score = STAGES.reduce((a, s) => a + (SCORE[out[s.id]] ?? 0), 0);
  const doneCount = STAGES.filter((s) => out[s.id] === 'done').length;
  return {
    statuses: out,
    pct: Math.round((score / total) * 100),
    done: doneCount,
    total,
    next: STAGES.filter((s) => out[s.id] !== 'done').map((s) => s.id),
  };
}

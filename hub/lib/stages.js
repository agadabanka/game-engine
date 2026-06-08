// ── THE DEVELOPMENT PIPELINE ──────────────────────────────────────────────────
// The canonical stages every game built on the engine proceeds through. The hub
// owns this list — it's the engine's job to know what "done" means and to surface,
// per game, which stages are complete, which are weak, and which are still to do.
//
// A game self-reports in GAME_META.json:  "stages": { "gate": "done", "feel": "weak", ... }
//   status ∈ "done" | "partial" | "weak" | "todo"   (absent = unknown)
// The hub also AUTO-DERIVES a few stages from live signals (deploy, notes loop,
// diary) so the picture isn't purely self-reported.

export const STAGES = [
  { id: 'scaffold', label: 'Scaffold',  hint: 'created from game-template' },
  { id: 'identity', label: 'Identity',  hint: 'name · story · system prompt (not placeholder)' },
  { id: 'levels',   label: 'Levels',    hint: 'levels designed' },
  { id: 'gate',     label: '0-death',   hint: 'every level beatable at 0 deaths' },
  { id: 'feel',     label: 'Feel',      hint: 'felt-fun design pass (FUN score)' },
  { id: 'hero',     label: 'Hero',      hint: 'custom hero sprite (not placeholder)' },
  { id: 'art',      label: 'World art', hint: 'backdrops + materials' },
  { id: 'music',    label: 'Music',     hint: 'a track per world' },
  { id: 'deploy',   label: 'Deploy',    hint: 'live on Railway' },
  { id: 'videos',   label: 'Videos',    hint: 'AI playthroughs uploaded' },
  { id: 'book',     label: 'Book',      hint: 'illustrated PDF playbook' },
  { id: 'loop',     label: 'Notes loop',hint: 'in-game notes → GitHub issues' },
];

const SCORE = { done: 1, partial: 0.5, weak: 0.5, todo: 0, unknown: 0 };

// Resolve each game's stage statuses: start from its declared GAME_META.stages,
// then let live signals override where the hub can see the truth directly.
export function resolveStages(snap) {
  const declared = (snap.meta && snap.meta.stages) || {};
  const out = {};
  for (const s of STAGES) out[s.id] = declared[s.id] || 'todo';

  // ── auto-derivation from live signals (truth beats self-report) ──
  out.scaffold = 'done';                                  // it's registered → it exists
  if (snap.live) out.deploy = 'done';                     // the deploy answered
  else if (out.deploy === 'done') out.deploy = 'partial'; // claimed live but not responding
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

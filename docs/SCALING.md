# Scaling the Game Engine — Tracker

Living checklist for the "scale from one game to many" effort. Tick boxes as each
increment lands. Legend: `[x]` done · `[~]` in progress · `[ ]` not started.

> Grounded against the current code (June 2026). Key baseline facts:
> diary is **hand-written prose** (not generated); eval harness is solid & headless
> (`eval.mjs`); there is **no stage-runner** and **no general event system**;
> golden games are deployed but not cloned; SDK sync is manual.

## Keystone — build events & observability
The single foundation under 7.1's status checkmarks and 7.2's generated diary.
- [x] `tools/lib/buildlog.mjs` — structured stage events (`start/ok/fail/retry/skip`)
  → append-only `out/build-events.ndjson`, a checkmark **status report**, a generated
  **diary build-log** section, and `GAME_META.stages` updates. Typed (JSDoc) + tested
  (`buildlog.test.mjs`, 7/7 green).
- [ ] Wire the recorder/host tools to emit through it (later, as runner lands).

## 7.1 — Autonomous make-game runner (one command, not a session)
- [ ] `scripts/make-game.mjs` stage-runner: executes the pipeline headlessly with
      **checkpoints** (resume from `GAME_META.stages`), **auto-retry**, **status report**.
- [ ] Each stage = a typed contract `{ name, run(ctx), check(ctx), retries }`.
- [ ] Mechanical stages run unattended (scaffold, art, music, gate, deploy, videos,
      shorts, loop); creative stages (identity, levels, feel) take a supplied spec or
      an agent hook. Emits build events → live checkmarks.

## 7.2 — Skill → programmatic migration (prose → tested tools)
- [ ] **Diary as generated artifact** — emit a build-log section from events; PRESERVE
      the human narrative (augment, don't replace). *(decision pending owner — see note)*
- [ ] **Art/music as cached tools** — hash prompt/params; skip regen when cached.
- [ ] **Level-kit module** — reusable level-design heuristics (archetype scaffolds,
      balance checks, FUN seed-scan) on top of the existing `Studio.Level` DSL.
- [ ] **Stage-runner as code** — = 7.1.
- [ ] Observability/logging surfaced in console + diary (= keystone).

## 7.4 — Quality at scale (safety net BEFORE flooring throughput)
- [ ] **Golden games**: deepfin (platformer), grovekeep (town builder),
      roadwar-iso (iso RTS). Clone + vendor current SDK so their gate runs against
      engine changes.
- [ ] **Cross-game eval runner** `tools/eval-all.mjs` — gates on **golden set + current
      game** only (keeps CI fast), aggregates scorecards, exits non-zero on any red.
- [ ] **CI workflow** — run cross-game eval on engine/SDK changes; block merge on red.
- [ ] **Visual QA** — vision judge + screenshot diff vs golden baselines (catches black
      screens / broken menus / off-theme art).
- [ ] **SDK sync script + check** `scripts/sync-sdk.mjs` — propagate `engine/sdk/studio.js`
      to the template (and a CI check that they match).

## Suggested sequence
1. Keystone (events/observability) → 2. Golden games + cross-game eval (safety net) →
3. Stage-runner (7.1) → 4. Migrations (diary/art/music/level-kit).

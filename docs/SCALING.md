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

## 7.1 — Autonomous make-game runner (one command, not a session)  ← DONE
- [x] `scripts/make-game.mjs` stage-runner: executes the pipeline headlessly with
      **checkpoints** (resume from `GAME_META.stages`), **auto-retry** (`--retries`),
      **stop-on-fail** (+ `--from`/`--only` resume), and a **status report** + build board.
- [x] Each stage = a registry entry `{ detail, run(ctx), secret?, creative?, gate? }`.
- [x] Mechanical stages invoke the real tools; credential-gated ones (`GEMINI_SA_JSON`,
      `RAILWAY_TOKEN`, `YT_*`) **skip cleanly** when the secret is absent; creative stages
      (identity/levels/feel) verify authored content (an agent or `--spec` supplies it).
- [x] Emits build events → live checkmarks, build board, and an augmented DIARY build-log.
      `--dry-run` demos the whole orchestration (incl. a gate auto-retry). Verified 11/11.

## 7.2 — Skill → programmatic migration (prose → tested tools)
- [ ] **Diary as generated artifact** — emit a build-log section from events; PRESERVE
      the human narrative (augment, don't replace). *(decision pending owner — see note)*
- [ ] **Art/music as cached tools** — hash prompt/params; skip regen when cached.
- [ ] **Level-kit module** — reusable level-design heuristics (archetype scaffolds,
      balance checks, FUN seed-scan) on top of the existing `Studio.Level` DSL.
- [ ] **Stage-runner as code** — = 7.1.
- [ ] Observability/logging surfaced in console + diary (= keystone).

## 7.4 — Quality at scale (safety net BEFORE flooring throughput)  ← IN PROGRESS
- [x] **SDK sync script + check** `scripts/sync-sdk.mjs` — propagate `engine/sdk/studio.js`
      to the template; `--check` fails CI if stale.
- [x] **Golden games** `tools/golden-games.json` — deepfin (platformer), grovekeep
      (builder), roadwar-iso (iso RTS).
- [x] **Cross-game eval runner** `tools/eval-all.mjs` — gates the engine **game-template
      vs SDK HEAD** (direct engine-SDK regression) + each golden game's own gate.
      Aggregates scorecards, exits non-zero on red, renders an eval board.
- [x] **CI workflow** `.github/workflows/cross-game-eval.yml` — runs on engine/SDK
      changes, blocks merge on red. *(needs a repo secret `GH_TOKEN` to clone golden repos)*
- [x] **Visual boards** `tools/lib/render-board.mjs` — eval board + build board +
      pipeline board (the "nice visuals"); tied into eval-all.
- [x] **Visual QA** `tools/visual-qa.mjs` — SSIM of each gate's deterministic
      frame-200 `shot-webgl.png` vs a committed golden baseline (`tools/golden-baselines/`),
      fails on drift; `--update` re-baselines. Wired into CI. (Vision-judge/off-theme LLM
      pass can layer on later.)
- [ ] **Add a deepfin eval** — deepfin has no `eval.mjs` and its game.js doesn't set the
      `__ready` contract, so the platformer slot is gated via the engine game-template for
      now. Follow-up: commit an eval to the deepfin repo.

> **Architectural finding (shapes the net):** the SDK is NOT one shared file — there
> are ≥2 lineages. `engine/sdk/studio.js` (1064-line Brawl/Toon) underlies the
> game-template + engine-lineage games; grovekeep/roadwar-iso ship their OWN
> `Studio.Game.boot` SDK (~3200–3700 lines, in their repos). Deployed games freeze their
> vendored SDK, so an `engine/sdk/studio.js` edit can't retroactively break them — the
> **game-template is the true regression surface** for engine-SDK changes, and golden
> games are per-genre health checks (`sdk:"own"` = as-shipped). Consolidating the
> lineages onto one engine SDK is a future migration.

## Suggested sequence
1. Keystone (events/observability) → 2. Golden games + cross-game eval (safety net) →
3. Stage-runner (7.1) → 4. Migrations (diary/art/music/level-kit).

---
name: claystone-parity
description: Keep the Claystone engine + its game template in sync with the Phaser base (engine/game-template). Cross-compares the two, finds what the Claystone scaffold is missing (notes, server, diary, themed HUD, deploy config, evals…), backports it into agadabanka/claystone-engine, and re-verifies. Use whenever the Phaser base gains a feature, when a Claystone game is "missing" something the Phaser games have, or the user says "get claystone in sync / in parity / backport to claystone".
---

# claystone-parity — backport Phaser-base features into Claystone

Phaser (`engine/game-template`, the rich base) is where features land first. **Claystone**
(`agadabanka/claystone-engine`) is the determinism-first option and drifts behind — new Claystone
games come out missing notes, a server, diary, themed chrome, etc. This skill is the standing job
that closes that gap and keeps it closed.

## Access (this sandbox)
`git` is proxy-scoped to the current repo, so you can't clone/push `claystone-engine` over git —
but the **GitHub API works** (the token has push access). So:
- **Read it:** `curl -sSL -H "Authorization: token $GH_TOKEN" https://api.github.com/repos/agadabanka/claystone-engine/tarball -o e.tgz && tar xzf e.tgz` (or fetch single files via the contents API).
- **Write it:** push a commit with the Git-Data API (blobs → tree → commit → ref). A ready helper
  is at `scripts/push-api`-style usage; the same approach `new-game.mjs` documents for sandboxed pushes.
- Confirm push rights first: `GET /repos/agadabanka/claystone-engine` → `permissions.push === true`.

## Do this

1. **Diff the surfaces.** List `engine/game-template/` (Phaser base) and what
   `claystone-engine/scripts/new-claystone-game.mjs` actually writes. The recurring gaps:
   | Feature | Phaser base | Claystone scaffold | Backport |
   |---|---|---|---|
   | static server + API | `server.js` (`/health`,`/api/meta`,`/api/diary`,`/api/notes`) | ✗ | add a zero-dep `server.js` |
   | in-game notes | 📝 widget + `/api/notes` + auto-issue | ✗ | DOM note box → `/api/notes`; `toIssue()` |
   | notes→issues | `templates/notes-to-issues.mjs` installed into `tools/` | ✗ | scaffold `tools/notes-to-issues.mjs` |
   | diary page | `src/diary.html` | ✗ | add `diary.html` (fetch `/api/diary`) |
   | deploy config | `railway.json` | ✗ | add `railway.json` (start = `node server.js`) |
   | UI eval | `ui-test.mjs` | ✗ (only `eval.mjs`) | scaffold a `ui-test.mjs` |
   | themed HUD | `Studio.Shell` chrome | bare | bake a themed-DOM HUD baseline into the generated `index.html` |
   Phaser-Studio-only surfaces (`build.html` level builder, `design.html` lens, `Studio.Toon` rigs,
   sprite-sheet `art-sprites`) **don't port 1:1** — note them as Phaser-only, don't fake them.

2. **Backport into the SCAFFOLDER**, not just one game. Edit `new-claystone-game.mjs` so every new
   game gets the missing infra (write `server.js`, `diary.html`, `railway.json`, `tools/notes-to-issues.mjs`,
   a note widget + `/api/notes` wiring + a themed-DOM HUD baseline in `index.html`, and a `ui-test.mjs`).
   Keep it **zero-dependency** and **determinism-safe** (notes/UI are browser/server only; never touch
   the seeded sim or the headless gate).

3. **Backport the live engine too** when the gap is in `src/` (the `Studio.*` seam), not just the
   scaffold — e.g. a missing `Studio.Shell.note`. Add it on the `Studio` surface so games call it the
   same way as on Phaser.

4. **Re-verify.** Scaffold a throwaway game from the patched scaffolder (`--engine claystone --dry-run`
   or the engine's own `new-claystone-game.mjs`), then run its `node eval.mjs` (gate green, deterministic)
   AND `node ui-test.mjs` (UI eval green). Nothing ported may break the 0-death/0-illegal gate.

5. **Ship + record.** Push `claystone-engine` (API), and update `scripts/new-game.mjs` in game-engine
   if its claystone branch needs to stop skipping shared post-steps (e.g. the `tools/`-guarded
   notes-to-issues install). Note what was ported (and what stayed Phaser-only) in the PR/commit.

## Acceptance bar
A freshly-scaffolded Claystone game has, out of the box: a working `server.js` with
`/health · /api/meta · /api/diary · /api/notes`, an in-game 📝 note taker, `tools/notes-to-issues.mjs`,
a `diary.html`, `railway.json`, a themed HUD baseline, and a passing `node eval.mjs` + `node ui-test.mjs`.

## Notes
- This skill is **standing**: re-run it whenever `engine/game-template` gains something. Parity drifts
  the moment a feature lands on Phaser and not Claystone.
- Don't fake Phaser-only surfaces in Claystone — port what maps, document what doesn't.

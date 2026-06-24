---
name: new-game
description: Scaffold a brand-new game off the engine — clone the proven base, rebrand it, write its GAME_META.json, create its GitHub repo, push, and register it with the mission-control hub. Use when the user says "new game", "start a game", "scaffold a game", or names a game they want to build.
---

# new-game — the button

One command turns "I want to build X" into a fresh, playable, deployed-ready game
repo that's already wired to the whole stack and showing on the hub.

## Do this

1. **Token preflight — do this FIRST, before anything else.** A new game runs a long
   pipeline (scaffold → art → music → deploy → videos/upload); the worst outcome is
   getting most of the way and stalling on a credential. Catch it up front:
   ```bash
   node scripts/preflight-tokens.mjs
   ```
   It reports every credential the pipeline touches, grouped by the stage that needs it,
   and **validates the YouTube refresh token by actually exchanging it** (presence isn't
   enough — it's minted interactively and can expire/be revoked).
   - If it reports a **hard** credential missing (`GH_TOKEN`, Gemini), stop and get it
     before scaffolding — those stages can't run without it.
   - If the **YouTube refresh token** is missing or rejected (containers are ephemeral —
     `/tmp/yt-creds.json` is wiped when the box is reclaimed, so this is the common case
     on a fresh session), mint one NOW via the device flow so the videos/upload stage can
     run unattended at the end:
     ```bash
     YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/trailer/yt-auth.mjs
     ```
     It prints a code + `google.com/device` URL — **relay them to the user**, it polls
     until they authorize, then saves the token where `yt-upload.mjs` reads it. Re-run the
     preflight to confirm green before moving on.
   - Soft/optional gaps (`HUB_URL`, Lyria, `RAILWAY_TOKEN`) don't block scaffolding —
     note them to the user and continue (music falls back to procedural; deploy/register
     can be done manually).

2. **Get the essentials.** You need a name. Ideally also a one-line tagline, the
   **hero** (what you play), and the **core verb** (what you do). If the user only
   gave a name, infer sensible defaults and say so — don't block.

3. **Run the scaffolder** from the repo root:
   ```bash
   node scripts/new-game.mjs "<Name>" \
     --tagline "<one-liner>" --hero "<hero>" --verb "<verb>" \
     --hub "$HUB_URL"
   ```
   - Repos are **PRIVATE by default** (standing owner rule — every created game repo stays
     private). Pass `--public` only if explicitly asked. `--owner <org>` to place it elsewhere,
     `--base <owner/repo>` to scaffold from a different base.
   - Add `--dry-run` first if you want to preview the scaffold without touching
     GitHub — it writes the files locally and stops.
   - `--engine <phaser|claystone>` picks the engine (**default `phaser`**). Pass
     `--engine claystone` for the determinism-first, zero-dependency option — it scaffolds
     a self-contained, playable Claystone game (vendored engine + Canvas2D page + headless
     0-death `eval.mjs`) via `agadabanka/claystone-engine`, then runs the same GitHub/hub
     steps. See the **make-game-claystone** skill. Phaser stays the default.
   - Requires `GH_TOKEN`. The command prints the GitHub URL and the Railway deploy
     steps when done.

4. **Log the build as ISSUES on the new repo — then work against the repo.** Right after
   scaffolding, turn the whole make-game pipeline into enforced work items:
   ```bash
   node scripts/make-game-issues.mjs <owner/repo> --game-dir <dir>
   ```
   This opens one GitHub issue per stage (levels, character art, feel, art, music, gate,
   deploy, videos, shorts, diary, loop), each with its acceptance bar, PLUS a **pinned
   "Build tracker" meta-issue that always names the next step**. From here you
   **work against the repo, resolving issues one at a time, IN ORDER** — exactly the way you
   later work the notes→issues loop, except this time YOU file the issues. Don't pick the next
   stage from memory: run `node scripts/make-game-issues.mjs <owner/repo> --game-dir <dir> --next`
   to get the single stage you're allowed to work on now. Close an issue only with evidence that
   meets the bar; an open issue is a stage that isn't done. This is what stops stages from being
   silently skipped or done out of order.

5. **Confirm it landed.** Report the new repo URL, that it's registered on the hub, and the
   link to the pipeline issues. Then start resolving them top-down (re-skin the hero with a
   real `Studio.Toon` rig / sprite art, design rich themed levels, a Lyria score, …),
   deploying as its own Railway project (`BOOTSTRAP.md` in the new repo).

## What the new game already has
The **rich base** (`engine/game-template`): fullscreen + mobile + menued + art-ready
out of the box — Boot→Title→Play shell · Scale.FIT/full-bleed · on-screen touch ·
HUD + world-select menu · the `Studio.Mechanics` runtime (+ a sample) + `Studio.Enemies`
archetypes · manifest-driven `Studio.Hero` (generated sprite → Toon rig). Plus the
**design toolkit** (`tools/lib/*`, all unit-tested) the make-game pipeline drives:
elements/mechanics/difficulty/reach/feelmodel/design/evolve/funmax/builders + story/
cast/campaign/narrative/parity (see make-game's Levels + Gate stages).
Platform (server/store/gemini/lyria) · Phaser engine (scenes/materials/levelkit/
merge) · the level builder · the evaluation suite (0-death gate, felt-fun,
recorder, vision judge, game-diff/feel-judge) · the notes→diary→issues loop · the
`?level=N` level-jump contract (deep-link / record any level) · the **shorts feed**
(record with `tools/trailer/make-shorts.mjs`, host+wire with `host-shorts.mjs`; it
plays in the hub's mobile shorts player with reliable sound + buffering — all
inherited, see `docs/ENGINE.md`). You don't rebuild any of it — you re-skin the
surface and design levels.

## Notes
- Don't fabricate a game the user didn't ask for. If no name is given, ask for one.
- The hub URL lives in `$HUB_URL`; if it's unset, the game still scaffolds and
  pushes — just tell the user to add it from the dashboard's "+ register game".

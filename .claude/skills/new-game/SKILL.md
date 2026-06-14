---
name: new-game
description: Scaffold a brand-new game off the engine — clone the proven base, rebrand it, write its GAME_META.json, create its GitHub repo, push, and register it with the mission-control hub. Use when the user says "new game", "start a game", "scaffold a game", or names a game they want to build.
---

# new-game — the button

One command turns "I want to build X" into a fresh, playable, deployed-ready game
repo that's already wired to the whole stack and showing on the hub.

## Do this

1. **Get the essentials.** You need a name. Ideally also a one-line tagline, the
   **hero** (what you play), and the **core verb** (what you do). If the user only
   gave a name, infer sensible defaults and say so — don't block.

2. **Run the scaffolder** from the repo root:
   ```bash
   node scripts/new-game.mjs "<Name>" \
     --tagline "<one-liner>" --hero "<hero>" --verb "<verb>" \
     --hub "$HUB_URL"
   ```
   - Add `--private` for a private repo, `--owner <org>` to place it elsewhere,
     `--base <owner/repo>` to scaffold from a different base.
   - Add `--dry-run` first if you want to preview the scaffold without touching
     GitHub — it writes the files locally and stops.
   - Requires `GH_TOKEN`. The command prints the GitHub URL and the Railway deploy
     steps when done.

3. **Confirm it landed.** Report the new repo URL and that it's registered on the
   hub. Then point at the next move: re-skin the top tier (hero art via the image
   pipeline, a Lyria score, the worlds, the system prompt) and deploy as its own
   Railway project (`BOOTSTRAP.md` in the new repo).

## What the new game already has
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

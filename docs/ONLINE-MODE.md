# Online Mode — the games evolve while people play

Online mode closes the notes → fixes loop **without a human session**: the hub runs the
same agent workflow we run offline (the `fix-notes` skill), and the games surface it to
the player as friendly notifications instead of an abrupt Railway restart.

```
player leaves a 📝/🎙️ note in-game
        │ (game server files it as an `in-game-note` GitHub issue — existing loop)
        ▼
hub · POST /api/online/<game>/run          (or ONLINE_AUTO polling)
        │ take open note-issues off the queue
        ▼
hub agent worker (hub/lib/online.js, Claude Agent SDK)
        │ clone repo → work branch online/<job> → fix notes → commit
        ▼
merge → push default branch ───────────► Railway auto-deploys the game
        │                                        │
        ▼                                        ▼
✅ comment + close each issue            game's /api/version changes
  (this IS the diary ledger entry —              │
   fixlogRefresh renders it on boot)             ▼
                                     update-shell in every open client:
                                     "🚀 Update ready — tap to reload"
```

While the agent works, the shell also polls the hub's status feed and shows the player
**what is being processed**: `🤖 Live dev — working on your notes: <note title>`, then
`✅ N note(s) fixed — new build on its way`.

## Hub API

| Route | Auth | What |
|---|---|---|
| `POST /api/online/:game/run` | `x-admin-token` | Queue a run: fetch the game's open note issues, run the agent, merge, deploy, close. |
| `GET /api/online/status[?game=]` | none, CORS `*` | `{enabled, reasons?, active, queue, jobs}` — what's running / recently ran. This is what the in-game shell polls. |
| `GET /api/online/:game/queue` | none | The open note issues a run would pick up. |

Job shape (in `active`/`queue`/`jobs`): `{id, game, repo, status: queued|running|merging|deployed|failed,
phase: clone|agent|gate|merge|push|close|done, issues: [{n, title, url, state: queued|fixing|fixed|skipped}],
mergeSha, error, costUsd}`.

## Hub configuration (Railway env)

| Var | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required.** Without it `/api/online/status` reports `enabled:false` and runs refuse. |
| `GH_TOKEN` | — | **Required** (already set for the dashboard): clone/push + issue comments/close. |
| `ONLINE_MODEL` | `claude-opus-4-8` | Agent model. |
| `ONLINE_MAX_ISSUES` | `5` | Notes per run (oldest first). |
| `ONLINE_MAX_TURNS` | `150` | Agent turn cap. |
| `ONLINE_TIMEOUT_MS` | 25 min | Hard wall on the agent step. |
| `ONLINE_LABELS` | `in-game-note,note,playtest-note` | Issue labels treated as notes. |
| `ONLINE_GATE` | off | `1` → run `node eval.mjs --no-cache` in the clone before merging (needs a browser in the hub image; when off, the ✅ comment says CI/gate verifies post-merge). |
| `ONLINE_AUTO` | off | `*` or `game-a,game-b` → poll for open notes and self-enqueue. |
| `ONLINE_POLL_MS` | 5 min | Auto-mode poll interval. |

Jobs run **one at a time** (two agents on one repo would race). History (last 30 jobs)
persists in the volume store under `online:jobs`. The worker degrades gracefully: missing
key/SDK/git → online mode reports itself disabled with reasons, everything else on the hub
keeps working.

The agent itself runs with `Bash/Read/Write/Edit/Glob/Grep` only, loads the game repo's
`CLAUDE.md` (same context the offline loop gets), never pushes and never touches GitHub —
the pipeline owns merge/push/close, and `GH_TOKEN`/`NOTES_GH_TOKEN`/`ADMIN_TOKEN` are
stripped from its environment. Its `✅` closing comments follow the fix-notes contract
(owner's words → root cause → what shipped → caveats) so each game's programmatic diary
ledger picks them up on the post-deploy boot.

## The in-game notification shell (all games)

`engine/sdk/update-shell.js` is the source of truth, synced by `npm run sync-sdk` into the
template vendor dir (like `studio.js`) and vendored per game. Every game also serves
**`GET /api/version`** → `{ok, version, booted_at}` where `version` is
`RAILWAY_GIT_COMMIT_SHA` (fallback deployment id / boot time), so the served version
changes exactly when a deploy lands.

The shell:
- polls its own `/api/version` (~25 s, paused when the tab is hidden). On change it shows a
  persistent **"🚀 Update ready — tap to reload"** pill; the page reloads **only on tap**
  (never yank a player mid-jump — Railway's zero-downtime swap keeps the old build serving
  until then).
- polls the hub's `/api/online/status?game=<id>` (~40 s) and shows the live-dev toasts
  (which note is being fixed, when fixes ship, honest failure note).
- config: zero for engine games (game id from `window.UPDATE_SHELL` → `ANALYTICS.game` →
  `/api/meta`; hub from `UPDATE_SHELL.hub` → `ANALYTICS.trackUrl` origin → prod default).
- safety contract: **no-op under `?auto`** (the eval gate never sees it), never throws,
  never logs errors, never auto-reloads.

Rolled out to: engine/game-template (template), studio-game-template (clone target),
rainbow-run, game-template (jazz), claystone-platformer, jenga, and the claystone-engine
parity base + scaffolder (new claystone games get it automatically).

## Trying it

```bash
# what would a run pick up?
curl -s https://<hub>/api/online/rainbow-run/queue | jq .

# kick a run (hub needs ANTHROPIC_API_KEY set)
curl -s -X POST -H "x-admin-token: $ADMIN_TOKEN" https://<hub>/api/online/rainbow-run/run | jq .

# watch it (this is exactly what the game clients poll)
watch -n 5 'curl -s "https://<hub>/api/online/status?game=rainbow-run" | jq .'
```

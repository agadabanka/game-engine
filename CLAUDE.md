# Working in this repo (Claude standing instructions)

## Repository access — fetch repos via `$GH_TOKEN`, over git (not the REST API)

This environment provides a GitHub PAT in **`$GH_TOKEN`**. Use it through **git**:

```bash
# clone / fetch / ls-remote any IN-SCOPE repo with the token in the URL
git clone  "https://x-access-token:${GH_TOKEN}@github.com/<owner>/<repo>.git" <dir>
git -C <dir> fetch "https://x-access-token:${GH_TOKEN}@github.com/<owner>/<repo>.git"
```

Two hard rules learned the hard way:

1. **The REST API is gated — don't curl `api.github.com`.** Outbound API calls go through
   the session's GitHub gateway and return `403 "GitHub access is not enabled for this
   session"` *regardless of the token* (even a plain `GET /repos/...`). So you cannot
   `curl` the API, and you cannot dispatch workflows that way. For GitHub operations use
   the **`mcp__github__*` tools**; for fetching code use **plain git** with the token URL
   above. (Git works because it tunnels through a separate local git proxy.)

2. **The token does NOT override the session's repo scope.** This session is scoped to a
   set of repos (see the task's "Repository Scope"; today it's `agadabanka/game-engine`).
   An out-of-scope repo fails with `remote: Repository not found` / `Authentication
   failed` even though the token is valid — that is a *scope* error, not a bad token.
   To work on another repo (e.g. a game repo like `rainbow-run`, `grovekeep`):
   - If the `list_repos` / `add_repo` MCP tools are available, call `list_repos` to see
     what's offered and `add_repo` to pull it into this session.
   - Otherwise broaden the **Repository Scope** of the remote environment in the Claude
     Code web settings — see https://code.claude.com/docs/en/claude-code-on-the-web .
   - Do **not** try to route around the agent proxy to reach a repo; report the blocked
     repo instead.

### Quick self-check at the start of a task that touches another repo
```bash
git ls-remote "https://x-access-token:${GH_TOKEN}@github.com/<owner>/<repo>.git" HEAD \
  && echo "in scope" || echo "NOT in scope — add_repo or widen the environment scope"
```

## Git workflow
- Develop on the assigned feature branch; commit with clear messages. Merge to `main`
  only when the user asks (they have, in past sessions, for hub/docs changes).
- Pushes go through the local git proxy (`git push -u origin <branch>`), retry on
  network errors with backoff. Commits are signed by a signing server — a transient
  `signing server returned status 403` can happen on `--amend`; just re-commit.

## The shape of the engine
- **Front door / hosting:** `docs/HOSTING.md` (DNS → Railway edge → hub → per-game
  deploys → shorts/analytics loop). Health-check a custom domain with the
  **`domain-doctor`** skill (`node scripts/domain-doctor.mjs <domain> --health /health`).
- **Architecture:** `docs/ENGINE.md`. **Skills:** `.claude/skills/` (make-game, new-game,
  analytics, trailer, add-character, tex-pdf, domain-doctor, …).
- **CI safety net:** `.github/workflows/cross-game-eval.yml` runs the golden games' gates
  on engine/SDK changes. Without a `GH_TOKEN` *repo secret*, golden games that can't be
  cloned are **skipped** (not failed). After an intentional engine/template restyle,
  refresh the visual baselines from CI's own renderer (dispatch `rebaseline=true`, or push
  a commit whose message contains `[rebaseline]`) — baselines must come from CI.
- **Shorts pipeline:** `tools/trailer/make-shorts.mjs` records off a game's **live URL**
  (no repo clone needed); `yt-upload.mjs` uploads (defaults to **unlisted**, needs
  `YT_CLIENT_ID/SECRET/REFRESH_TOKEN`); `host-shorts.mjs`/`wire-shorts.mjs` host + register
  them on the hub. **Instrumenting a game's analytics, though, requires write access to
  that game's repo** (see repo-access rules above).

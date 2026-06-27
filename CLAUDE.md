# Working in this repo (Claude standing instructions)

## Repository access — fetch repos via `$GH_TOKEN`, over git (not the REST API)

Clone IN-SCOPE repos with a **plain GitHub URL** — git is pre-configured to rewrite
`https://github.com/` to the local git proxy (`http://local_proxy@127.0.0.1:41729/git/`),
which injects auth. **No token in the URL.**

```bash
# canonical: the rewrite + local proxy handle auth
git clone https://github.com/<owner>/<repo>.git <dir>
```

Do NOT put the token in the URL (`https://x-access-token:$GH_TOKEN@github.com/...`):
the embedded creds make git SKIP the `insteadOf` rewrite, so it goes to github.com
through the HTTPS egress proxy instead of the local git proxy. It still works for
in-scope repos, but it's the wrong path and muddies debugging — prefer the plain URL.

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

An out-of-scope repo returns **403 from the local git proxy** (and the GitHub MCP
returns *"Access denied… Allowed repositories: …"*) — proven across every URL form.
No token or URL trick bypasses it; widening the environment scope is the only fix.

### Quick self-check at the start of a task that touches another repo
```bash
git ls-remote https://github.com/<owner>/<repo>.git HEAD \
  && echo "in scope" || echo "NOT in scope — widen the environment Repository Scope"
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

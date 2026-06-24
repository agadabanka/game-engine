---
name: analytics
description: Wire eval-aware gameplay telemetry into a game on the engine — PostHog (funnels/retention) + the hub's server-side, ad-blocker-proof /api/track counter — so real-player events (deaths, completions, idle, coins) flow back as analytics AND as signal that improves the eval (death heatmaps, difficulty/reach calibration, felt-fun). Use when the user says "add analytics", "instrument <game>", "track events", "wire telemetry", or as the standard analytics STEP in game creation.
---

# analytics — eval-aware gameplay telemetry (a creation step)

Every game on the engine should emit gameplay telemetry. It serves two jobs at once:

1. **Product analytics** — the video → click → **play → engage** funnel (PostHog), so you can see what content drives real plays and where players drop.
2. **Real-player eval signal** — the same events the synthetic eval approximates (the 0-death gate, felt-fun model, difficulty/reachability) are emitted by *real* players, closing the synthetic↔real gap (death heatmaps, completion/pacing, idle/disengagement).

This is a standard step in game creation: the engine template already includes the client, so **new games inherit it** — the step is mostly *set the game id + verify events flow*. For older games, copy the client in.

## How it works
`engine/game-template/src/game/telemetry.js` subscribes to the harness observability API **`window.__game.snapshot()`** (the same contract the gate/feel models read — `engine/sdk/studio.js` → `Studio.harness.install`, snapshot at `game.js`). It polls ~6 Hz, diffs frames, and emits events to **both** sinks via one `emit()`:
- **PostHog** (`posthogKey`, public/write-only `phc_…`) — funnels, retention, drill-in.
- **the hub `/api/track`** (`trackUrl`) — first-party, server-side, **ad-blocker-proof** counts (short-form audiences are heavily mobile/blocked; ~10–40% of client events vanish). Read back at `/api/funnel`.

Config lives in `index.html` (`window.ANALYTICS`); set `game` to the slug. `verbose:true` adds high-volume `player_jump`.

## Event taxonomy (what's emitted)
| Event | When | Key props | Eval signal it feeds |
|---|---|---|---|
| `game_open` | first load | utm_source | top-of-funnel / attribution |
| `level_start` | level (re)loads | level, level_name | session/level funnel |
| `player_death` | deaths counter increments | level, x, y, **cause** (fall/hazard), death_count, t_ms | **0-death gate calibration, death heatmap, difficulty/reach** (P1) |
| `coin_collect` | coin count up | level, coins, x, y | reachability/effort (reach.mjs) |
| `level_complete` | won transition | level, duration_ms, deaths, coins, max_x | **completion rate + pacing vs solver** (difficulty arc) (P5) |
| `player_idle` | no movement > idleMs | level, x, y, ms | **felt-fun disengagement** (feelmodel.mjs) (P4) |
| `player_jump` *(verbose)* | takeoff | level, x, y | input/flow (platforming.mjs) |

How it improves eval: real death distributions replace the dumb-bot's synthetic ones (flag levels the gate passes but humans churn); completion time vs solver-optimal re-weights the difficulty arc; idle hotspots recalibrate felt-fun; coin attempts refine jump/spring reach ranges. See `tools/lib/{feelmodel,difficulty,reach,solver,curriculum}.mjs`.

## Do it (wire a game)
1. **Copy the client:** `engine/game-template/src/game/telemetry.js` → the game's `src/game/telemetry.js` (new games already have it).
2. **Include + configure** in `src/index.html`, after `game.js`:
   ```html
   <script>window.ANALYTICS = { game: '<slug>', posthogKey: 'phc_…', posthogHost: 'https://us.i.posthog.com', trackUrl: 'https://hub-production-6d28.up.railway.app/api/track' };</script>
   <script src="./game/telemetry.js"></script>
   ```
   Set `game` to the game's slug (the scaffolder injects this automatically into the `game: ''` placeholder).
3. **Mark the stage** in `GAME_META.json`: `"stages": { "analytics": "done" }` (registered as a `loop`-phase stage in `hub/lib/stages.js`).
4. **Deploy** (push → Railway).

## Verify
- Open the live game, play (move, die, finish a level).
- **PostHog → Activity**: see `level_start`, `player_death`, `level_complete` within seconds. Build a funnel `$pageview → game_open → level_start → level_complete`, breakdown by `utm_source`.
- **Server-side truth:** `GET <hub>/api/funnel` → `events` shows `"<game>|player_death|<source>"` counts (immune to ad-blockers; reconcile vs PostHog to size the blind spot).
- The `/go/<game>?utm_source=…` redirect already logs the **click** layer, so the full chain is video → click (`/go`) → play → events.

## Notes
- No-ops safely if unconfigured; wrapped in try/catch so it can never break the game loop.
- The `phc_…` key is public/write-only — safe to ship in client code; secret keys (Dub, PostHog personal) stay server-side.
- Keep `verbose:false` by default to protect the PostHog free-tier event budget; flip it on per-game when debugging input/flow.

# Paste-into-new-session brief — harden Rainbow Run analytics

> Start a Claude Code session whose repository is **`agadabanka/rainbow-run`**, then paste
> everything below the line. It's self-contained (doesn't need the game-engine repo).

---

You're working in **`agadabanka/rainbow-run`**, a Phaser game built on the "game-engine" studio
template and deployed at **https://rainbow-run-production.up.railway.app** (auto-deploys from
`main` on Railway). Your job: **instrument analytics deeply** so we can measure the full funnel
**short → click → play → engage → complete → return**, attributed to the exact short that drove
each player. PostHog is the funnel of record; the hub `/api/track` is the ad-blocker-proof
backstop; Dub provides the click/attribution layer that feeds it.

## Context that's already true (don't rebuild)
- The game almost certainly already has `src/game/telemetry.js` (from the template) that reads
  the harness snapshot **`window.__game.snapshot()`** (~6 Hz, diffs frames) and emits events to
  PostHog + the hub. Find it and **extend** it; don't start from scratch.
- Config lives in `src/index.html` as `window.ANALYTICS = {...}` included **before** telemetry.js.
- Dub short links already point at `https://play.funstackstudios.com/go/rainbow-run?utm_source=youtube&utm_medium=short&utm_content=L<n>-<biome>`, and `/go` 302s to the game **forwarding all query params** (so the game receives `utm_*`; Dub also appends `dub_id`).

## 1 — Configure the clients (`src/index.html`)
```html
<script>window.ANALYTICS = {
  game: 'rainbow-run',
  posthogKey: '<YOUR PUBLIC phc_… PROJECT KEY>',   // PostHog → Settings → Project API Key. Public/write-only — safe in client. (env: POSTHOG_PROJECT_TOKEN)
  posthogHost: 'https://us.i.posthog.com',
  trackUrl: 'https://hub-production-6d28.up.railway.app/api/track'
};</script>
<script src="./game/telemetry.js"></script>
```

## 2 — Turn PostHog from "events" into "all its features" (in telemetry.js init)
When you init `posthog-js`, enable the surfaces (not just capture):
```js
posthog.init(ANALYTICS.posthogKey, {
  api_host: ANALYTICS.posthogHost,
  person_profiles: 'identified_only',
  autocapture: true,                 // clicks/inputs with zero code
  capture_pageview: true,
  capture_pageleave: true,
  session_recording: { maskAllInputs: false },
  enable_heatmaps: true,
});
posthog.startSessionRecording();     // session replay — watch real players struggle/die
```

## 3 — Thread attribution onto EVERY event (the whole point)
On load, read the link params and register them as super-properties so they ride on every event
**and** flow to the hub:
```js
const q = new URLSearchParams(location.search);
const attribution = {
  utm_source:  q.get('utm_source')  || document.referrer || 'direct',
  utm_medium:  q.get('utm_medium')  || null,
  utm_content: q.get('utm_content') || null,   // ← the short id (L1-sunbeam-meadow …)
  dub_id:      q.get('dub_id')      || null,    // ← Dub click id (conversion attribution)
};
posthog.register(attribution);                 // every PostHog event now carries these
// include `source: attribution.utm_source` (and dub_id) in every hub /api/track POST too
```

## 4 — Emit the granular event taxonomy
Drive these off `window.__game.snapshot()` diffs (the template already emits the first few — add
the rest + the props). Send each to **both** PostHog (`posthog.capture(name, props)`) and the hub
(`POST {game:'rainbow-run', event:name, source:utm_source}`):

| Event | When | Key props |
|---|---|---|
| `game_open` | first load | utm_source/medium/**content**, dub_id, $device_type |
| `level_start` | each biome (re)load | level, **biome** (Sunbeam Meadow … Thunder Heights) |
| `checkpoint` | mid-level checkpoint reached | level, x |
| `coin_collect` | pickup | level, coins, x, y |
| `player_death` | death | level, biome, **cause** (fall/hazard/enemy), x, y, t_ms |
| `weather_shift` | RR's weather changes mid-level | level, weather |
| `level_complete` | win | level, duration_ms, deaths, coins |
| `game_complete` | final level done | total_time_ms, total_deaths |
| `player_idle` / `player_quit` | no input > Ns / pagehide | level, x, ms |

Keep everything in try/catch so telemetry can never break the game loop. Look at how the game
exposes level/biome/deaths/coins in its scene state to source the props.

## 5 — Mark the stage & deploy
- `GAME_META.json` → `"stages": { "analytics": "done" }`.
- Commit to `main`, let Railway redeploy. Confirm the live page includes the new `telemetry.js`.

## 6 — Verify the full funnel (do this, paste results back)
1. Open `https://rainbow-run-production.up.railway.app/?utm_source=youtube&utm_medium=short&utm_content=L1-sunbeam-meadow&dub_id=test123` and **play** (move, collect, die, finish level 1).
2. **PostHog → Activity**: within seconds you should see `game_open, level_start, coin_collect, player_death, level_complete` — each carrying `utm_content=L1-sunbeam-meadow`. Open the **session replay** of that play.
3. Build and SAVE these PostHog insights:
   - **Funnel:** `$pageview → game_open → level_start → level_complete`, **breakdown by `utm_content`**.
   - **Retention:** returning players, breakdown by `utm_content`.
   - **Trends:** `player_death` by `level` (+ a path/heatmap if you can).
   - A **behavioral cohort:** "players who reached `level_complete` level≥3" — for converts-better analysis.
   - Pin them to a **Dashboard** called "Rainbow Run funnel".
4. **Hub backstop:** `GET https://play.funstackstudios.com/api/funnel` should now show `rainbow-run|player_death|youtube` etc. (server-side, ad-block-proof). Reconcile vs PostHog.

## 7 — (Optional, phase 2) Dub conversion tracking
To also show conversions *inside Dub*: add `@dub/analytics` to the page (captures `dub_id`), add
the game + `play.funstackstudios.com` hostnames to **Dub → Tracking → Allowed hostnames**, enable
**Conversion tracking**, and post `lead`(=first play)/`sale`(=level_complete) to Dub's track API
**server-side** (via the hub, which holds the Dub secret) using the `dub_id`. PostHog already
carries the funnel, so this is additive.

**Report back:** the live event screenshot with `utm_content` populated, the saved funnel's
conversion % by short, and the `/api/funnel` counts — that's the proof the prod-style funnel is
closed.

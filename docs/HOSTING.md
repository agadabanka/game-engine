# Hosting & the public front door — how it's all connected

How a person typing **`play.funstackstudios.com`** on their phone ends up playing a
game, and how their tap flows back to you as analytics. This is the *outside* of the
engine — the registrar, Railway, the hub, and the per-game deployments — and how the
four layers between a domain and an app fit together.

Read `docs/ENGINE.md` for the *inside* (how a game is built). This doc is the
delivery rig that puts those games in front of real players and closes the loop.

```
   PLAYER  ──taps──▶  play.funstackstudios.com
                              │
        ┌─────────────────────┴──────────────────────────────────────────┐
        │ 1. DNS (registrar: Squarespace)                                 │
        │    CNAME  play            → bm1…up.railway.app   (edge target)   │
        │    TXT    _railway-verify.play → railway-verify=…  (ownership)   │
        └─────────────────────┬──────────────────────────────────────────┘
                              │ resolves to Railway's edge
        ┌─────────────────────┴──────────────────────────────────────────┐
        │ 2. RAILWAY EDGE  (anycast: iad1/den1/…)                          │
        │    • terminates TLS with the issued certificate                  │
        │    • binds the hostname → a SERVICE  (the route table)           │
        │    • if NOT bound → serves fallback 404 (x-railway-fallback:true) │
        └─────────────────────┬──────────────────────────────────────────┘
                              │ routes to the bound service
        ┌─────────────────────┴──────────────────────────────────────────┐
        │ 3. THE HUB SERVICE   (Railway project `game-engine`, svc `hub`)  │
        │    node hub/server.js  ·  one box, many jobs:                    │
        │      /            play.html  — the public game list (thumbs)     │
        │      /go/:id      click redirect → the game  (logs the funnel)   │
        │      /v?src=…     same-origin shorts proxy (byte-range mp4)       │
        │      /api/track   ad-blocker-proof event counter  ◀── games POST │
        │      /api/funnel  read back clicks + events                      │
        │      /api/analytics  per-game code/asset/cost (GitHub)           │
        │      /api/dashboard  mission-control snapshot                    │
        │      store.js → Railway volume (KV: games list, funnel counts)   │
        └─────────────────────┬──────────────────────────────────────────┘
                              │ each game is its OWN Railway project
        ┌─────────────────────┴──────────────────────────────────────────┐
        │ 4. PER-GAME DEPLOYMENTS                                          │
        │    gumdrop-gambit-production.up.railway.app   (its own project)  │
        │    …registered with the hub via POST /api/games (id,url,shorts)  │
        │    …phones home gameplay events to the hub's /api/track          │
        └─────────────────────────────────────────────────────────────────┘
```

## 1. DNS — the registrar (Squarespace)
The apex `funstackstudios.com` is registered at Squarespace, so the public hostname
is configured there as **custom DNS records**. A Railway custom domain needs exactly two:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| `CNAME` | `play` | `bm1…up.railway.app` | points the hostname at Railway's edge target |
| `TXT` | `_railway-verify.play` | `railway-verify=…` | proves you own the domain so Railway will issue the cert |

DNS belongs to the **owner** — these are the only steps a human has to do by hand. The
`TXT` is what unblocks certificate issuance; once the cert is `VALID`, Railway stops
requiring it. Everything downstream (cert, routing) is automatic. **Don't re-add the
domain on Railway to "fix" things** — each re-add can mint a *new* CNAME target and
force you to redo the DNS.

## 2. Railway edge — TLS + the route binding
Railway's anycast edge does two separate jobs, and **either can be green while the
other is broken**:

- **Certificate** — issued once the `_railway-verify` TXT checks out. Until then you get
  a TLS warning, not a 404.
- **Route binding** — maps `play.funstackstudios.com` → the `hub` service. This is the
  layer DNS dashboards can't show you. When it's stuck, the edge answers with a clean
  `200`/`404` from a **fallback** app and sets `x-railway-fallback: true`. The cert is
  valid, DNS is propagated, Railway's API says the domain is fine — yet your app never
  sees the request.

  **The fix is a redeploy of the bound service**, which makes the edge re-read its route
  table. It does *not* change the edge target, so no DNS change is needed. Waiting does
  not clear it. This whole diagnosis-and-fix is automated in the **`domain-doctor`**
  skill (`node scripts/domain-doctor.mjs <domain> --fix`).

## 3. The hub service — one box, many jobs
The hub is a single Railway project (`game-engine`) running one service (`hub`,
`node hub/server.js`). It is both the public storefront and the analytics sink:

- **`/`** on the `play.` host serves `hub/public/play.html` — the mobile game list. Each
  card's thumbnail is the static file **`hub/public/thumbs/<game-id>.jpg`** (360×360); a
  missing file just hides the image (`onerror`), which is why an un-thumbnailed game shows
  a blank tile. The card links to `/go/<id>`.
- **`/go/:id`** logs a **click** (with `utm_source`) and 302-redirects to the game,
  forwarding query params — this is the top of the funnel.
- **`/v?src=…`** proxies each game's short-form `.mp4`s **same-origin** (with byte-range
  support) so the vertical shorts feed (`shorts.html`) plays and seeks reliably; it only
  serves URLs that registered games actually reference.
- **`/api/track`** is an open-CORS, **server-side** event counter games POST to —
  ad-blocker-proof, unlike client-only analytics. Read back at **`/api/funnel`**.
- **`/api/analytics`** and **`/api/dashboard`** are the heavier mission-control views
  (per-game code/asset/cost from GitHub; the live snapshot the home page renders).
- State lives in **`store.js`**, a tiny KV on a Railway **volume** (the games list, funnel
  counts) — so a restart paints instantly.

## 4. Per-game deployments
Each game is its **own** Railway project (e.g. `gumdrop-gambit` →
`gumdrop-gambit-production.up.railway.app`), auto-deploying from its GitHub repo. A game
joins the hub by calling **`POST /api/games`** (done by the `new-game` scaffolder and the
dashboard "+ register game" form) with its `id`, `url`, and hosted `shorts`. From then on
the hub lists it, proxies its shorts, and collects its events — **without** a code change
to the hub. The game phones gameplay events home to the hub's `/api/track`.

## The loop it creates — shorts → analytics
This hosting rig is what makes the flywheel measurable end to end:

```
 short video ──▶ /go/<game>?utm_source=… ──▶ game loads ──▶ plays
   (shorts.html      logs CLICK              POSTs game_open,
    via /v proxy)     (recordFunnel)          player_death, level_complete
                                                   │           │
                                          PostHog  │           │  /api/track
                                       (funnels/    ▼           ▼  (server-side,
                                        retention) client    /api/funnel  ad-block-proof)
                                                              counts you can reconcile
```

- **PostHog** (`window.ANALYTICS.posthogKey`, a public `phc_…` key) captures the rich
  client funnel (`$pageview → game_open → level_start → level_complete`, broken down by
  `utm_source`) and retention.
- **`/api/track` → `/api/funnel`** is the first-party server-side truth that survives
  ad-blockers (which eat ~10–40% of mobile client events) — reconcile the two to size the
  blind spot.
- The same gameplay events double as **eval signal** (death heatmaps, difficulty/reach
  calibration) — see the **`analytics`** skill.

## Health-checking the front door
Run **`domain-doctor`** any time the public domain misbehaves or after a DNS change:

```bash
node scripts/domain-doctor.mjs play.funstackstudios.com --project game-engine --health /health
```

It walks all four layers (DNS → cert → edge route → app), prints a pass/fail table, and
with `--fix` clears a stuck edge binding by redeploying the bound service. See the
**`domain-doctor`** skill for the full playbook.

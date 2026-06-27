# Analytics hardening — Dub features & the Rainbow Run plan

**Model:** three layers, each doing the job it's best at.

| Layer | Job | Owns |
|---|---|---|
| **Dub** | top-of-funnel **attribution** — which *short* drove a click | link clicks, device/geo of clickers, `utm_*` + `dub_id` |
| **PostHog** | the **funnel + retention** (play → engage → return) | `game_open → level_start → level_complete`, cohorts, drill-in |
| **Hub `/api/track`** | server-side **truth** (ad-blocker-proof) + **eval signal** | death heatmaps, completion/pacing, difficulty calibration |

The key idea: **Dub passes `utm_content` (the short id) + `dub_id` into the game**, the game threads them into **PostHog** event/person properties, so every PostHog funnel and retention chart can be **broken down by which short the player came from**. PostHog is the funnel; Dub is the attribution that feeds it.

## Dub features → how you'd actually use each

Priority is for *your* case: 16 free browser games, plays driven by short-form video.

| Feature | Tier | What it is | How you use it | Priority |
|---|---|---|---|---|
| **Conversion tracking** (`@dub/analytics`) | Free*/Pro | ties a click to downstream events (play, complete) | attribute *plays & completions* (not just clicks) to a short | ★★★ |
| **50K tracked events/mo** | Pro | conversion-event volume cap | 16 games of real plays blow past Free's low cap fast | ★★★ |
| **1-year retention** | Pro | data kept 365d (Free ≈ 30d) | you need *months* to see which shorts retain players | ★★★ |
| **Advanced analytics** | Pro | break clicks/conversions down by device/geo/browser/referrer | know *who & where* your plays come from | ★★★ |
| **UTM builder + templates** | Pro | standardize `utm_source/medium/content` | keep funnel data clean across every short (no hand-typing) | ★★★ |
| **Custom domain** | Free/Pro | branded `go.funstackstudios.com/x` vs `dub.sh/x` | trust + CTR + first-party; consistent with your brand | ★★ |
| **Device targeting** | Pro | route iOS/Android/desktop to different URLs | send mobile to a touch-tuned entry; desktop to full | ★★ |
| **Tags (25) / Folders (3)** | Pro | organize links | one folder per game, tags per platform/campaign | ★★ |
| **Custom link previews** | Pro | the OG card when a Dub link is shared | branded preview when links get reposted in DMs/X | ★★ |
| **Custom QR codes** | Pro | branded QR per link | QR end-card in a short, or IRL/cross-post | ★ |
| **A/B testing** | Business (not Pro) | two destinations per link, winner by conversions | test landing/game variants once volume justifies it | ★ (later) |
| **Geo targeting** | Pro | region-specific destinations | only once you localize | ★ (later) |
| Deep links | Pro | open a mobile **app** from a link | N/A — you're web-only, no app | — |
| Link cloaking / expiration / password | Pro | hide / time-box / gate a link | no reason to hide `play.funstackstudios.com` | — |

\* Conversion tracking *works* on Free, but with a low event cap, basic analytics, and ~30-day retention. The Pro value is **volume + depth + retention**, not the feature existing.

## Verdict on upgrading
**Free-first (current plan):** wire the full click → play → complete funnel and validate it end-to-end on Free. **Upgrade to Pro ($30/mo)** when you hit the event cap or want 1-year retention + advanced breakdowns + a branded short domain — i.e. once the funnel is proven and you're running it for real across multiple games. A/B testing is a *Business*-tier feature, not Pro — don't upgrade for it yet.

## What "hardened" Rainbow Run analytics looks like (the build, once the repo is in scope)

**Attribution threading:** `Dub link → /go/rainbow-run?utm_*  (Dub appends dub_id) → game`. The game reads `utm_source/medium/content` + `dub_id` from the URL on load and attaches them to **every** PostHog event + the hub `/api/track` payload.

**Granular event taxonomy** (beyond today's coarse set):

| Event | When | Key props |
|---|---|---|
| `game_open` | first load | utm_source/medium/**content** (short id), dub_id, device |
| `level_start` | each biome (re)load | level, biome |
| `checkpoint` | mid-level checkpoint | level, x |
| `coin_collect` | pickup | level, coins, x, y |
| `player_death` | death | level, biome, **cause** (fall/hazard), x, y, t_ms |
| `level_complete` | win | level, duration_ms, deaths, coins |
| `weather_shift` | biome weather change (RR's hook) | level, weather |
| `game_complete` | final level done | total_time, total_deaths |
| `player_idle` / `quit` | disengage | level, x, ms |

**PostHog funnels you'll get:** `pageview → game_open → level_start → level_complete`, **broken down by `utm_content`** (which short converts best), plus **retention by short**. **Dub** shows clicks → (optionally) conversions per short. **Hub `/api/funnel`** is the ad-blocker-proof reconciliation + feeds the game-design eval.

## The one blocker
Editing the game means write access to **`agadabanka/rainbow-run`**, which isn't in this session's scope. Add it: Claude Code web → this environment → **Settings → Repository Scope → add `agadabanka/rainbow-run`**. Then everything above ships in one pass.

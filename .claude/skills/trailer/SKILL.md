---
name: trailer
description: Build a polished montage trailer across the games on the engine — records short gameplay clips off each game's LIVE deployment, adds title cards + lower-third captions and a multi-track music bed, xfade-chains it, and (optionally) uploads to YouTube. Use when the user asks for a trailer, montage, sizzle reel, showcase video, or "show off the engine / the games".
---

# trailer — one engine, many games, one cut

Turns the deployed games into a finished, narrated montage (≈60s by default) from a
single JSON spec. Everything is driven off the games' **live URLs** — no game repo
needs to be cloned or run locally.

## Do this

1. **Pick the story + clips.** The default cut (`tools/trailer/montage.json`) is the
   canonical "ONE ENGINE → three games → 0-death promise → sign-off" arc across
   the-platformer, Jazz, and Starsweeper. Edit the spec to change the order, the
   worlds shown, the captions, the music, or to add a game. Each `timeline` entry is:
   - `card` — a title screen: `title`, `sub`, `big` (font px), `dur`.
   - `clip` — gameplay: `game` (id → URL via spec.games or `hub/games.json`) or
     explicit `base`, `level`, `skip` (autopilot frames to skip past the intro card),
     `start` (trim into the clip), `dur`, and optional `name`/`feat` (lower-third caption).

2. **Build it** from the engine root:
   ```bash
   npm i            # first time — pulls playwright + ffmpeg-static
   npm run trailer  # or: node tools/trailer/make-trailer.mjs [spec.json]
   ```
   It records each clip off the live deploy (deterministic `window.__rec` stepping →
   JPEG frames → H.264), renders cards/captions as PNGs in headless Chromium (this
   ffmpeg has **no `drawtext`**, so text is rendered in the browser — and looks
   better for it), normalizes every segment to 1280×720@60, xfade-chains them, lays
   the music bed (tracks split evenly with crossfades), and adds global fades.
   Output: `trailer-build/engine_trailer.mp4`. Re-run with `"reuseClips": true` in
   the spec to skip re-recording while you tune timing/captions.

3. **Upload (optional).** Device-flow OAuth — no browser needed on the box; reuses a
   saved refresh token after the first time:
   ```bash
   YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/trailer/yt-upload.mjs \
     trailer-build/engine_trailer.mp4 "<title>" "<description>" unlisted
   ```
   It prints a code + `google.com/device` URL; relay them to the user, and it polls
   then uploads. Default privacy `unlisted` — only go `public` when the user says so.

4. **Deliver.** Send the mp4 to the user (it's the artifact), report duration/size,
   and the YouTube link if uploaded. Offer to flip privacy or retime.

## Notes
- **Renderer is `canvas`, not webgl** — headless swiftshader webgl reads back black
  via `toDataURL`. Canvas is correct (what the gate/thumbnails use).
- **Captions are PNG overlays** with alpha fades; cards are full-frame PNGs. Restyle
  globally via the spec's `accent`/`bg`.
- **Recording off live deploys** means the trailer always reflects what's shipped.
  For an unreleased local build, point a clip's `base` at `http://127.0.0.1:<port>`.
- A clip needs a `dur` of footage plus headroom; the recorder captures `record`
  seconds (default `dur+1`). Bump `skip` to reach later, busier parts of a level
  (bosses live at the end — but long levels may need a big skip).

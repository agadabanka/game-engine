---
name: ui-pass
description: Do a UI/UX theming + polish pass on a game and prove it with a UI eval. Use when the user says "the UI isn't themed", "polish the UI", "do a UI pass", "the HUD looks plain", or after adding art/themes when the chrome (buttons, status, menus, note box) hasn't caught up. Works for Phaser-base and Claystone games.
---

# ui-pass — theme the chrome, then prove it with an eval

The game art can be gorgeous while the **UI chrome** (buttons, status, menus, note box, splash) is
still plain default boxes. This pass makes the chrome match the game's identity and adds/runs a
**UI eval** so it can't silently regress.

## Do this

1. **Find the chrome.** List every UI surface: title/splash, HUD status, buttons (theme/new-game/
   pause/note), menus, dialogs, the note box. In a Claystone game the chrome is usually **themed DOM
   in `index.html`** (driven by a `gg-theme`-style event + `game.snapshot()`); in the Phaser base
   it's `Studio.Shell`. Don't leave half the controls in-canvas and half in DOM — pick one.

2. **Theme it to the game.** Drive a single accent from the active theme/world (a CSS `--accent`
   var updated on the theme event), and style buttons/status/dialogs as the game's material
   (e.g. rounded "candy" buttons with a highlight + drop bevel). Every control re-skins when the
   theme changes. Keep it readable (contrast, text-shadow over busy backdrops) and mobile-friendly
   (tap targets ≥ 40px, wrap on narrow widths).

3. **Cover the must-haves** (parity with the base): a **status** readout (turn/score/result), the
   primary actions, a **📝 Note** button + `N` key (the notes→issues loop), a **mute** + a **demo/
   autopilot** toggle, and the **title splash** using the keyart.

4. **Add/keep a UI eval** (`ui-test.mjs`, committed). It must boot the real page (and `server.js`
   if notes are server-backed) in headless Chromium and assert, at minimum:
   - 0 page/console errors on load (smoke);
   - **non-black on BOTH renderers** (canvas + `?r=webgl`);
   - the primary interaction works (e.g. click-to-move / a button does its thing);
   - **the HUD is themed** — switching theme changes BOTH the label AND the `--accent` colour
     (proves it's themed, not flat);
   - the **note taker** posts to `/api/notes` and persists.
   Run it: `node ui-test.mjs` → must print `✓ UI EVAL PASSED` (exit 0). This IS the UI gate;
   re-run after every UI change.

5. **Verify visually + ship.** Headless-screenshot a couple of themes, confirm the chrome reskins,
   then push + redeploy. Send the owner a before/after if the change is big.

## Notes
- The headless Chromium for evals/screenshots lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (pass `executablePath`); in a sandbox it can't TLS to external HTTPS, so eval off a **local** serve.
- If a game has no `ui-test.mjs`, create one — a UI pass without an eval will regress.
- Pairs with **claystone-parity**: if the chrome/notes are missing because the Claystone template
  lacks them, fix the template there too, don't just patch the one game.

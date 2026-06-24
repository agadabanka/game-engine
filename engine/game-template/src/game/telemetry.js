// ── telemetry.js ── engine analytics client (eval-aware) ─────────────────────
// Subscribes to the harness observability API (window.__game.snapshot() — the
// same contract the 0-death gate / felt-fun model read) and emits gameplay
// events to TWO sinks:
//   1. PostHog        — product analytics: funnels, retention, per-event drill-in
//   2. the hub /api/track — first-party, server-side, AD-BLOCKER-PROOF counts
// The event taxonomy mirrors what the engine's eval cares about, so live play
// becomes real-player eval signal (death heatmaps → difficulty/reach calibration,
// completion + pacing → arc, idle → felt-fun disengagement, coins → reachability).
//
// Config (set window.ANALYTICS before this script, or a <meta name="game-id">):
//   { game, posthogKey, posthogHost, trackUrl, verbose, idleMs }
// No-ops safely when unconfigured; never throws into the game loop.
(function (root) {
  var doc = root.document, CFG = root.ANALYTICS || {};
  var metaId = (doc.querySelector('meta[name="game-id"]') || {}).content;
  var GAME = String(CFG.game || metaId || (location.hostname.split('.')[0]) || 'game').slice(0, 60);
  var TRACK_URL = CFG.trackUrl || null;
  var PH_KEY = CFG.posthogKey || null, PH_HOST = CFG.posthogHost || 'https://us.i.posthog.com';
  var VERBOSE = !!CFG.verbose, IDLE_MS = CFG.idleMs || 4000;
  var SRC = (new URLSearchParams(location.search).get('utm_source')) || 'direct';

  // ── PostHog loader (only if a key is provided and it isn't already on the page) ──
  if (PH_KEY && !root.posthog) {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init Ni js capture We calculateEventProperties Ai register register_once register_for_session unregister unregister_for_session Ii getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId capturyTraceFeedback capturyTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(doc,root.posthog||[]);
    try { root.posthog.init(PH_KEY, { api_host: PH_HOST, person_profiles: 'identified_only', autocapture: false, capture_pageview: true }); root.posthog.register({ game: GAME, utm_source: SRC }); } catch (e) {}
  }

  // ── unified emit → PostHog + the server-side counter ──
  function emit(event, props) {
    props = props || {}; props.game = GAME; props.utm_source = SRC;
    try { if (root.posthog && root.posthog.capture) root.posthog.capture(event, props); } catch (e) {}
    if (TRACK_URL) { try { fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: GAME, event: event, source: SRC, props: props }), keepalive: true }).catch(function () {}); } catch (e) {} }
  }
  root.trackEvent = emit;   // exposed for any custom in-game hooks

  // ── subscribe to the harness (decoupled ~6 Hz poll; never blocks the game loop) ──
  var prev = null, level = 0, levelStart = 0, idleSince = 0, idleFired = false, opened = false;
  function playScene() { try { return root.game.scene.scenes.filter(function (s) { return s.scene.key === 'Play'; })[0]; } catch (e) { return null; } }
  function tick() {
    try {
      if (!opened) { opened = true; emit('game_open', {}); }
      var g = root.__game; if (!g || !g.snapshot) return;
      var s = g.snapshot(); if (!s) return;
      var sc = playScene(); var lv = (sc && sc._world) || root.__startLevel || 1;
      var name = (root.LEVELS && root.LEVELS[lv - 1] && root.LEVELS[lv - 1].name) || '';

      if (lv !== level) { level = lv; levelStart = Date.now(); idleSince = 0; idleFired = false; prev = null; emit('level_start', { level: lv, level_name: name }); }
      var t = Date.now() - levelStart;

      if (prev) {
        if (s.deaths > prev.deaths) {                                    // ── eval P1: death heatmap / difficulty / reach ──
          var H = (sc && sc.scale && sc.scale.height) || 600;
          emit('player_death', { level: lv, x: s.lastDeathX != null ? s.lastDeathX : prev.x, y: prev.y, cause: prev.y > H - 48 ? 'fall' : 'hazard', death_count: s.deaths, t_ms: t });
          idleSince = 0; idleFired = false;
        }
        if (s.coins > prev.coins) emit('coin_collect', { level: lv, coins: s.coins, x: s.x, y: s.y, t_ms: t });   // ── eval: reachability/effort ──
        if (s.won && !prev.won) emit('level_complete', { level: lv, level_name: name, duration_ms: t, deaths: s.deaths, coins: s.coins, max_x: s.maxX });   // ── eval P5: completion + pacing ──
        if (VERBOSE && prev.onGround && !s.onGround && s.vy < -30) emit('player_jump', { level: lv, x: s.x, y: s.y, t_ms: t });

        var moving = Math.abs(s.vx) > 5 || !s.onGround;                  // ── eval P4: idle → felt-fun disengagement ──
        if (!s.won && !s.dead && !moving) { if (!idleSince) idleSince = Date.now(); else if (!idleFired && Date.now() - idleSince > IDLE_MS) { idleFired = true; emit('player_idle', { level: lv, x: s.x, y: s.y, ms: Date.now() - idleSince }); } }
        else { idleSince = 0; idleFired = false; }
      }
      prev = s;
    } catch (e) { /* never break the game */ }
  }
  setInterval(tick, 160);
})(window);

/*
 * game-template — a neutral Phaser 4 platformer on the Studio SDK.
 * This is the base the scaffolder clones; the vertical agents reskin & extend it.
 * It must always pass the 0-death gate (npm run eval).
 */
(function () {
  'use strict';
  var T = 40, SPEED = 220, JUMP_V = -600, GRAV = 1300;
  var scene, player, world, spawn, levelGoalX = 0;
  var input = { left: false, right: false, jump: false };
  var auto = false, jumpLatch = false;
  var deaths = 0, won = false, frame = 0, coins = 0, lastDeathX = 0, maxX = 0;

  function sense(onGround) {
    var probeX = player.x + 26, footY = player.y + 22;
    var groundAhead = Studio.Autopilot.groundAt(world.platforms, probeX, footY, T) ||
      (world.crumble && Studio.Autopilot.groundAt(world.crumble, probeX, footY, T));   // crumble bridges count as ground
    var blockedRight = player.body.blocked.right; // solid walls only (overlaps set touching.*)
    var enemyAhead = false;
    world.enemies.getChildren().forEach(function (e) {
      if (e.active && e.x > player.x && e.x - player.x < 64 && Math.abs(e.y - player.y) < 52) enemyAhead = true;
    });
    return { onGround: onGround, groundAhead: groundAhead, blockedRight: blockedRight, enemyAhead: enemyAhead, x: player.x, goalX: levelGoalX };
  }

  function snapshot() {
    return {
      x: Math.round(player.x), y: Math.round(player.y),
      vx: Math.round(player.body.velocity.x), vy: Math.round(player.body.velocity.y),
      onGround: !!(player.body.blocked.down || player.body.touching.down),
      deaths: deaths, dead: deaths > 0, won: won, frame: frame, coins: coins, goalX: levelGoalX,
      lastDeathX: lastDeathX, maxX: Math.round(maxX)
    };
  }
  function reset() {
    deaths = 0; won = false; frame = 0; coins = 0; auto = false; jumpLatch = false;
    player.setVelocity(0, 0); player.setPosition(spawn.x, spawn.y);
    if (Studio.Mechanics) Studio.Mechanics.reset(world);   // restore crumble for the determinism gate
  }
  function respawn() { player.setVelocity(0, 0); player.setPosition(spawn.x, spawn.y); jumpLatch = false; }
  function die() { deaths++; lastDeathX = Math.round(player.x); respawn(); }
  function hud() { if (scene._hudObj) scene._hudObj.set({ coins: coins }); }

  var Play = {
    key: 'Play',
    // manifest-driven assets: load any GENERATED art (window.SPRITES, written by tools/art-sprites.mjs).
    // None yet on a fresh scaffold → Studio.Hero falls back to the Studio.Toon rig. Art-ready out of the box.
    preload: function () {
      var sc = this; var S = window.SPRITES;
      if (S && S.hero) sc.load.spritesheet('hero_sheet', 'assets/' + S.hero.sheet, { frameWidth: S.hero.frameWidth, frameHeight: S.hero.frameHeight });
      if (S && S.enemies) Object.keys(S.enemies).forEach(function (k) { var en = S.enemies[k]; sc.load.spritesheet('enemy_' + k, 'assets/' + en.sheet, { frameWidth: en.frameWidth, frameHeight: en.frameHeight }); });
      if (S && S.tiles) Object.keys(S.tiles).forEach(function (k) { sc.load.image('tile_' + k, 'assets/' + S.tiles[k]); });
      if (S && S.props) Object.keys(S.props).forEach(function (k) { sc.load.image('prop_' + k, 'assets/' + S.props[k]); });
      // generated per-world BACKDROPS (tools/art.mjs) → keyed bg0..bgN by level index; coverBackdrop draws them when present.
      var _bgslug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
      (window.LEVELS || []).forEach(function (l, i) { sc.load.image('bg' + i, 'assets/backdrops/' + _bgslug(l.name || ('level' + (i + 1))) + '.jpg'); });
      sc.load.on('loaderror', function () {});   // missing art → silent fallback to baked/rig
    },
    create: function () {
      scene = this;
      // ?level=N jumps straight to level N (1-based) — the engine's uniform
      // level-jump contract, so any game can be deep-linked/recorded per level.
      // (100+N is also accepted, the showcase-recorder convention.)
      var _lv = window.__startLevel || parseInt(new URLSearchParams(location.search).get('level') || '1', 10) || 1;
      if (_lv > 100) _lv -= 100;
      var spec = window.LEVELS[Math.max(0, Math.min(window.LEVELS.length - 1, _lv - 1))];
      this.cameras.main.setBackgroundColor(spec.sky || 0x1d2b53);
      // a GENERATED photo backdrop for this world if present (coverBackdrop fills the canvas), else procedural parallax
      if (this.textures.exists('bg' + (_lv - 1))) {
        Studio.coverBackdrop(this, this.add.image(0, 0, 'bg' + (_lv - 1)), { scroll: 0, depth: -100 });
      } else {
        Studio.Backdrop(this, { top: 0x2a3a64, bottom: 0x0b1021, worldWidth: spec.width, layers: [{ color: 0x16203a, scroll: 0.25, amp: 90, y: spec.groundY - 30 }, { color: 0x222f4e, scroll: 0.5, amp: 55, y: spec.groundY }] });
      }
      // OPTIONAL weather: a level opts in with `weather:[...]` — it changes as you run (Studio.Weather). Visual-only; gate-safe.
      if (spec.weather && Studio.Weather) this._weather = Studio.Weather.attach(this, { sequence: spec.weather, cycleEvery: spec.weatherEvery || 1100 });
      Studio.Textures.kit(this, { tile: T });
      world = Studio.Level.build(this, spec);
      spawn = world.spawn; levelGoalX = world.goalX;
      this.add.image(levelGoalX, spec.groundY - 42, 'goal');

      player = this.physics.add.sprite(spawn.x, spawn.y, 'hero');
      player.setVisible(false);   // the baked body is the physics proxy; Studio.Hero draws the actor
      this._hero = Studio.Hero.create(this, { sprite: 'hero_sheet', manifest: window.SPRITES && window.SPRITES.hero, rigDef: window.CHARACTER, height: 42, feetY: 6 });
      this.physics.add.collider(player, world.platforms);
      Studio.Mechanics.install(this, player, world);   // crumble collider + mechanic state (#30)
      Studio.Mechanics.decorate(this, world);          // visual telegraphs for belt/dash/field zones
      if (spec.boss) Studio.Boss.create(this, world, spec.boss);   // multi-HP boss finale (#44)
      this.physics.add.overlap(player, world.coins, function (p, c) {
        c.disableBody(true, true); coins++; Studio.Audio.sfx('coin');
        Studio.Juice.burst(scene, c.x, c.y, { n: 8, tint: 0xffd700, life: 380 }); hud();
      });
      this.physics.add.overlap(player, world.hazards, function () { die(); });
      this.physics.add.overlap(player, world.enemies, function (p, e) {
        if (!e.active) return;
        if (e.boss) { Studio.Boss.onStomp(scene, world, p); return; }   // multi-HP boss (#44)
        if (p.body.velocity.y > 40 && p.y < e.y - 6) { // stomp from above
          e.disableBody(true, true); p.setVelocityY(-380); Studio.Audio.sfx('stomp');
          Studio.Juice.squash(scene, p); Studio.Juice.shake(scene, 90, 0.006);
          Studio.Juice.burst(scene, e.x, e.y, { n: 10, tint: 0xef476f });
        } // side contact is non-lethal in the template (a Gameplay-agent choice)
      });

      Studio.Cam.follow(this, player, { bounds: [0, 0, spec.width, spec.height], deadzone: [260, 200] });
      Studio.Juice.ambient(this, spec.width);
      Studio.Juice.vignette(this, 0.4);
      Studio.Juice.glow(player, 0xffe08a, 2);

      scene._hudObj = Studio.Shell.hud(this, { fields: [{ key: 'coins', icon: '◆' }] });   // reusable HUD layer
      hud();
      this.cursors = this.input.keyboard.createCursorKeys();
      this._touch = Studio.Touch.create(this, { down: false });   // on-screen joystick + JUMP (mobile)

      Studio.harness.install(window.game, {
        snapshot: snapshot,
        setInput: function (o) { input = Object.assign({ left: false, right: false, jump: false }, o || {}); },
        autopilot: function (on) { auto = !!on; input = { left: false, right: false, jump: false }; },
        reset: reset
      });
      window.__sense = function () { var og = player.body.blocked.down || player.body.touching.down; var s = sense(og); s.decision = Studio.Autopilot.platformer(s); return s; };
      // shell: story intro card · pause (P/ESC + ⏸) · ui state
      window.__paused = false; window.__won = false; scene._world = _lv;
      Studio.Shell.intro(this, { world: _lv, name: spec.name });
      this._pause = Studio.Shell.pause(this, {});
      if (Studio.uistate) Studio.uistate.set(this.game, 'play');
    },
    update: function () {
      if (window.__paused) return;
      if (!player) return; frame++;
      if (player.x > maxX) maxX = player.x;
      var b = player.body, onGround = b.blocked.down || b.touching.down;
      var mv;
      if (auto) {
        var sn = sense(onGround); mv = Studio.Autopilot.platformer(sn);
        if (window.__trace) window.__trace.push({ f: frame, x: Math.round(player.x), g: onGround ? 1 : 0, gA: sn.groundAhead ? 1 : 0, bR: sn.blockedRight ? 1 : 0, eA: sn.enemyAhead ? 1 : 0, J: mv.jump ? 1 : 0 });
      } else mv = manual();
      if (mv.left) { player.setVelocityX(-SPEED); player.setFlipX(true); }
      else if (mv.right) { player.setVelocityX(SPEED); player.setFlipX(false); }
      else player.setVelocityX(0);
      if (mv.jump && onGround && !jumpLatch) { player.setVelocityY(JUMP_V); jumpLatch = true; Studio.Audio.sfx('jump'); }
      if (!mv.jump) jumpLatch = false;
      if (this._touch) this._touch.setViz(mv);
      if (this._hero) {   // draw the manifest-driven actor over the (invisible) physics body
        var st = !onGround ? (b.velocity.y < -30 ? 'jump' : 'fall') : (Math.abs(b.velocity.x) > 20 ? 'run' : 'idle');
        this._hero.sync(player.x, player.y + 19, player.flipX); this._hero.state(st); this._hero.update(16.667);
      }
      Studio.Mechanics.step(this, player, world);   // conveyor/dashpad/fields/crumble — AFTER input sets velocity

      Studio.Enemies.step(this, world, frame);   // walker patrol + flyer sweep (#31)
      Studio.Boss.step(this, world);             // boss reel/phase/patrol (#44)
      if (this._weather) this._weather.update(this.cameras.main.scrollX, 16.667);   // weather advances by distance run (opt-in)

      if (!won && player.x >= levelGoalX - 8 && Studio.Boss.defeated(world)) {   // win gated on the boss
        won = true; Studio.Audio.sfx('win'); Studio.Juice.flash(scene, 200, 6, 214, 160);
        if (!auto) { var nx = (scene._world || 1) + 1; Studio.Shell.banner(scene, 'win', { lines: ['◆ ' + coins + ' collected'], next: nx <= window.LEVELS.length ? nx : null, last: nx > window.LEVELS.length }); }
      }
      if (player.y > scene.scale.height + 120) die();
    }
  };
  function manual() {
    var c = scene.cursors, t = (scene._touch && scene._touch.state) || {};
    if (!c) return input;
    return { left: c.left.isDown || t.left, right: c.right.isDown || t.right, jump: c.up.isDown || c.space.isDown || t.jump };
  }

  // the shell: a title / world-select menu (live players see it; ?level boots straight to Play).
  // A scaffolded game customizes this (name/tagline/thumbs/links) — the menu comes for free.
  window.SHELL = {
    name: 'Studio Game', tagline: 'A platformer built on the game-engine.', accent: 0x7cc6ff, sky: 0x0b1021,
    worlds: (window.LEVELS || []).map(function (l) { return { name: l.name || 'World', color: l.sky }; }),
    links: { diary: '/diary.html', build: '/build.html', design: '/design.html' },
  };

  var config = {
    type: Phaser.AUTO, parent: 'game', width: 960, height: 540, backgroundColor: '#1d2b53', seed: ['game-template'],
    // FIT + centre so the canvas fills/letterboxes any viewport (phone/desktop); fps floor clamps the delta.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { min: 30, target: 60, smoothStep: true },
    render: { preserveDrawingBuffer: true, pixelArt: true },
    physics: { default: 'arcade', arcade: { gravity: { y: GRAV }, debug: false } },
    scene: [Studio.Shell.title(), Play]
  };
  var r = new URLSearchParams(location.search).get('r');
  if (r === 'canvas') config.type = Phaser.CANVAS; else if (r === 'webgl') config.type = Phaser.WEBGL;
  window.game = new Phaser.Game(config);
  Studio.responsive(window.game);   // re-fit after the mobile viewport settles (no stretched canvas)
})();

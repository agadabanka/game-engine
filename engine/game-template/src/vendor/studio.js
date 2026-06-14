/*
 * Studio SDK — an opinionated layer on top of Phaser 4 (phaser-private) that
 * makes the AI-game-studio conventions native, so every scaffolded game inherits:
 *
 *   Studio.harness   deterministic stepper + semantic observability (the eval backbone)
 *   Studio.Autopilot generic platformer driver (the 0-death gate)
 *   Studio.Level     data-driven level DSL  ->  built world
 *   Studio.Textures  procedural texture bakery (no external art needed)
 *   Studio.Juice     tweens / particles / Phaser-4 GPU filters (the "feel" surface)
 *   Studio.Audio     procedural WebAudio SFX + music hook
 *   Studio.Cam       follow camera w/ deadzone + bounds
 *   Studio.Materials look + footing + grounding (AI-safe surfaces)
 *
 * Load order in a game:  <script src="phaser.min.js"></script>
 *                        <script src="studio.js"></script>
 */
(function (root) {
  'use strict';
  var Studio = { version: '0.2.0' }; // 0.2.0: +RNG/Toon/Brawl + Juice surfaces (funded by Biome Bash)

  // --------------------------------------------------------------------- RNG
  // Gameplay randomness must come from here, never Math.random, so the
  // deterministic stepper replays bit-identically (the eval contract).
  Studio.RNG = function (seed) { this.s = (seed >>> 0) || 1; };
  Studio.RNG.prototype.next = function () {
    var x = this.s; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this.s = x;
    return x / 4294967296;
  };
  Studio.RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Studio.RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  Studio.RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; };

  // ---------------------------------------------------------------- Materials
  // Each surface declares its look + footing + machine-readable grounding,
  // so levels are AI-completable by construction.
  Studio.Materials = {
    table: {
      solid: { color: 0x3a5a40, top: 0x588157, friction: 1, deadly: false, ground: true },
      stone: { color: 0x6b705c, top: 0x8a8d7a, friction: 1, deadly: false, ground: true },
      ice: { color: 0x9fd3e0, top: 0xd6f1f7, friction: 0.05, deadly: false, ground: true },
      lava: { color: 0xd00000, top: 0xff5400, friction: 1, deadly: true, ground: false },
      mud: { color: 0x6f4518, top: 0x8a5a2b, friction: 2.2, deadly: false, ground: true },
      // biome set (funded by Biome Bash) — one footing per arena flavor
      cloud: { color: 0xa8b8d8, top: 0xf4f8ff, friction: 0.9, deadly: false, ground: true },
      vine: { color: 0x2d6a4f, top: 0x74c69d, friction: 1, deadly: false, ground: true },
      basalt: { color: 0x3d2b3d, top: 0x7d5260, friction: 1, deadly: false, ground: true },
      snow: { color: 0x8ecae6, top: 0xf1faee, friction: 0.45, deadly: false, ground: true },
      neon: { color: 0x1b1b3a, top: 0x4cc9f0, friction: 1, deadly: false, ground: true },
      // confection set (funded by Lovelump) — a candy-world palette + SWEET HAZARDS.
      // footings:
      candy: { color: 0xff7eb3, top: 0xffd6ea, friction: 1, deadly: false, ground: true },
      reef: { color: 0x2bb6a6, top: 0xa9f3ea, friction: 0.9, deadly: false, ground: true },
      lily: { color: 0x49b36a, top: 0xb4f3b0, friction: 1, deadly: false, ground: true },
      hedge: { color: 0x2f9e5e, top: 0x86e6a4, friction: 1, deadly: false, ground: true },
      bloom: { color: 0xe85d9c, top: 0xffc6e0, friction: 1, deadly: false, ground: true },
      cocoa: { color: 0x6b4226, top: 0xb07a4e, friction: 1, deadly: false, ground: true },
      frosting: { color: 0xf7c6dd, top: 0xffffff, friction: 0.5, deadly: false, ground: true },
      // hazards (deadly — routed to the hazards group):
      lagoon: { color: 0x1f7fc4, top: 0x86d0ff, friction: 1, deadly: true, ground: false }, // pink-lemonade water
      thorn: { color: 0x7b2a8a, top: 0xc81d9e, friction: 1, deadly: true, ground: false }, // bramble patch
      fudge: { color: 0x3f2207, top: 0xc0631f, friction: 1, deadly: true, ground: false }  // molten chocolate
    },
    get: function (name) { return this.table[name] || this.table.solid; }
  };

  // ---------- color helpers (hex int math) for the texture bakery ----------
  Studio._mix = function (a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t));
  };
  Studio._lighten = function (c, t) { return Studio._mix(c, 0xffffff, t); };
  Studio._darken = function (c, t) { return Studio._mix(c, 0x000000, t); };

  // ----------------------------------------------------------- TextureFactory
  // Procedural art: shaded, outlined sprites + gradient ground (no AI required).
  Studio.Textures = {
    // Set Studio._headless before boot (no renderer) to skip ALL texture
    // generation: generateTexture needs a renderer, but a sim-only run (scan/
    // gate) never shows pixels — Phaser falls back to a placeholder texture and
    // the deterministic sim is byte-identical. ~20x faster than rendering.
    bake: function (scene, key, w, h, draw) {
      if (Studio._headless) { return key; }
      if (scene.textures.exists(key)) scene.textures.remove(key);
      var g = scene.add.graphics(); draw(g, w, h); g.generateTexture(key, w, h); g.destroy(); return key;
    },
    // vertical gradient as horizontal bands — cross-renderer safe; stretches cleanly across a slab
    gradStrip: function (scene, key, top, bottom, h) {
      h = h || 64;
      this.bake(scene, key, 16, h, function (g) {
        var bands = 24, bh = Math.ceil(h / bands) + 1;
        for (var i = 0; i < bands; i++) { var t = i / (bands - 1); g.fillStyle(Studio._mix(top, bottom, t), 1).fillRect(0, Math.round(t * (h - bh)), 16, bh); }
      });
    },
    // a THEMED material tile — a clay/candy SHELF look (lit rounded top lip + shaded, speckled body
    // + bold dark surface outline) instead of a flat gradient, recoloured per material. Drop-in for
    // grad_<mat>; a game can override with a generated tile_<mat> texture (Level.build prefers it).
    materialTile: function (scene, key, m) {
      var body = m.color, top = m.top, lite = Studio._lighten(top, 0.4), dark = Studio._darken(body, 0.42), line = 0x1d1d28, W = 128, H = 96;
      this.bake(scene, key, W, H, function (g) {
        g.fillStyle(body, 1).fillRect(0, 0, W, H);
        for (var i = 0; i < 12; i++) { var t = i / 11; g.fillStyle(Studio._mix(Studio._lighten(body, 0.14), dark, t), 1).fillRect(0, Math.round(20 + t * (H - 20)), W, Math.ceil((H - 20) / 12) + 1); }
        g.fillStyle(lite, 0.42); g.fillCircle(W * 0.22, H * 0.5, 6).fillCircle(W * 0.7, H * 0.62, 5).fillCircle(W * 0.45, H * 0.8, 4);
        g.fillStyle(dark, 0.34); g.fillCircle(W * 0.55, H * 0.45, 4).fillCircle(W * 0.85, H * 0.78, 4).fillCircle(W * 0.12, H * 0.74, 3);
        g.fillStyle(top, 1).fillRoundedRect(0, 0, W, 22, { tl: 12, tr: 12, bl: 0, br: 0 });        // rounded clay lip
        g.fillStyle(lite, 0.85).fillRoundedRect(0, 3, W, 7, { tl: 12, tr: 12, bl: 0, br: 0 });     // highlight
        g.fillStyle(line, 0.9).fillRect(0, 0, W, 3);                                               // bold surface edge
      });
    },
    kit: function (scene, opt) {
      opt = opt || {}; var T = opt.tile || 40, M = Studio.Materials, self = this;
      Object.keys(M.table).forEach(function (name) {
        if (scene.textures.exists('tile_' + name)) return;   // a generated clay tile wins (loaded in preload)
        self.materialTile(scene, 'grad_' + name, M.get(name));
      });
      var hero = opt.hero || 0xffd166, enemy = opt.enemy || 0xef476f, goal = opt.goal || 0x06d6a0;
      this.bake(scene, 'hero', 30, 38, function (g) {
        g.fillStyle(0x141414, 1).fillRoundedRect(0, 0, 30, 38, 8);
        g.fillStyle(hero, 1).fillRoundedRect(2, 2, 26, 34, 6);
        g.fillStyle(Studio._lighten(hero, 0.32), 1).fillRoundedRect(2, 2, 26, 13, 6);
        g.fillStyle(Studio._darken(hero, 0.22), 1).fillRect(2, 29, 26, 7);
        g.fillStyle(0xffffff, 1).fillCircle(11, 18, 4).fillCircle(20, 18, 4);
        g.fillStyle(0x141414, 1).fillCircle(12, 18, 2).fillCircle(21, 18, 2);
      });
      this.bake(scene, 'enemy', 32, 28, function (g) {
        g.fillStyle(0x141414, 1).fillRoundedRect(0, 0, 32, 26, 9);
        g.fillStyle(enemy, 1).fillRoundedRect(2, 2, 28, 22, 7);
        g.fillStyle(Studio._darken(enemy, 0.28), 1).fillRect(2, 15, 28, 9);
        g.fillStyle(0xffffff, 1).fillCircle(11, 12, 4).fillCircle(21, 12, 4);
        g.fillStyle(0x141414, 1).fillCircle(12, 13, 2).fillCircle(22, 13, 2);
        g.fillStyle(0x141414, 1).fillRect(7, 24, 6, 4).fillRect(19, 24, 6, 4);
      });
      this.bake(scene, 'coin', 20, 20, function (g) {
        g.fillStyle(0x9a6a00, 1).fillCircle(10, 10, 10);
        g.fillStyle(0xffd700, 1).fillCircle(10, 10, 8);
        g.fillStyle(0xfff3b0, 1).fillCircle(7, 7, 3);
      });
      this.bake(scene, 'goal', 18, 90, function (g) {
        g.fillStyle(Studio._darken(goal, 0.25), 1).fillRoundedRect(0, 0, 18, 90, 5);
        g.fillStyle(goal, 1).fillRoundedRect(2, 2, 14, 86, 4);
        g.fillStyle(Studio._lighten(goal, 0.35), 1).fillRect(3, 3, 4, 84);
      });
      this.bake(scene, 'dot', 8, 8, function (g) { g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4); });
      this.bake(scene, 'block', T, T, function (g) { g.fillStyle(0xffffff, 1).fillRect(0, 0, T, T); });
      this.bake(scene, 'ring', 64, 64, function (g) { g.lineStyle(6, 0xffffff, 1).strokeCircle(32, 32, 28); });
      this.bake(scene, 'star', 26, 26, function (g) {
        g.fillStyle(0xffffff, 1); g.beginPath();
        for (var i = 0; i < 10; i++) { var r = i % 2 ? 5.5 : 13, a = -Math.PI / 2 + i * Math.PI / 5; var px = 13 + Math.cos(a) * r, py = 13 + Math.sin(a) * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
        g.closePath(); g.fillPath();
      });
      this.bake(scene, 'shard', 14, 14, function (g) { g.fillStyle(0xffffff, 1).fillTriangle(7, 0, 14, 12, 0, 12); });
    }
  };

  // --------------------------------------------------------------------- Toon
  // Procedural toony character rigs: a chibi body blob with floating hands and
  // feet (Rayman-style), a full face (eyes/pupils/brows/mouth) and accessories,
  // all baked from a palette def — then a deterministic animation state machine
  // (idle/run/jump/fall/flip/land/jab/heavy/special/hit/tumble/shield/frozen/
  // taunt/victory/defeat) driven by accumulated fixed-step time, so animation
  // replays bit-identically under the eval stepper. No sprite sheets needed.
  Studio.Toon = {
    MOUTHS: ['smile', 'grin', 'o', 'grit', 'frown'],
    bake: function (scene, def) {
      var k = 't_' + def.key + '_';
      // idempotent per character: re-baking destroys textures live rigs are
      // mid-rendering with (Phaser keeps no refcount) → null-texture crash
      if (scene.textures.exists(k + 'body')) return k;
      var B = Studio.Textures, base = def.color, dark = Studio._darken(base, 0.25),
        lite = Studio._lighten(base, 0.3), belly = def.belly != null ? def.belly : Studio._lighten(base, 0.5),
        line = 0x1d1d28, W = def.w || 46, H = def.h || 48, shape = def.shape || 'round';
      // a heart-shaped body: two top lobes + a bottom point (for lovestruck characters);
      // others use the rounded-rect blob. Drawn outline-first so it reads with a clean edge.
      var heart = function (g, col, cx, top, w, h) {
        var r = w * 0.265, ly = top + r * 0.96;
        g.fillStyle(col, 1);
        g.fillCircle(cx - r * 0.9, ly, r); g.fillCircle(cx + r * 0.9, ly, r);
        g.fillTriangle(cx - w * 0.47, ly + r * 0.18, cx + w * 0.47, ly + r * 0.18, cx, top + h);
      };
      B.bake(scene, k + 'body', W + 12, H + 12, function (g) {
        if (shape === 'heart') {
          var cx = (W + 12) / 2, top = 6;
          heart(g, line, cx, top - 3, W + 6, H + 6);            // outline
          heart(g, base, cx, top, W, H);                        // fill
          g.fillStyle(lite, 1).fillCircle(cx - W * 0.24, top + W * 0.2, W * 0.16);  // shine on a lobe
          g.fillStyle(belly, 0.55).fillCircle(cx + W * 0.22, top + H * 0.52, W * 0.2);
          return;
        }
        var x = 6, y = 6, r = shape === 'square' ? 10 : Math.min(W, H) / 2 - (shape === 'bean' ? 6 : 2);
        g.fillStyle(line, 1).fillRoundedRect(x - 3, y - 3, W + 6, H + 6, r + 3);
        g.fillStyle(base, 1).fillRoundedRect(x, y, W, H, r);
        g.fillStyle(lite, 1).fillRoundedRect(x, y, W, H * 0.45, { tl: r, tr: r, bl: 0, br: 0 });
        g.fillStyle(belly, 1).fillEllipse(x + W / 2, y + H * 0.68, W * 0.56, H * 0.5);
        g.fillStyle(dark, 0.35).fillRoundedRect(x, y + H * 0.82, W, H * 0.18, { tl: 0, tr: 0, bl: r, br: r });
      });
      B.bake(scene, k + 'hand', 22, 22, function (g) {
        g.fillStyle(line, 1).fillCircle(11, 11, 10);
        g.fillStyle(def.glove || lite, 1).fillCircle(11, 11, 7.5);
      });
      B.bake(scene, k + 'foot', 24, 16, function (g) {
        g.fillStyle(line, 1).fillEllipse(12, 8, 22, 13);
        g.fillStyle(def.boot || dark, 1).fillEllipse(12, 8, 17, 9);
      });
      B.bake(scene, k + 'eye', 14, 16, function (g) { g.fillStyle(line, 1).fillEllipse(7, 8, 13, 15); g.fillStyle(0xffffff, 1).fillEllipse(7, 8, 10.5, 12.5); });
      B.bake(scene, k + 'pup', 6, 6, function (g) { g.fillStyle(0x14141e, 1).fillCircle(3, 3, 3); });
      B.bake(scene, k + 'brow', 12, 5, function (g) { g.fillStyle(line, 1).fillRoundedRect(0, 0, 12, 5, 2); });
      B.bake(scene, k + 'cheek', 8, 6, function (g) { g.fillStyle(0xff8fa3, 0.85).fillEllipse(4, 3, 8, 5); });
      // mouth set — swapped by mood
      B.bake(scene, k + 'm_smile', 16, 8, function (g) { g.lineStyle(2.5, line, 1); g.beginPath(); g.arc(8, 1, 6, 0.35, Math.PI - 0.35); g.strokePath(); });
      B.bake(scene, k + 'm_grin', 18, 10, function (g) { g.fillStyle(line, 1).slice(9, 1, 8, 0.25, Math.PI - 0.25).fillPath(); g.fillStyle(0xffffff, 1).fillRect(4, 2, 10, 2.5); });
      B.bake(scene, k + 'm_o', 10, 10, function (g) { g.fillStyle(line, 1).fillCircle(5, 5, 4.5); g.fillStyle(0x7a2a3a, 1).fillCircle(5, 5, 3); });
      B.bake(scene, k + 'm_grit', 16, 8, function (g) { g.fillStyle(line, 1).fillRoundedRect(0, 0, 16, 8, 3); g.fillStyle(0xffffff, 1).fillRect(2, 2, 12, 4); g.lineStyle(1, line, 1).lineBetween(8, 2, 8, 6).lineBetween(5, 2, 5, 6).lineBetween(11, 2, 11, 6); });
      B.bake(scene, k + 'm_frown', 16, 8, function (g) { g.lineStyle(2.5, line, 1); g.beginPath(); g.arc(8, 7, 6, Math.PI + 0.35, -0.35); g.strokePath(); });
      // accessories
      (def.acc || []).forEach(function (a) {
        if (a.kind === 'ears') B.bake(scene, k + 'ears', 60, 24, function (g) { g.fillStyle(line, 1).fillCircle(12, 12, 11).fillCircle(48, 12, 11); g.fillStyle(base, 1).fillCircle(12, 12, 8).fillCircle(48, 12, 8); g.fillStyle(belly, 1).fillCircle(12, 12, 4.5).fillCircle(48, 12, 4.5); });
        if (a.kind === 'horns') B.bake(scene, k + 'horns', 56, 20, function (g) { g.fillStyle(line, 1).fillTriangle(2, 20, 12, 0, 22, 20).fillTriangle(34, 20, 44, 0, 54, 20); g.fillStyle(a.color || 0xfff3b0, 1).fillTriangle(6, 19, 12, 4, 18, 19).fillTriangle(38, 19, 44, 4, 50, 19); });
        if (a.kind === 'antenna') B.bake(scene, k + 'antenna', 16, 26, function (g) { g.fillStyle(line, 1).fillRect(6, 8, 4, 18).fillCircle(8, 6, 6); g.fillStyle(a.color || 0xffd60a, 1).fillCircle(8, 6, 3.8); });
        if (a.kind === 'crest') B.bake(scene, k + 'crest', 30, 26, function (g) { g.fillStyle(line, 1).fillTriangle(2, 26, 15, 0, 28, 26); g.fillStyle(a.color || 0xff9e00, 1).fillTriangle(6, 25, 15, 5, 24, 25); g.fillStyle(0xffd60a, 1).fillTriangle(10, 25, 15, 12, 20, 25); });
        if (a.kind === 'tail') B.bake(scene, k + 'tail', 30, 30, function (g) { g.lineStyle(7, line, 1); g.beginPath(); g.arc(15, 15, 10, -1.2, 1.6); g.strokePath(); g.lineStyle(4, base, 1); g.beginPath(); g.arc(15, 15, 10, -1.2, 1.6); g.strokePath(); });
        if (a.kind === 'tuft') B.bake(scene, k + 'tuft', 34, 16, function (g) { g.fillStyle(line, 1).fillTriangle(2, 16, 8, 2, 14, 16).fillTriangle(11, 16, 17, 0, 23, 16).fillTriangle(20, 16, 26, 3, 32, 16); g.fillStyle(lite, 1).fillTriangle(5, 15, 8, 6, 11, 15).fillTriangle(14, 15, 17, 4, 20, 15).fillTriangle(23, 15, 26, 7, 29, 15); });
        if (a.kind === 'visor') B.bake(scene, k + 'visor', 40, 12, function (g) { g.fillStyle(line, 1).fillRoundedRect(0, 0, 40, 12, 5); g.fillStyle(a.color || 0x4cc9f0, 0.95).fillRoundedRect(2, 2, 36, 8, 4); g.fillStyle(0xffffff, 0.5).fillRect(5, 3, 10, 2); });
        if (a.kind === 'leaf') B.bake(scene, k + 'leaf', 20, 22, function (g) { g.fillStyle(line, 1).fillRect(8, 12, 4, 10); g.fillStyle(line, 1).fillEllipse(10, 8, 18, 14); g.fillStyle(a.color || 0x74c69d, 1).fillEllipse(10, 8, 14, 10); });
      });
      return k;
    },
    rig: function (scene, def, x, y) {
      var k = this.bake(scene, def), W = def.w || 46, H = def.h || 48;
      var root = scene.add.container(x, y), trunk = scene.add.container(0, 0);
      var mk = function (tex, px, py, depthFirst) {
        var im = scene.add.image(px, py, tex); im._hx = px; im._hy = py;
        if (depthFirst) trunk.addAt(im, 0); else trunk.add(im); return im;
      };
      var p = {};
      p.footL = scene.add.image(-10, H / 2 + 4, k + 'foot'); p.footR = scene.add.image(10, H / 2 + 4, k + 'foot');
      p.footL._hx = -10; p.footL._hy = H / 2 + 4; p.footR._hx = 10; p.footR._hy = H / 2 + 4;
      root.add([p.footL, p.footR, trunk]);
      (def.acc || []).forEach(function (a) { if (a.kind === 'tail') { p.tail = mk(k + 'tail', -W / 2 - 8, 8); } });
      p.body = mk(k + 'body', 0, 0);
      (def.acc || []).forEach(function (a) {
        if (a.kind === 'ears') p.ears = mk(k + 'ears', 0, -H / 2 - 4);
        if (a.kind === 'horns') p.horns = mk(k + 'horns', 0, -H / 2 - 2);
        if (a.kind === 'antenna') p.antenna = mk(k + 'antenna', 0, -H / 2 - 10);
        if (a.kind === 'crest') p.crest = mk(k + 'crest', 0, -H / 2 - 8);
        if (a.kind === 'tuft') p.tuft = mk(k + 'tuft', 0, -H / 2 - 2);
        if (a.kind === 'leaf') p.leaf = mk(k + 'leaf', 0, -H / 2 - 10);
      });
      p.eyeL = mk(k + 'eye', -9, -H * 0.16); p.eyeR = mk(k + 'eye', 9, -H * 0.16);
      p.pupL = mk(k + 'pup', -7.5, -H * 0.15); p.pupR = mk(k + 'pup', 10.5, -H * 0.15);
      p.browL = mk(k + 'brow', -9, -H * 0.16 - 11); p.browR = mk(k + 'brow', 9, -H * 0.16 - 11);
      p.cheekL = mk(k + 'cheek', -15, -H * 0.05); p.cheekR = mk(k + 'cheek', 15, -H * 0.05);
      p.mouth = mk(k + 'm_smile', 1, -H * 0.16 + 13); p.mouth._key = k;
      (def.acc || []).forEach(function (a) { if (a.kind === 'visor') { p.visor = mk(k + 'visor', 0, -H * 0.16); p.eyeL.setVisible(false); p.eyeR.setVisible(false); p.pupL.setVisible(false); p.pupR.setVisible(false); } });
      p.handL = mk(k + 'hand', -W / 2 - 8, 4); p.handR = mk(k + 'hand', W / 2 + 8, 4);
      var rig = { root: root, trunk: trunk, parts: p, def: def, key: k, state: 'idle', t: 0, dir: 1, mood: 'neutral', scale: def.scale || 1, blinkPhase: (def.key.charCodeAt(0) * 197) % 1700 };
      root.setScale(rig.scale);
      this.face(rig, 'neutral');
      return rig;
    },
    set: function (rig, state) { if (rig.state !== state) { rig.state = state; rig.t = 0; } },
    mouth: function (rig, m) { rig.parts.mouth.setTexture(rig.key + 'm_' + m); },
    face: function (rig, mood) {
      if (rig.mood === mood) return; rig.mood = mood;
      var p = rig.parts, M = { neutral: 'smile', cheer: 'grin', angry: 'grit', hurt: 'o', sad: 'frown', focus: 'smile' }[mood] || 'smile';
      this.mouth(rig, M);
      var bl = p.browL, br = p.browR;
      bl.rotation = br.rotation = 0; bl.y = bl._hy; br.y = br._hy;
      if (mood === 'angry' || mood === 'focus') { bl.rotation = 0.45; br.rotation = -0.45; bl.y = br.y = bl._hy + 4; }
      if (mood === 'hurt') { bl.rotation = -0.3; br.rotation = 0.3; bl.y = br.y = bl._hy - 2; }
      if (mood === 'sad') { bl.rotation = -0.5; br.rotation = 0.5; bl.y = br.y = bl._hy + 2; }
      var pup = mood === 'hurt' ? 0.6 : 1; p.pupL.setScale(pup); p.pupR.setScale(pup);
    },
    // deterministic pose machine — t accumulates the fixed-step dt
    update: function (rig, dt) {
      rig.t += dt;
      var t = rig.t, p = rig.parts, T = rig.trunk, s = rig.state, H = (rig.def.h || 48);
      var sin = Math.sin, abs = Math.abs, min = Math.min;
      rig.root.scaleX = rig.scale * rig.dir; rig.root.scaleY = rig.scale;
      // home everything cheap, then state poses override
      ['handL', 'handR', 'footL', 'footR'].forEach(function (n) { var o = p[n]; if (o) { o.x = o._hx; o.y = o._hy; o.rotation = 0; o.setScale(1); } });
      T.x = 0; T.y = 0; T.rotation = 0; T.scaleX = 1; T.scaleY = 1;
      // blink (skip for visored rigs)
      if (p.eyeL.visible) {
        var bt = (t + rig.blinkPhase) % 2600, blink = bt < 110 ? 0.12 : 1;
        p.eyeL.scaleY = p.eyeR.scaleY = blink; p.pupL.setVisible(blink > 0.5); p.pupR.setVisible(blink > 0.5);
      }
      if (s === 'idle') {
        var b = sin(t * 0.004); T.y = b * 2.2; T.scaleY = 1 + 0.018 * b;
        p.handL.y += -b * 1.6; p.handR.y += -b * 1.6;
      } else if (s === 'run') {
        var ph = t * 0.022;
        T.rotation = 0.1; T.y = -abs(sin(ph)) * 3;
        p.footL.x += sin(ph) * 8; p.footL.y -= Math.max(0, sin(ph + 1.57)) * 6;
        p.footR.x += sin(ph + Math.PI) * 8; p.footR.y -= Math.max(0, sin(ph + 1.57 + Math.PI)) * 6;
        p.handL.x += sin(ph + Math.PI) * 6; p.handL.y += -2 - sin(ph + Math.PI) * 2;
        p.handR.x += sin(ph) * 6; p.handR.y += -2 - sin(ph) * 2;
      } else if (s === 'jump') {
        T.scaleX = 0.93; T.scaleY = 1.12;
        p.handL.y -= 12; p.handR.y -= 12; p.footL.y -= 5; p.footR.y -= 7; p.footL.x += 3; p.footR.x -= 3;
      } else if (s === 'fall') {
        T.scaleX = 1.05; T.scaleY = 0.95;
        p.handL.y -= 14 + sin(t * 0.03) * 3; p.handR.y -= 14 - sin(t * 0.03) * 3;
        p.handL.rotation = sin(t * 0.025) * 0.5; p.handR.rotation = -sin(t * 0.025) * 0.5;
        p.footL.y += sin(t * 0.02) * 2; p.footR.y -= sin(t * 0.02) * 2;
      } else if (s === 'flip') {
        T.rotation = min(1, t / 300) * Math.PI * 2;
        p.footL.y -= 8; p.footR.y -= 8; p.handL.y -= 4; p.handR.y -= 4;
      } else if (s === 'land') {
        var k = min(1, t / 150), e = sin(k * Math.PI);
        T.scaleX = 1 + 0.2 * e; T.scaleY = 1 - 0.22 * e; T.y = 3 * e;
        p.handL.y += 4 * e; p.handR.y += 4 * e;
      } else if (s === 'jab' || s === 'airjab') {
        var k2 = min(1, t / 160), pu = sin(k2 * Math.PI);
        p.handR.x += pu * (rig.def.w || 46) * 0.78; p.handR.y = p.handR._hy - 2; p.handR.setScale(1 + pu * 0.35);
        T.rotation = -0.1 * pu; p.handL.x -= pu * 4;
        if (s === 'airjab') { p.footL.y -= 6; p.footR.y -= 8; }
      } else if (s === 'heavy') {
        var k3 = min(1, t / 340), w = min(1, k3 / 0.45), sw = k3 < 0.45 ? 0 : sin(min(1, (k3 - 0.45) / 0.4) * Math.PI);
        T.rotation = 0.16 * w - 0.22 * sw;
        p.handR.x += -10 * w * (1 - sw) + sw * (rig.def.w || 46) * 1.0; p.handR.y -= sw * 6;
        p.handR.setScale(1 + sw * 0.65 + w * 0.15);
        T.scaleX = 1 + 0.06 * sw; p.footR.x -= 4 * w;
      } else if (s === 'special') {
        var k4 = min(1, t / 280), e4 = sin(k4 * Math.PI);
        T.rotation = -0.06 * e4; T.scaleY = 1 + 0.06 * e4;
        p.handL.x += e4 * (rig.def.w || 46) * 0.6; p.handR.x += e4 * (rig.def.w || 46) * 0.6;
        p.handL.y -= e4 * 6; p.handR.y -= e4 * 6; p.handL.setScale(1 + e4 * 0.3); p.handR.setScale(1 + e4 * 0.3);
      } else if (s === 'hit') {
        T.rotation = sin(t * 0.06) * 0.22; T.x = sin(t * 0.09) * 2;
        p.handL.y -= 6; p.handR.y -= 6;
      } else if (s === 'tumble') {
        T.rotation = t * 0.024; T.y = 0;
        p.handL.x -= 6; p.handR.x += 6; p.handL.y -= 10; p.handR.y -= 10;
        p.footL.x -= 5; p.footR.x += 5;
      } else if (s === 'shield') {
        T.scaleX = 1.07; T.scaleY = 0.88; T.y = 4;
        p.handL.x = -6; p.handR.x = 6; p.handL.y = p.handR.y = -2; p.footL.x -= 3; p.footR.x += 3;
      } else if (s === 'frozen') {
        T.x = sin(t * 0.09) * 1.6; p.handL.y -= 2; p.handR.y -= 2;
      } else if (s === 'taunt') {
        var hop = abs(sin(t * 0.012)); T.y = -hop * 7;
        p.handR.y -= 18 + hop * 4; p.handR.rotation = sin(t * 0.02) * 0.6; p.handR.x += 4;
      } else if (s === 'victory') {
        var vb = abs(sin(t * 0.011)); T.y = -vb * 9; T.rotation = sin(t * 0.0055) * 0.07;
        var alt = Math.floor(t / 330) % 2;
        if (alt) { p.handL.y -= 20 + vb * 6; } else { p.handR.y -= 20 + vb * 6; }
        p.footL.y -= vb * 5; p.footR.y -= vb * 5;
      } else if (s === 'defeat') {
        T.scaleX = 1.06; T.scaleY = 0.9; T.y = 5;
        p.handL.y += 7; p.handR.y += 7; T.rotation = sin(t * 0.002) * 0.03;
      }
      // tail wag + crest flicker style touches
      if (p.tail) { p.tail.rotation = sin(t * 0.006) * 0.25 + (s === 'run' ? 0.3 : 0); }
      if (p.antenna) { p.antenna.rotation = sin(t * 0.008) * 0.12; }
    }
  };

  // ----------------------------------------------------------------- Backdrop
  // Gradient sky (pinned to camera) + parallax silhouette layers — instant depth.
  Studio.Backdrop = function (scene, opt) {
    opt = opt || {};
    var W = scene.scale.width, H = scene.scale.height;
    Studio.Textures.gradStrip(scene, '_sky', opt.top != null ? opt.top : 0x24304f, opt.bottom != null ? opt.bottom : 0x0b1021, 160);
    scene.add.image(W / 2, H / 2, '_sky').setDisplaySize(W, H).setScrollFactor(0).setDepth(-100);
    var span = opt.worldWidth || (W * 2);
    (opt.layers || []).forEach(function (L, li) {
      var g = scene.add.graphics().setScrollFactor(L.scroll != null ? L.scroll : 0.3, 1).setDepth(-90 + li);
      g.fillStyle(L.color, L.alpha != null ? L.alpha : 1);
      var base = L.y != null ? L.y : H * 0.74, step = L.step || 150, amp = L.amp || 70, ph = li * 9 + 1;
      g.beginPath(); g.moveTo(-60, H + 30);
      for (var x = -60; x <= span + 60; x += step) { var y = base - (Math.sin(x * 0.011 + ph) * 0.5 + 0.5) * amp; g.lineTo(x, y); }
      g.lineTo(span + 60, H + 30); g.closePath(); g.fillPath();
    });
  };

  // Standalone parallax silhouette layers (the depth bands from Backdrop) — wide enough to scroll
  // across the whole world. Use OVER a fixed cover photo (which can't parallax) to add real depth
  // motion: each band drifts at its own scrollFactor. layers:[{color,scroll,amp,y,alpha,depth,step,phase}].
  Studio.parallaxHills = function (scene, opt) {
    opt = opt || {};
    var W = scene.scale.width, H = scene.scale.height, span = opt.worldWidth || (W * 2);
    (opt.layers || []).forEach(function (L, li) {
      var g = scene.add.graphics().setScrollFactor(L.scroll != null ? L.scroll : 0.3, 1).setDepth(L.depth != null ? L.depth : (-90 + li));
      g.fillStyle(L.color, L.alpha != null ? L.alpha : 1);
      var base = L.y != null ? L.y : H * 0.74, step = L.step || 150, amp = L.amp || 70, ph = (L.phase != null ? L.phase : li * 9) + 1;
      g.beginPath(); g.moveTo(-60, H + 30);
      for (var x = -60; x <= span + 60; x += step) { var y = base - (Math.sin(x * 0.011 + ph) * 0.5 + 0.5) * amp; g.lineTo(x, y); }
      g.lineTo(span + 60, H + 30); g.closePath(); g.fillPath();
    });
  };

  // Size a backdrop IMAGE to COVER the whole (resizable) canvas — no letterbox gaps —
  // and re-cover on resize. Replaces hard-coded ×1.15 hacks. scroll:0 locks it to the
  // camera (always full-bleed); a small scroll adds parallax (kept oversized to still cover).
  Studio.coverBackdrop = function (scene, image, opt) {
    opt = opt || {};
    var scroll = opt.scroll != null ? opt.scroll : 0;
    image.setOrigin(0.5, 0.5).setScrollFactor(scroll).setDepth(opt.depth != null ? opt.depth : -100);
    function fit() {
      var W = scene.scale.width, H = scene.scale.height;
      var src = image.texture && image.texture.getSourceImage ? image.texture.getSourceImage() : null;
      var iw = (src && src.width) || image.width || W, ih = (src && src.height) || image.height || H;
      image.setScale(Math.max(W / iw, H / ih) * (scroll > 0 ? 1.25 : 1));
      image.setPosition(W / 2, H / 2);
    }
    fit();
    scene.scale.on('resize', fit);
    return image;
  };

  // Keep a FIT-scaled game correctly sized on mobile. Real phones report the WRONG viewport
  // size for a beat after load/rotate (address bar, 100dvh, safe-area insets) — Phaser fits to
  // that stale size and the canvas ends up stretched (every circle an ellipse) until you rotate.
  // Re-fit on resize / orientationchange / visualViewport + a few delayed refreshes after boot.
  Studio.responsive = function (game) {
    if (!game || !game.scale || typeof window === 'undefined') return game;
    var refresh = function () { try { game.scale.refresh(); } catch (e) {} };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', function () { setTimeout(refresh, 60); setTimeout(refresh, 350); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refresh);
    [60, 250, 600, 1200].forEach(function (t) { setTimeout(refresh, t); });
    return game;
  };

  // ------------------------------------------------------------- Shell (menu)
  // A reusable TITLE / level-select scene so games stop booting straight into a level.
  // Add it BEFORE the Play scene:  scene: [Studio.Shell.title(), Play]
  // It reads window.SHELL = { name, tagline, accent, sky, titleArt, links:{diary,build,design},
  //   worlds:[{name,tag,color}], thumbs:[url,…] }. A card click sets window.__startLevel (1-based)
  // and starts 'Play'; the game's Play.create reads window.__startLevel (then ?level, then 1).
  // ?level=N (deep-link / eval / recorder) SKIPS the menu and boots Play directly — so the gate
  // and shorts pipeline are unaffected; only live players (no ?level) see the menu.
  Studio.Shell = {
    title: function () {
      return {
        key: 'Title',
        preload: function () {
          var S = window.SHELL || {}, sc = this;
          if (S.titleArt) sc.load.image('shell_title', S.titleArt);
          (S.thumbs || []).forEach(function (t, i) { if (t) sc.load.image('shell_thumb' + i, t); });
          sc.load.on('loaderror', function () {});
        },
        create: function () {
          var scene = this, W = scene.scale.width, H = scene.scale.height, S = window.SHELL || {};
          var p = new URLSearchParams(location.search);
          if (p.get('level')) { scene.scene.start('Play'); return; }   // deep-link / eval → straight to Play
          if (Studio.uistate) Studio.uistate.set(scene.game, 'menu');
          var accent = S.accent != null ? S.accent : 0xffd34d;
          var accCss = '#' + ('000000' + accent.toString(16)).slice(-6);
          if (scene.textures.exists('shell_title')) { var bg = scene.add.image(W / 2, H / 2, 'shell_title'); var src = bg.texture.getSourceImage(); bg.setScale(Math.max(W / src.width, H / src.height)); }
          else scene.add.rectangle(W / 2, H / 2, W, H, S.sky != null ? S.sky : 0x16121f);
          scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0710, 0.34);
          scene.add.text(34, 24, S.name || 'STUDIO GAME', { fontFamily: 'Arial Black, Arial', fontSize: '46px', color: '#ffffff', stroke: '#140b12', strokeThickness: 8 }).setShadow(0, 4, '#000', 10, true, true);
          if (S.tagline) scene.add.text(36, 80, S.tagline, { fontFamily: 'Arial', fontSize: '15px', color: accCss, stroke: '#140b12', strokeThickness: 3, wordWrap: { width: W * 0.62 } });
          var worlds = S.worlds || (window.LEVELS || []).map(function (l) { return { name: l.name, color: l.sky }; });
          var n = worlds.length || 1;
          scene._sel = 0;
          var cw = Math.min(176, (W - 90) / n - 16), ch = Math.round(cw * 0.62), gap = 16;
          var total = n * cw + (n - 1) * gap, x0 = (W - total) / 2 + cw / 2, cy = H - 156;
          scene._cards = [];
          var tag = scene.add.text(W / 2, cy + ch / 2 + 24, '', { fontFamily: 'Arial', fontSize: '15px', color: accCss }).setOrigin(0.5);
          function sel(i) { scene._sel = i; scene._cards.forEach(function (c, j) { var on = j === i; c.border.setStrokeStyle(4, accent, on ? 1 : 0); c.card.setScale(on ? 1.08 : 1); c.card.setDepth(on ? 5 : 0); c.name.setColor(on ? accCss : '#ffffff'); }); tag.setText(worlds[i] && worlds[i].tag ? '▸ ' + worlds[i].tag : (worlds[i] ? worlds[i].name : '')); }
          function start() { if (scene._starting) return; scene._starting = true; window.__startLevel = scene._sel + 1; if (Studio.uistate) Studio.uistate.set(scene.game, 'play'); scene.cameras.main.fadeOut(220, 0, 0, 0); scene.time.delayedCall(240, function () { scene.scene.start('Play'); }); }
          worlds.forEach(function (w, i) {
            var x = x0 + i * (cw + gap), card = scene.add.container(x, cy);
            var thumb = scene.textures.exists('shell_thumb' + i) ? scene.add.image(0, 0, 'shell_thumb' + i).setDisplaySize(cw, ch) : scene.add.rectangle(0, 0, cw, ch, w.color != null ? w.color : 0x2a2440);
            var scrim = scene.add.rectangle(0, ch / 2 - 14, cw, 28, 0x05060c, 0.74);
            var border = scene.add.rectangle(0, 0, cw + 6, ch + 6, 0, 0).setStrokeStyle(4, accent, 0);
            var badge = scene.add.text(-cw / 2 + 7, -ch / 2 + 5, String(i + 1), { fontFamily: 'Arial Black, Arial', fontSize: '16px', color: accCss, stroke: '#000', strokeThickness: 4 });
            var name = scene.add.text(0, ch / 2 - 14, w.name, { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff' }).setOrigin(0.5);
            card.add([thumb, scrim, border, badge, name]);
            scene.tweens.add({ targets: card, y: cy - 5, duration: 1500 + i * 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
            var hit = scene.add.zone(x, cy, cw + 12, ch + 12).setInteractive({ useHandCursor: true });
            hit.on('pointerover', function () { sel(i); });
            hit.on('pointerdown', function () { sel(i); start(); });
            scene._cards.push({ card: card, border: border, name: name });
          });
          sel(0);
          var prompt = scene.add.text(W / 2, H - 42, '▶  PICK A WORLD  ·  OR PRESS SPACE', { fontFamily: 'Arial Black, Arial', fontSize: '15px', color: '#ffffff', stroke: '#1c1320', strokeThickness: 6 }).setOrigin(0.5);
          scene.tweens.add({ targets: prompt, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
          var Lk = S.links || {}, lx = W - 22, ly = 22;
          function link(label, href, color) { if (!href) return; var t = scene.add.text(lx, ly, label, { fontFamily: 'Arial', fontSize: '14px', color: color }).setOrigin(1, 0).setInteractive({ useHandCursor: true }); t.on('pointerdown', function () { window.location.href = href; }); ly += 25; }
          link('📖 diary', Lk.diary, '#ffd98a'); link('🧱 builder', Lk.build, '#9fd6ff'); link('✏️ design', Lk.design, '#c9a7ff');
          scene.input.keyboard.on('keydown-RIGHT', function () { sel((scene._sel + 1) % n); });
          scene.input.keyboard.on('keydown-LEFT', function () { sel((scene._sel - 1 + n) % n); });
          ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'].forEach(function (k, i) { scene.input.keyboard.on('keydown-' + k, function () { if (worlds[i]) sel(i); }); });
          scene.input.keyboard.once('keydown-SPACE', start);
          scene.cameras.main.fadeIn(260, 0, 0, 0);
        }
      };
    }
  };

  // ── Shell UI: intro cards · HUD · pause · win/lose overlays (attach to the Play scene) ──
  var _accCss = function (a) { return '#' + ('000000' + (a >>> 0).toString(16)).slice(-6); };
  // non-blocking per-level intro card: "WORLD N · NAME" + a story beat; fades in / holds / out.
  Studio.Shell.intro = function (scene, opt) {
    opt = opt || {}; var W = scene.scale.width, acc = opt.accent != null ? opt.accent : 0xffd34d;
    var c = scene.add.container(W / 2, 92).setDepth(120).setScrollFactor(0).setAlpha(0);
    var pw = Math.min(640, W - 40);
    var panel = scene.add.rectangle(0, 0, pw, 92, 0x0a0710, 0.72).setStrokeStyle(3, acc, 0.9);
    var head = scene.add.text(0, -24, (opt.world ? 'WORLD ' + opt.world + ' · ' : '') + (opt.name || ''), { fontFamily: 'Arial Black, Arial', fontSize: '22px', color: _accCss(acc) }).setOrigin(0.5);
    var beat = scene.add.text(0, 12, opt.beat || '', { fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', align: 'center', wordWrap: { width: pw - 50 } }).setOrigin(0.5);
    c.add([panel, head, beat]);
    scene.tweens.add({ targets: c, alpha: 1, duration: 280, yoyo: true, hold: (opt.hold || 1400), onComplete: function () { try { c.destroy(); } catch (e) {} } });
    return c;
  };
  // a reusable HUD strip (top-left pills). fields:[{key,label,icon}] → returns { set(values), root }.
  Studio.Shell.hud = function (scene, opt) {
    opt = opt || {}; var fields = opt.fields || [{ key: 'coins', icon: '◆' }, { key: 'score', label: 'SCORE' }];
    var pad = scene.add.rectangle(10, 8, 12 + fields.length * 118, 40, 0x10121f, 0.5).setOrigin(0, 0).setScrollFactor(0).setDepth(98);
    var texts = {}; var x = 22;
    fields.forEach(function (f) {
      texts[f.key] = scene.add.text(x, 16, (f.icon ? f.icon + ' ' : '') + (f.label ? f.label + ' ' : '') + '0', { fontFamily: 'Arial Black, Arial', fontSize: '18px', color: opt.color || '#ffffff' }).setScrollFactor(0).setDepth(100);
      x += 118;
    });
    pad.width = Math.max(12 + fields.length * 118, x - 4);
    return { root: pad, set: function (v) { fields.forEach(function (f) { if (texts[f.key] && v[f.key] != null) texts[f.key].setText((f.icon ? f.icon + ' ' : '') + (f.label ? f.label + ' ' : '') + v[f.key]); }); } };
  };
  // a generic centered overlay (dim + panel + title + lines + buttons). buttons:[{label,onClick,accent}].
  Studio.Shell.overlay = function (scene, opt) {
    opt = opt || {}; var W = scene.scale.width, H = scene.scale.height, acc = opt.accent != null ? opt.accent : 0xffd34d;
    var c = scene.add.container(0, 0).setDepth(200).setScrollFactor(0);
    c.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05030a, 0.6).setInteractive());
    var pw = Math.min(520, W - 60), ph = 120 + (opt.lines || []).length * 26 + (opt.buttons || []).length * 0;
    c.add(scene.add.rectangle(W / 2, H / 2, pw, ph + 80, 0x14101e, 0.97).setStrokeStyle(3, acc, 0.9));
    c.add(scene.add.text(W / 2, H / 2 - ph / 2 - 6, opt.title || '', { fontFamily: 'Arial Black, Arial', fontSize: '28px', color: _accCss(acc), stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
    var y = H / 2 - ph / 2 + 34;
    (opt.lines || []).forEach(function (ln) { c.add(scene.add.text(W / 2, y, ln, { fontFamily: 'Arial', fontSize: '15px', color: '#e8e2f0' }).setOrigin(0.5)); y += 26; });
    var bw = 150, bg = 14, bs = (opt.buttons || []); var bx = W / 2 - (bs.length * bw + (bs.length - 1) * bg) / 2 + bw / 2, by = H / 2 + ph / 2 + 18;
    bs.forEach(function (b) {
      var col = b.accent != null ? b.accent : acc;
      var box = scene.add.rectangle(bx, by, bw, 44, col, 0.95).setStrokeStyle(2, 0xffffff, 0.25).setInteractive({ useHandCursor: true });
      var t = scene.add.text(bx, by, b.label, { fontFamily: 'Arial Black, Arial', fontSize: '15px', color: '#1a1020' }).setOrigin(0.5);
      box.on('pointerover', function () { box.setScale(1.05); }); box.on('pointerout', function () { box.setScale(1); });
      box.on('pointerdown', function () { try { b.onClick && b.onClick(); } catch (e) {} });
      c.add([box, t]); bx += bw + bg;
    });
    c.destroy = (function (orig) { return function () { orig.call(c); }; })(c.destroy);
    return c;
  };
  // pause: P/ESC + an on-screen ⏸ button → overlay (resume / restart / menu / diary). Sets window.__paused
  // (the game's update() early-returns on it). opt: { accent, onMenu, onRestart, diary }.
  Studio.Shell.pause = function (scene, opt) {
    opt = opt || {}; var W = scene.scale.width, ov = null;
    function close() { window.__paused = false; if (ov) { ov.destroy(); ov = null; } if (scene.scene && Studio.uistate) Studio.uistate.set(scene.game, 'play'); }
    function open() {
      if (ov || window.__won) return; window.__paused = true; if (Studio.uistate) Studio.uistate.set(scene.game, 'pause');
      var btns = [{ label: '▶ RESUME', onClick: close }, { label: '↻ RESTART', onClick: function () { close(); (opt.onRestart || function () { scene.scene.start('Play'); })(); } }, { label: '☰ MENU', onClick: function () { window.__paused = false; (opt.onMenu || function () { scene.scene.start('Title'); })(); } }];
      btns.push({ label: '📝 NOTE', onClick: function () { Studio.Shell.note(scene, { accentCss: _accCss(opt.accent != null ? opt.accent : 0xffd34d), meta: { level: scene._world || window.__startLevel || 1 } }); } });
      if (opt.diary !== false) btns.push({ label: '📖 DIARY', onClick: function () { window.location.href = (opt.diary || '/diary.html'); } });
      ov = Studio.Shell.overlay(scene, { title: 'PAUSED', accent: opt.accent, buttons: btns });
    }
    var btn = scene.add.text(W - 18, 14, '⏸', { fontFamily: 'Arial', fontSize: '24px', color: '#ffffff' }).setOrigin(1, 0).setScrollFactor(0).setDepth(105).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', function () { ov ? close() : open(); });
    scene.input.keyboard.on('keydown-P', function () { ov ? close() : open(); });
    scene.input.keyboard.on('keydown-ESC', function () { ov ? close() : open(); });
    return { open: open, close: close, isOpen: function () { return !!ov; } };
  };
  // win / lose banner. kind:'win'|'over'. opt:{ accent, rank, lines:[..], next, onNext, onReplay, onMenu }.
  Studio.Shell.banner = function (scene, kind, opt) {
    opt = opt || {}; window.__won = true; if (Studio.uistate) Studio.uistate.set(scene.game, kind === 'win' ? 'won' : 'over');
    var title = kind === 'win' ? (opt.last ? '★ YOU WIN! ★' : 'WORLD CLEAR!') : 'OOPS!';
    var lines = (opt.rank ? ['RANK  ' + opt.rank] : []).concat(opt.lines || []);
    var btns = [];
    if (kind === 'win' && opt.next != null) btns.push({ label: 'NEXT ▶', onClick: function () { window.__won = false; window.__startLevel = opt.next; (opt.onNext || function () { scene.scene.start('Play'); })(); } });
    btns.push({ label: kind === 'win' ? '↻ REPLAY' : '↻ RETRY', onClick: function () { window.__won = false; (opt.onReplay || function () { scene.scene.start('Play'); })(); } });
    btns.push({ label: '☰ MENU', onClick: function () { window.__won = false; (opt.onMenu || function () { scene.scene.start('Title'); })(); } });
    return Studio.Shell.overlay(scene, { title: title, accent: opt.accent != null ? opt.accent : (kind === 'win' ? 0x06d6a0 : 0xff5d6c), lines: lines, buttons: btns });
  };

  // leave-a-note: a DOM note box from the pause menu → POST /api/notes (the dev feedback channel
  // the notes→issues loop reads). opt: { accentCss, meta:{level,x} }.
  Studio.Shell.note = function (scene, opt) {
    opt = opt || {}; if (typeof document === 'undefined' || document.getElementById('studio-note')) return;
    var acc = opt.accentCss || '#ffd34d';
    var box = document.createElement('div'); box.id = 'studio-note';
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(5,3,10,.6);font-family:system-ui,-apple-system,sans-serif';
    box.innerHTML = '<div style="background:#16111e;border:2px solid ' + acc + ';border-radius:14px;padding:18px;width:min(440px,92vw);color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.6)">'
      + '<div style="font-weight:800;margin-bottom:8px">📝 Leave a note for the dev</div>'
      + '<textarea id="snt" rows="4" placeholder="What felt good / off right here?" style="width:100%;box-sizing:border-box;background:#0c0910;color:#fff;border:1px solid #3a2c44;border-radius:8px;padding:8px;font:inherit"></textarea>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">'
      + '<button id="snx" style="padding:8px 14px;border-radius:8px;border:0;background:#2a2436;color:#fff;cursor:pointer">Cancel</button>'
      + '<button id="sns" style="padding:8px 14px;border-radius:8px;border:0;background:' + acc + ';color:#1a1020;font-weight:800;cursor:pointer">Send</button>'
      + '</div><div id="snm" style="font-size:12px;color:#9fb3e0;margin-top:6px"></div></div>';
    document.body.appendChild(box);
    var t = box.querySelector('#snt'); try { t.focus(); } catch (e) {}
    var close = function () { try { box.remove(); } catch (e) {} };
    box.querySelector('#snx').onclick = close;
    box.querySelector('#sns').onclick = function () {
      var txt = (t.value || '').trim(); if (!txt) { close(); return; }
      var m = opt.meta || {};
      fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt, level: m.level, x: m.x, tag: 'in-game', ts: Date.now() }) })
        .then(function () { box.querySelector('#snm').textContent = 'Sent — thanks! 💌'; setTimeout(close, 900); })
        .catch(function () { box.querySelector('#snm').textContent = 'Could not reach the server.'; });
    };
  };

  // ── uistate: a tiny validated scene-state machine (boot→menu→play⇄pause→won/over→menu) ──
  Studio.uistate = {
    TRANS: { boot: ['menu', 'play'], menu: ['play'], play: ['pause', 'won', 'over', 'menu'], pause: ['play', 'menu'], won: ['play', 'menu'], over: ['play', 'menu'] },
    set: function (game, to) {
      var reg = game && game.registry; var from = (reg && reg.get('uistate')) || 'boot';
      if (from !== to && (this.TRANS[from] || []).indexOf(to) < 0 && typeof console !== 'undefined') console.warn('[uistate] illegal transition', from, '→', to);
      if (reg) reg.set('uistate', to);
      return to;
    },
    get: function (game) { return (game && game.registry && game.registry.get('uistate')) || 'boot'; }
  };

  // ------------------------------------------------------------- Hero (sprite OR rig)
  // Prefer GENERATED sprite art (window.SPRITES.hero, a packed sheet from tools/art-sprites.mjs)
  // and fall back to a procedural Studio.Toon rig — one uniform API either way. Wrap it in a
  // container the game scales for squash-&-stretch; the per-frame anim/rig never fights that.
  //   var hero = Studio.Hero.create(scene, { rigDef: window.CHARACTER, height:76, feetY:22 });
  //   each frame: hero.sync(player.x, player.y, player.flipX); hero.state('run'); hero.update();
  Studio.Hero = {
    create: function (scene, opt) {
      opt = opt || {};
      var wrap = scene.add.container(0, 0).setDepth(opt.depth != null ? opt.depth : 6);
      var S = opt.manifest || ((typeof window !== 'undefined' && window.SPRITES && window.SPRITES.hero) || null);
      var key = opt.sprite || 'hero_sheet', pre = (opt.animPrefix || 'hero') + '_', spr = null, rig = null;
      if (S && scene.textures.exists(key)) {
        var sc = (opt.height || 76) / (S.frameHeight || 128);
        var first = (S.anims && (S.anims.idle ? S.anims.idle[0] : (S.anims[Object.keys(S.anims)[0]] || [0])[0])) || 0;
        spr = scene.add.sprite(0, opt.feetY != null ? opt.feetY : 0, key, first).setOrigin(0.5, 1).setScale(sc);
        wrap.add(spr);
        Object.keys(S.anims || {}).forEach(function (a) {
          var k = pre + a; if (scene.anims.exists(k)) return;
          var fr = a === 'run' ? 14 : a === 'walk' ? 5 : 7;
          scene.anims.create({ key: k, frames: S.anims[a].map(function (f) { return { key: key, frame: f }; }), frameRate: fr, repeat: (a === 'run' || a === 'idle' || a === 'walk') ? -1 : 0 });
        });
        try { spr.play(pre + (S.anims && S.anims.idle ? 'idle' : Object.keys(S.anims)[0])); } catch (e) {}
      } else if (opt.rigDef && Studio.Toon) { rig = Studio.Toon.rig(scene, opt.rigDef, 0, 0); wrap.add(rig.root); }
      var cur = '';
      return {
        wrap: wrap, kind: spr ? 'sprite' : 'rig', sprite: spr, rig: rig,
        sync: function (x, y, flipX) { wrap.setPosition(x, y); if (spr) spr.setFlipX(!!flipX); else if (rig) rig.dir = flipX ? -1 : 1; },
        state: function (name) { if (name === cur) return; cur = name; if (spr) { var k = pre + name; if (scene.anims.exists(k)) spr.play(k, true); } else if (rig) Studio.Toon.set(rig, name); },
        face: function (mood) { if (rig) Studio.Toon.face(rig, mood); },
        update: function (dt) { if (rig) Studio.Toon.update(rig, dt || 16.667); }
      };
    }
  };

  // ------------------------------------------------------------- Touch controls
  // ONE on-screen control overlay (analog joystick OR d-pad + action buttons) that drives a
  // shared input state AND reflects the driver's intent (so a recording's buttons match play).
  // Renderer-agnostic; attach to the Play scene. Shown on touch devices (or ?touch=1 to force).
  //   var ctl = Studio.Touch.create(scene, { down:false, fire:false });
  //   // in manual input: left = keys.left || ctl.state.left ;  each frame: ctl.setViz(currentInput)
  Studio.Touch = {
    create: function (scene, opt) {
      opt = opt || {};
      var accent = opt.accent != null ? opt.accent : 0xffd34d, wantFire = !!opt.fire, wantDown = !!opt.down;
      var state = { left: false, right: false, jump: false, down: false, fire: false };
      var isTouch = (scene.sys && scene.sys.game && scene.sys.game.device.input.touch) || (typeof window !== 'undefined' && 'ontouchstart' in window);
      var show = opt.show != null ? opt.show : (isTouch || (typeof location !== 'undefined' && /[?&]touch=1/.test(location.search)));
      if (isTouch && scene.input && scene.input.addPointer) { try { scene.input.addPointer(3); } catch (e) {} }
      var pref = 'joystick'; try { pref = localStorage.getItem('studio_controller') || 'joystick'; } catch (e) {}
      var dpad = opt.dpad != null ? opt.dpad : (pref === 'dpad');
      var DEPTH = 60, objs = [], joy = null, viz = {};
      function resume() { try { var c = scene.sound && scene.sound.context; if (c && c.state === 'suspended') c.resume(); } catch (e) {} if (opt.onResume) try { opt.onResume(); } catch (e) {} }
      function btn(x, y, r, glyph, col) {
        var box = scene.add.circle(x, y, r, 0x12182b, 0.5).setScrollFactor(0).setDepth(DEPTH).setStrokeStyle(3, 0xffffff, 0.32);
        var t = scene.add.text(x, y, glyph, { fontFamily: 'Arial Black, Arial', fontSize: Math.round(r * 0.7) + 'px', color: col || '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 1);
        objs.push(box, t); return { box: box, t: t };
      }
      function hold(b, key) { b.box.setInteractive(); b.box.on('pointerdown', function () { state[key] = true; resume(); }); b.box.on('pointerup', function () { state[key] = false; }); b.box.on('pointerout', function () { state[key] = false; }); }
      function build() {
        if (!show) return;
        var W = scene.scale.width, H = scene.scale.height, y = H - 84;
        viz.jump = btn(W - 96, y, 56, '⤒', '#fff'); hold(viz.jump, 'jump');
        if (wantFire) { viz.fire = btn(W - 96, y - 132, 48, '●', '#ff8088'); hold(viz.fire, 'fire'); }
        if (dpad) {
          viz.left = btn(96, y, 50, '◀'); hold(viz.left, 'left');
          viz.right = btn(214, y, 50, '▶'); hold(viz.right, 'right');
          if (wantDown) { viz.down = btn(W - 214, y, 44, '▼'); hold(viz.down, 'down'); }
        } else {
          var bx = 132, by = H - 96, R = 76;
          var base = scene.add.circle(bx, by, R, 0x0f1528, 0.42).setScrollFactor(0).setDepth(DEPTH).setStrokeStyle(3, 0xffffff, 0.28);
          var thumb = scene.add.circle(bx, by, 34, 0x2a3556, 0.95).setScrollFactor(0).setDepth(DEPTH + 2).setStrokeStyle(3, accent, 0.85);
          objs.push(base, thumb);
          joy = { bx: bx, by: by, R: R, thumb: thumb, pid: null };
          var setFrom = function (px, py) { var dx = px - bx, dy = py - by, m = Math.hypot(dx, dy) || 1; if (m > R) { dx = dx / m * R; dy = dy / m * R; } thumb.setPosition(bx + dx, by + dy); var nx = dx / R, ny = dy / R; state.left = nx < -0.35; state.right = nx > 0.35; state.jump = ny < -0.55; if (wantDown) state.down = ny > 0.55; };
          var rel = function () { joy.pid = null; thumb.setPosition(bx, by); state.left = state.right = state.down = false; state.jump = false; };
          joy._down = function (p) { if (joy.pid != null) return; if (p.x > W * 0.5) return; joy.pid = p.id; resume(); setFrom(p.x, p.y); };
          joy._move = function (p) { if (p.id === joy.pid) setFrom(p.x, p.y); };
          joy._up = function (p) { if (p.id === joy.pid) rel(); };
          scene.input.on('pointerdown', joy._down); scene.input.on('pointermove', joy._move); scene.input.on('pointerup', joy._up);
        }
      }
      function teardown() { objs.forEach(function (o) { try { o.destroy(); } catch (e) {} }); objs = []; if (joy && joy._down) { scene.input.off('pointerdown', joy._down); scene.input.off('pointermove', joy._move); scene.input.off('pointerup', joy._up); } joy = null; viz = {}; }
      // Only rebuild on a REAL game-size change. Under Scale.FIT the game size is constant (960×540
      // regardless of viewport), so a FIT re-fit / refresh must NOT tear down + rebuild the controls
      // — that would drop an in-progress drag (the bug that made the touch gate flaky).
      var lastW = scene.scale.width, lastH = scene.scale.height;
      function layout() { var W = scene.scale.width, H = scene.scale.height; if (W === lastW && H === lastH) return; lastW = W; lastH = H; teardown(); build(); }
      build();
      scene.scale.on('resize', layout);
      return {
        state: state, isTouch: isTouch, shown: show,
        setViz: function (inp) {
          inp = inp || {};
          var lit = function (o, on) { if (!o) return; o.box.setFillStyle(on ? accent : 0x12182b, on ? 0.95 : 0.5); o.box.setScale(on ? 1.12 : 1); };
          lit(viz.jump, inp.jump); lit(viz.fire, inp.fire);
          if (joy && joy.pid == null) { var dx = (inp.right ? 1 : inp.left ? -1 : 0) * joy.R * 0.6, dy = (inp.jump ? -1 : inp.down ? 1 : 0) * joy.R * 0.6; joy.thumb.setPosition(joy.bx + dx, joy.by + dy); }
          else if (viz.left) { lit(viz.left, inp.left); lit(viz.right, inp.right); lit(viz.down, inp.down); }
        },
        switch: function () { dpad = !dpad; try { localStorage.setItem('studio_controller', dpad ? 'dpad' : 'joystick'); } catch (e) {} layout(); return dpad ? 'dpad' : 'joystick'; },
        destroy: function () { scene.scale.off('resize', layout); teardown(); }
      };
    }
  };

  // --------------------------------------------------------------- Level DSL
  // A level is data. build() returns { platforms, hazards, coins, enemies, spawn, goalX }.
  Studio.Level = {
    build: function (scene, spec) {
      var T = spec.tile || 40, H = spec.height || 540;
      var platforms = scene.physics.add.staticGroup();
      var hazards = scene.physics.add.staticGroup();
      // ONE wide static body per slab — the player slides smoothly with no seams
      // to catch on (which would spoof blocked.right and break the autopilot).
      function slab(group, cx, cy, w, h, mat) {
        // one wide static body, textured with the material: a generated clay tile_<mat> if the game
        // loaded one, else the themed materialTile baked by Textures.kit (clay shelf, not a flat smear).
        var m = mat || 'solid', tex = scene.textures.exists('tile_' + m) ? 'tile_' + m : 'grad_' + m;
        var img = group.create(cx, cy, tex); img.setDisplaySize(w, h).refreshBody();
        return img;
      }
      (spec.ground || []).forEach(function (seg) {
        var mat = seg[2] || 'solid', w = seg[1] - seg[0], h = H - spec.groundY;
        slab(Studio.Materials.get(mat).deadly ? hazards : platforms, seg[0] + w / 2, spec.groundY + h / 2, w, h, mat);
      });
      (spec.walls || []).forEach(function (w) {
        var ht = (w.tiles || 1) * T; slab(platforms, w.x + T / 2, spec.groundY - ht / 2, T, ht, w.mat || 'stone');
      });
      (spec.platforms || []).forEach(function (p) { slab(platforms, p.x + p.w / 2, p.y + T / 2, p.w, T, p.mat || 'solid'); });
      var coins = scene.physics.add.staticGroup();
      (spec.coins || []).forEach(function (c) { coins.create(c.x, c.y, 'coin'); });
      var enemies = scene.physics.add.group({ allowGravity: false, immovable: true });
      (spec.enemies || []).forEach(function (e) {
        var s = enemies.create(e.x, spec.groundY - 14, 'enemy'); s.patrol = e.patrol || 60; s.homeX = e.x; s.dir = 1;
      });
      return {
        platforms: platforms, hazards: hazards, coins: coins, enemies: enemies,
        spawn: spec.spawn || { x: 60, y: spec.groundY - 80 }, goalX: spec.goal != null ? spec.goal : (spec.width - 60)
      };
    }
  };

  // --------------------------------------------------------------- Autopilot
  // Generic platformer policy. Feed it a "sense" object each frame; it returns input.
  // sense = { onGround, groundAhead, blockedRight, enemyAhead, x, goalX }
  Studio.Autopilot = {
    platformer: function (sense) {
      var out = { left: false, right: true, jump: false };
      if (sense.onGround && (!sense.groundAhead || sense.blockedRight || sense.enemyAhead)) out.jump = true;
      return out;
    },
    // convenience: probe a static group for ground under a point
    groundAt: function (group, px, py, tile) {
      var kids = group.getChildren();
      for (var i = 0; i < kids.length; i++) {
        var b = kids[i] && kids[i].body; if (!b) continue;
        if (px >= b.left - 2 && px <= b.right + 2 && b.top >= py - 6 && b.top <= py + (tile || 40)) return true;
      }
      return false;
    }
  };

  // -------------------------------------------------------------------- Brawl
  // The brawler archetype (funded by Biome Bash): Smash-style fighters with
  // damage % + knockback scaling, frame-data attacks (startup/active/recover),
  // stocks + blast-zone KOs, one-way floating platforms, deterministic power-up
  // drops, projectiles, and a tunable CPU policy (iq presets) that doubles as
  // the gate autopilot. All randomness via Studio.RNG; all timing in fixed
  // frames — a whole match replays bit-identically under the eval stepper.
  Studio.Brawl = {
    ATK: {
      jab: { dmg: 5, base: 150, scale: 5.5, range: 52, h: 48, ang: -0.35, startup: 5, active: 6, rec: 10 },
      airjab: { dmg: 6, base: 170, scale: 6.0, range: 56, h: 54, ang: -0.5, startup: 4, active: 7, rec: 8 },
      heavy: { dmg: 11, base: 250, scale: 8.5, range: 64, h: 56, ang: -0.55, startup: 14, active: 7, rec: 17 }
    },
    TUMBLE_KB: 520,
    world: function (scene, spec, seed) {
      var T = Studio.Textures, plats = scene.physics.add.staticGroup();
      function slab(cx, cy, w, h, mat, oneWay) {
        var img = plats.create(cx, cy, 'grad_' + (mat || 'solid')); img.setDisplaySize(w, h).refreshBody();
        if (oneWay) { img.body.checkCollision.down = false; img.body.checkCollision.left = false; img.body.checkCollision.right = false; img._oneWay = true; }
        return img;
      }
      var st = spec.stage;
      slab(st.x + st.w / 2, st.y + st.h / 2, st.w, st.h, st.mat, false);
      var stages = [{ x0: st.x, x1: st.x + st.w, top: st.y }];
      if (spec.stage2) {
        var s2 = spec.stage2;
        slab(s2.x + s2.w / 2, s2.y + s2.h / 2, s2.w, s2.h, s2.mat, false);
        stages.push({ x0: s2.x, x1: s2.x + s2.w, top: s2.y });
      }
      (spec.plats || []).forEach(function (p) { slab(p.x + p.w / 2, p.y + 9, p.w, 18, p.mat || st.mat, true); });
      var w = {
        scene: scene, spec: spec, plats: plats, frame: 0, over: false, winner: null, hitstop: 0,
        rng: new Studio.RNG(seed || 1), fighters: [], shots: [], items: [], bombs: [],
        stages: stages,
        stageX0: Math.min.apply(null, stages.map(function (g) { return g.x0; })),
        stageX1: Math.max.apply(null, stages.map(function (g) { return g.x1; })),
        stageTop: Math.min.apply(null, stages.map(function (g) { return g.top; })),
        blast: spec.blast || { l: -150, r: spec.width + 150, t: -260, b: spec.height + 280 },
        itemEvery: spec.itemEvery || 480, itemTypes: spec.itemTypes || ['heal', 'power', 'speed', 'shield', 'bomb'],
        fx: {}
      };
      return w;
    },
    _fx: function (world, name) { var fn = world.fx[name]; if (fn) fn.apply(null, Array.prototype.slice.call(arguments, 2)); },
    fighter: function (scene, world, def, slot, opts) {
      opts = opts || {};
      var sp = world.spec.spawns[slot % world.spec.spawns.length];
      var s = scene.physics.add.sprite(sp.x, sp.y, 'dot');
      s.setVisible(false); s.body.setSize(34, 50); s.setMaxVelocity(1300, 1500);
      scene.physics.add.collider(s, world.plats, null, function (sprite, plat) {
        return !plat._oneWay || (sprite.body.velocity.y >= 0 && sprite.body.bottom <= plat.body.top + 14);
      });
      var rig = Studio.Toon.rig(scene, def, sp.x, sp.y);
      var f = {
        def: def, slot: slot, s: s, rig: rig, cpu: !!opts.cpu,
        dmg: 0, stocks: opts.stocks != null ? opts.stocks : 3, alive: true, respawnAt: 0,
        invuln: 90, hitstun: 0, tumble: false, frozen: 0, landT: 0, flipT: 0,
        atk: null, cd: { spec: 0, atk: 0 }, jumps: def.airJumps || 1,
        buffs: { power: 0, speed: 0 }, shieldUp: false, shieldHold: 0,
        dir: sp.x < world.spec.width / 2 ? 1 : -1, kos: 0, falls: 0, lastHitBy: null,
        thinkAt: 0, spacing: 60, plan: null,
        iq: opts.iq || { aggro: 0.4, caution: 0.3, itemLove: 0.35, jumpy: 0.4 },
        latch: { jump: false, att: false, heavy: false, spec: false }
      };
      world.fighters.push(f);
      return f;
    },
    resolve: function (scene, world, atk, a, v, hx, hy) {
      if (!v.alive || v.invuln > 0) return false;
      // shields: held shield or the one-hit shield power-up both eat the hit
      if (v.shieldHold > 0 || v.shieldUp) {
        if (v.shieldUp) { v.shieldUp = false; this._fx(world, 'shieldPop', v); }
        v.s.setVelocityX((a.dir || 1) * 140);
        this._fx(world, 'block', v, hx, hy);
        return true;
      }
      var powered = a.buffs.power > 0;
      var dealt = Math.round(atk.dmg * (powered ? 1.5 : 1));
      v.dmg += dealt;
      var kb = (atk.base + v.dmg * atk.scale) * (105 / (v.def.weight || 100)) * (powered ? 1.3 : 1);
      var dir = a.dir || (v.s.x >= a.s.x ? 1 : -1);
      v.s.setVelocity(Math.cos(atk.ang) * kb * dir, Math.sin(atk.ang) * kb);
      v.hitstun = Math.max(16, Math.min(58, Math.round(14 + kb * 0.045)));
      v.tumble = kb > this.TUMBLE_KB;
      v.frozen = 0; v.atk = null; v.shieldHold = 0;
      v.lastHitBy = a; // KO credit resolves at the blast zone
      this._fx(world, 'hit', a, v, dealt, kb, hx != null ? hx : v.s.x, hy != null ? hy : v.s.y - 8);
      return true;
    },
    _startAtk: function (world, f, name) {
      var base = (f.def.atk && f.def.atk[name]) || this.ATK[name] || this.ATK.jab;
      f.atk = { name: name, f: 0, d: base, hit: [] };
      this._fx(world, 'swing', f, name);
    },
    special: function (scene, world, f) {
      var sp = f.def.special; if (!sp || f.cd.spec > 0) return;
      f.cd.spec = sp.cd || 240;
      f.atk = { name: 'special', f: 0, d: { startup: sp.startup || 8, active: sp.active || 6, rec: sp.rec || 14, dmg: 0, range: 0 }, hit: [] };
      this._fx(world, 'special', f);
      if (sp.fire) sp.fire(scene, world, f);
    },
    shot: function (scene, world, o) {
      var im = scene.add.image(o.x, o.y, o.tex || 'dot').setDepth(20);
      if (o.tint != null) im.setTint(o.tint);
      var sh = { x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, grav: o.grav || 0, turn: o.turn || 0, spin: o.spin || 0, life: o.life || 80, owner: o.owner, im: im, dmg: o.dmg || 6, base: o.base || 180, scale: o.scale || 5, ang: o.ang != null ? o.ang : -0.45, freeze: o.freeze || 0, pierce: !!o.pierce };
      world.shots.push(sh);
      this._fx(world, 'shot', sh);
      return sh;
    },
    step: function (scene, world, f, input) {
      var B = this, s = f.s, b = s.body, dtMs = 1000 / 60;
      input = input || {};
      // timers
      if (f.invuln > 0) f.invuln--;
      if (f.cd.spec > 0) f.cd.spec--;
      if (f.cd.atk > 0) f.cd.atk--;
      if (f.buffs.power > 0) f.buffs.power--;
      if (f.buffs.speed > 0) f.buffs.speed--;
      if (f.landT > 0) f.landT--;
      if (f.flipT > 0) f.flipT--;
      // dead / waiting to respawn
      if (!f.alive) {
        if (f.stocks > 0 && world.frame >= f.respawnAt) {
          var sp = world.spec.spawns[f.slot % world.spec.spawns.length];
          f.alive = true; f.dmg = 0; f.invuln = 130; f.hitstun = 0; f.tumble = false; f.frozen = 0; f.atk = null;
          b.enable = true; s.setVelocity(0, 0); s.setPosition(sp.x, sp.y - 60);
          f.rig.root.setVisible(true); Studio.Toon.set(f.rig, 'fall');
          B._fx(world, 'respawn', f);
        } else { return; }
      }
      var onGround = b.blocked.down || b.touching.down;
      var wasAir = f._air; f._air = !onGround;
      if (wasAir && onGround) { f.landT = 9; f.jumps = f.def.airJumps || 1; f._mercy = false; B._fx(world, 'land', f); }
      // hitstun: no control
      if (f.hitstun > 0) {
        f.hitstun--;
        if (onGround) { s.setVelocityX(b.velocity.x * 0.86); if (f.hitstun > 8) f.hitstun = 8; }
        else s.setVelocityX(b.velocity.x * 0.985); // soft air-DI: launches decay, side blasts stay earnable
        Studio.Toon.set(f.rig, f.tumble ? 'tumble' : 'hit'); Studio.Toon.face(f.rig, 'hurt');
      } else if (f.frozen > 0) {
        f.frozen--; s.setVelocityX(b.velocity.x * 0.9);
        Studio.Toon.set(f.rig, 'frozen'); Studio.Toon.face(f.rig, 'sad');
        if (f.frozen === 0) B._fx(world, 'thaw', f);
      } else if (f.atk) {
        // attack timeline
        var d = f.atk.d, k = f.atk.f++;
        if (onGround) s.setVelocityX(b.velocity.x * 0.8);
        var sp2 = f.def.special;
        if (f.atk.name === 'special' && sp2 && sp2.onFrame) sp2.onFrame(scene, world, f, k);
        if (f.atk.name !== 'special' && k >= d.startup && k < d.startup + d.active) {
          var hx = s.x + f.dir * d.range * 0.7, hy = s.y + (d.dy || 0);
          for (var i = 0; i < world.fighters.length; i++) {
            var v = world.fighters[i];
            if (v === f || !v.alive || f.atk.hit.indexOf(v) >= 0) continue;
            if (Math.abs(v.s.x - hx) < d.range * 0.75 && Math.abs(v.s.y - hy) < d.h * 0.75) {
              if (B.resolve(scene, world, d, f, v, (v.s.x + hx) / 2, v.s.y - 6)) f.atk.hit.push(v);
            }
          }
        }
        var total = d.startup + d.active + d.rec;
        var rigState = f.atk.name === 'special' ? 'special' : (f.atk.name === 'heavy' ? 'heavy' : (onGround ? 'jab' : 'airjab'));
        Studio.Toon.set(f.rig, rigState); Studio.Toon.face(f.rig, 'angry');
        if (k >= total) { f.atk = null; f.cd.atk = 6; }
      } else {
        // free control
        var spd = (f.def.speed || 230) * (f.buffs.speed > 0 ? 1.45 : 1);
        if (input.shield && onGround) {
          f.shieldHold++; s.setVelocityX(0);
          Studio.Toon.set(f.rig, 'shield'); Studio.Toon.face(f.rig, 'focus');
        } else {
          f.shieldHold = 0;
          if (input.left) { s.setVelocityX(-spd); f.dir = -1; }
          else if (input.right) { s.setVelocityX(spd); f.dir = 1; }
          else s.setVelocityX(b.velocity.x * (onGround ? 0.55 : 0.92));
          if (input.jump && !f.latch.jump) {
            if (onGround) { s.setVelocityY(-(f.def.jumpV || 640)); B._fx(world, 'jump', f); }
            else if (f.jumps > 0) { f.jumps--; s.setVelocityY(-(f.def.jumpV || 640) * 0.94); f.flipT = 18; B._fx(world, 'djump', f); }
          }
          if (input.down && !onGround && b.velocity.y > -60) s.setVelocityY(Math.min(900, b.velocity.y + 34));
          if (input.att && !f.latch.att && f.cd.atk <= 0) B._startAtk(world, f, onGround ? 'jab' : 'airjab');
          else if (input.heavy && !f.latch.heavy && f.cd.atk <= 0) B._startAtk(world, f, 'heavy');
          else if (input.spec && !f.latch.spec) B.special(scene, world, f);
          // locomotion anim
          if (f.landT > 0) Studio.Toon.set(f.rig, 'land');
          else if (!onGround) Studio.Toon.set(f.rig, f.flipT > 0 ? 'flip' : (b.velocity.y < -40 ? 'jump' : 'fall'));
          else Studio.Toon.set(f.rig, Math.abs(b.velocity.x) > 30 ? 'run' : 'idle');
          if (f.shieldHold === 0) Studio.Toon.face(f.rig, f.dmg > 90 ? 'sad' : 'neutral');
        }
      }
      f.latch.jump = !!input.jump; f.latch.att = !!input.att; f.latch.heavy = !!input.heavy; f.latch.spec = !!input.spec;
      // mirror rig onto the physics body
      f.rig.dir = f.dir;
      f.rig.root.x = s.x; f.rig.root.y = s.y;
      f.rig.root.alpha = f.invuln > 0 ? (world.frame % 8 < 4 ? 0.35 : 0.8) : 1;
      Studio.Toon.update(f.rig, dtMs);
    },
    tick: function (scene, world, inputFor) {
      var B = this;
      world.frame++;
      // power-up drops on a deterministic clock
      if (!world.over && world.frame > 200 && (world.frame % world.itemEvery) === 0 && world.items.length < 2 && world.spec.items && world.spec.items.length) {
        var pt = world.rng.pick(world.spec.items), ty = world.rng.pick(world.itemTypes);
        var im = scene.add.image(pt.x, pt.y, 'item_' + ty).setDepth(22);
        world.items.push({ type: ty, x: pt.x, y: pt.y, born: world.frame, im: im });
        B._fx(world, 'itemSpawn', pt.x, pt.y, ty);
      }
      for (var ii = world.items.length - 1; ii >= 0; ii--) {
        var it = world.items[ii];
        it.im.y = it.y + Math.sin((world.frame - it.born) * 0.06) * 5;
        var taken = false;
        for (var fi = 0; fi < world.fighters.length && !taken; fi++) {
          var ff = world.fighters[fi];
          if (!ff.alive || ff.hitstun > 0) continue;
          if (Math.abs(ff.s.x - it.x) < 32 && Math.abs(ff.s.y - it.im.y) < 44) {
            taken = true; B.applyItem(scene, world, ff, it.type, it.x, it.im.y);
          }
        }
        if (taken || world.frame - it.born > 420) { B._fx(world, 'itemGone', it, taken); it.im.destroy(); world.items.splice(ii, 1); }
      }
      // bombs
      for (var bi = world.bombs.length - 1; bi >= 0; bi--) {
        var bo = world.bombs[bi];
        bo.fuse--; bo.x += bo.vx / 60; bo.vy += 14; bo.y += bo.vy / 60;
        for (var pi = 0; pi < world.plats.getChildren().length; pi++) {
          var pb = world.plats.getChildren()[pi].body;
          if (bo.x > pb.left && bo.x < pb.right && bo.y > pb.top - 8 && bo.y < pb.bottom) { bo.y = pb.top - 8; bo.vy = -Math.abs(bo.vy) * 0.4; bo.vx *= 0.8; break; }
        }
        bo.im.setPosition(bo.x, bo.y); bo.im.rotation += 0.1;
        if (bo.fuse <= 0) {
          B._fx(world, 'boom', bo.x, bo.y);
          for (var vi = 0; vi < world.fighters.length; vi++) {
            var vf = world.fighters[vi];
            if (vf === bo.owner || !vf.alive) continue;
            if (Math.abs(vf.s.x - bo.x) < 130 && Math.abs(vf.s.y - bo.y) < 110) {
              bo.owner.dir = vf.s.x >= bo.x ? 1 : -1;
              B.resolve(scene, world, { dmg: 18, base: 380, scale: 7.5, ang: -0.7 }, bo.owner, vf, bo.x, bo.y);
            }
          }
          bo.im.destroy(); world.bombs.splice(bi, 1);
        }
      }
      // projectiles
      for (var si = world.shots.length - 1; si >= 0; si--) {
        var sh = world.shots[si], dead = false;
        sh.vx += sh.turn; sh.vy += sh.grav / 60;
        sh.x += sh.vx / 60; sh.y += sh.vy / 60; sh.life--;
        sh.im.setPosition(sh.x, sh.y); sh.im.rotation += sh.spin;
        var kids = world.plats.getChildren();
        for (var ki = 0; ki < kids.length; ki++) {
          var kb2 = kids[ki].body;
          if (!kids[ki]._oneWay && sh.x > kb2.left && sh.x < kb2.right && sh.y > kb2.top && sh.y < kb2.bottom) { dead = true; break; }
        }
        if (!dead) {
          for (var vj = 0; vj < world.fighters.length; vj++) {
            var vv = world.fighters[vj];
            if (vv === sh.owner || !vv.alive) continue;
            if (Math.abs(vv.s.x - sh.x) < 30 && Math.abs(vv.s.y - sh.y) < 38) {
              sh.owner.dir = vv.s.x >= sh.x ? 1 : -1;
              var landed = B.resolve(scene, world, sh, sh.owner, vv, sh.x, sh.y);
              if (landed && sh.freeze > 0 && vv.hitstun < 24) {
                // a full freeze mid-air over the void is a guaranteed KO — dampen it
                var vvGround = vv.s.body.blocked.down || vv.s.body.touching.down;
                vv.frozen = vvGround ? sh.freeze : Math.round(sh.freeze * 0.35);
                B._fx(world, 'freeze', vv);
              }
              if (!sh.pierce) { dead = true; break; }
            }
          }
        }
        if (dead || sh.life <= 0) { B._fx(world, 'shotEnd', sh); sh.im.destroy(); world.shots.splice(si, 1); }
      }
      // fighters
      for (var i2 = 0; i2 < world.fighters.length; i2++) {
        var f2 = world.fighters[i2];
        B.step(scene, world, f2, world.over ? {} : (inputFor(f2, i2) || {}));
      }
      // blast-zone KOs
      for (var i3 = 0; i3 < world.fighters.length; i3++) {
        var f3 = world.fighters[i3];
        if (!f3.alive) continue;
        var bl = world.blast, px = f3.s.x, py = f3.s.y;
        if (px < bl.l || px > bl.r || py > bl.b || py < bl.t) {
          f3.falls++; f3.stocks--;
          var killer = f3.lastHitBy && f3.lastHitBy.alive !== undefined ? f3.lastHitBy : null;
          if (killer && killer !== f3) killer.kos++;
          f3.alive = false; f3.s.body.enable = false; f3.s.setVelocity(0, 0);
          f3.rig.root.setVisible(false);
          f3.respawnAt = world.frame + 85;
          B._fx(world, 'ko', f3, killer, Math.max(bl.l + 10, Math.min(bl.r - 10, px)), Math.max(bl.t + 10, Math.min(bl.b - 10, py)));
          if (f3.stocks <= 0) B._fx(world, 'out', f3);
        }
      }
      // sudden death: past the budget the biome itself turns up the heat —
      // everyone's damage creeps so the next clean hit ends it (no stalls)
      var suddenAt = world.spec.suddenAt || 7200;
      if (!world.over && world.frame === suddenAt) { world.sudden = true; B._fx(world, 'sudden'); }
      if (!world.over && world.frame > suddenAt && world.frame % 45 === 0) {
        for (var sd = 0; sd < world.fighters.length; sd++) if (world.fighters[sd].alive) world.fighters[sd].dmg += 2;
      }
      // win check: last toon standing
      if (!world.over) {
        var living = world.fighters.filter(function (f4) { return f4.stocks > 0; });
        if (living.length <= 1) { world.over = true; world.winner = living[0] || null; B._fx(world, 'gameover', world.winner); }
      }
    },
    applyItem: function (scene, world, f, type, x, y) {
      if (type === 'heal') f.dmg = Math.max(0, f.dmg - 40);
      else if (type === 'power') f.buffs.power = 480;
      else if (type === 'speed') f.buffs.speed = 480;
      else if (type === 'shield') f.shieldUp = true;
      else if (type === 'bomb') {
        var im = scene.add.image(x, y, 'item_bomb').setDepth(22);
        world.bombs.push({ x: x, y: y, vx: f.dir * 230, vy: -160, fuse: 75, owner: f, im: im });
      }
      this._fx(world, 'item', f, type, x, y);
    },
    // ---- CPU policy: one brain, tiered by iq. Doubles as the gate autopilot.
    cpu: function (scene, world, f) {
      var B = this, rng = world.rng, s = f.s, iq = f.iq;
      var inp = { left: false, right: false, down: false, jump: false, att: false, heavy: false, spec: false, shield: false };
      if (!f.alive || world.over) return inp;
      // recovery has absolute priority: get back over the stage
      var overStage = false;
      for (var gi = 0; gi < world.stages.length; gi++) {
        var g = world.stages[gi];
        if (s.x > g.x0 - 6 && s.x < g.x1 + 6) { overStage = true; break; }
      }
      var below = s.y > world.stageTop + 40;
      if (!overStage || (below && !(s.body.blocked.down || s.body.touching.down))) {
        // recover to the nearest slab — like a ledge: while below stage-top,
        // climb BESIDE the slab (steering to its centre wedges you underneath)
        var slab = world.stages[0], bd2 = 1e9;
        for (var gj = 0; gj < world.stages.length; gj++) {
          var g3 = world.stages[gj], c3 = (g3.x0 + g3.x1) / 2;
          if (Math.abs(c3 - s.x) < bd2) { bd2 = Math.abs(c3 - s.x); slab = g3; }
        }
        var tx;
        if (s.y < slab.top - 12) tx = (slab.x0 + slab.x1) / 2; // above: drift over it
        // at the face: steer flush INTO the slab — the wall pins you while jumps
        // rise you along it, and the same steering pops you over at the lip.
        // (Holding "just outside" oscillates around the hold-point and sinks.)
        else if (s.x < slab.x0 + 6) tx = slab.x0 + 14;
        else if (s.x > slab.x1 - 6) tx = slab.x1 - 14;
        else tx = (s.x - slab.x0 < slab.x1 - s.x) ? slab.x0 - 26 : slab.x1 + 26; // wedged under: pick the near edge
        if (Math.abs(tx - s.x) > 8) { if (s.x < tx) inp.right = true; else inp.left = true; }
        // pulse the jump key — the input latch needs releases between air jumps
        if (f.jumps > 0 && s.body.velocity.y >= 0) inp.jump = (world.frame % 8) < 4;
        // ledge mercy: when fully spent and still sinking by the face, grant one
        // recovery jump per airtime (kept subtle: only below the stage lip)
        if (f.jumps === 0 && !f._mercy && s.body.velocity.y > 120 && s.y > slab.top + 30) { f.jumps = 1; f._mercy = true; }
        return inp;
      }
      // re-plan on a think cadence (deterministic)
      if (world.frame >= f.thinkAt) {
        f.thinkAt = world.frame + 8 + rng.int(0, 6);
        f.spacing = 42 + rng.range(0, 30);
        // pick target: nearest living opponent
        var best = null, bd = 1e9;
        for (var i = 0; i < world.fighters.length; i++) {
          var o = world.fighters[i];
          if (o === f || !o.alive || o.stocks <= 0) continue;
          var d = Math.abs(o.s.x - s.x) + Math.abs(o.s.y - s.y) * 0.6;
          if (d < bd) { bd = d; best = o; }
        }
        f.plan = { target: best, wantItem: null, act: null, flee: null };
        // champion-tier read: a power-starred rival hits ~2x — keep out of reach
        if (iq.center) {
          for (var pf = 0; pf < world.fighters.length; pf++) {
            var po = world.fighters[pf];
            if (po !== f && po.alive && po.buffs.power > 0 && Math.abs(po.s.x - s.x) < 260) { f.plan.flee = po; break; }
          }
        }
        // item desire
        if (world.items.length) {
          var it = world.items[0];
          var want = (it.type === 'heal' && f.dmg > 45) || rng.next() < iq.itemLove;
          if (want && Math.abs(it.x - s.x) < 320) f.plan.wantItem = it;
        }
        if (best) {
          // endgame read: one rival left → tighten spacing, raise aggression
          // (prevents 1v1 zoning stalls that would outrun the match budget)
          var living = 0;
          for (var lc = 0; lc < world.fighters.length; lc++) { var fo = world.fighters[lc]; if (fo !== f && fo.stocks > 0) living++; }
          f._lone = living <= 1;
          if (f._lone) f.spacing = 38;
          var aggro = f._lone ? Math.min(0.95, iq.aggro + 0.35) : iq.aggro;
          var dx = best.s.x - s.x, adx = Math.abs(dx), ady = Math.abs(best.s.y - s.y);
          var inRange = adx < ((f.def.atk && f.def.atk.jab && f.def.atk.jab.range) || B.ATK.jab.range) + 16 && ady < 56;
          if (inRange && f.cd.atk <= 0 && best.invuln <= 0 && rng.next() < aggro) {
            f.plan.act = (best.dmg > 55 && rng.next() < 0.45) ? 'heavy' : 'att';
          } else if (f.def.special && f.cd.spec <= 0 && rng.next() < iq.aggro * 0.7) {
            var sr = f.def.special.range || 90;
            if ((f.def.special.ranged && adx > 80 && adx < sr && ady < 70) || (!f.def.special.ranged && adx < sr && ady < 60)) f.plan.act = 'spec';
          }
          // defensive read: someone swinging near me
          for (var j = 0; j < world.fighters.length; j++) {
            var aj = world.fighters[j];
            if (aj === f || !aj.alive || !aj.atk) continue;
            if (Math.abs(aj.s.x - s.x) < 95 && Math.abs(aj.s.y - s.y) < 60 && rng.next() < iq.caution) { f.plan.act = 'shield'; break; }
          }
        }
      }
      var plan = f.plan || {};
      if (plan.flee && (!plan.flee.alive || plan.flee.buffs.power <= 0)) plan.flee = null;
      var goal = plan.wantItem ? { x: plan.wantItem.x, y: plan.wantItem.y } : (plan.target ? { x: plan.target.s.x, y: plan.target.s.y } : null);
      if (plan.flee) {
        goal = { x: s.x + (s.x >= plan.flee.s.x ? 220 : -220), y: s.y };
        if (plan.act && plan.act !== 'shield') plan.act = null;
      }
      // edge caution at high damage: drift the engagement toward safer ground
      if (goal && iq.center && f.dmg > 70) {
        var ns = world.stages[0], nd = 1e9;
        for (var gc = 0; gc < world.stages.length; gc++) {
          var cc = (world.stages[gc].x0 + world.stages[gc].x1) / 2;
          if (Math.abs(cc - s.x) < nd) { nd = Math.abs(cc - s.x); ns = world.stages[gc]; }
        }
        goal = { x: goal.x * (1 - iq.center) + ((ns.x0 + ns.x1) / 2) * iq.center, y: goal.y };
      }
      if (goal) {
        var gdx = goal.x - s.x, gadx = Math.abs(gdx);
        var keep = plan.wantItem ? 6 : f.spacing;
        if (gadx > keep) { if (gdx > 0) inp.right = true; else inp.left = true; }
        else if (!plan.wantItem && !f._lone && gadx < keep - 22 && rng.next() < 0.5) { if (gdx > 0) inp.left = true; else inp.right = true; }
        if (goal.y < s.y - 64 && (s.body.blocked.down || s.body.touching.down) && rng.next() < iq.jumpy) inp.jump = (world.frame % 8) < 4;
        if (goal.y > s.y + 80 && rng.next() < 0.3) inp.down = true;
      }
      // never stroll off a stage edge while grounded (launches are the only exit)
      if (s.body.blocked.down || s.body.touching.down) {
        for (var ge = 0; ge < world.stages.length; ge++) {
          var g2 = world.stages[ge];
          if (s.x >= g2.x0 - 6 && s.x <= g2.x1 + 6) {
            if (inp.left && s.x < g2.x0 + 22) inp.left = false;
            if (inp.right && s.x > g2.x1 - 22) inp.right = false;
            break;
          }
        }
      }
      if (plan.act === 'att') { inp.att = true; plan.act = null; }
      else if (plan.act === 'heavy') { inp.heavy = true; plan.act = null; }
      else if (plan.act === 'spec') { inp.spec = true; plan.act = null; }
      else if (plan.act === 'shield') { inp.shield = true; if (world.frame >= f.thinkAt - 2) plan.act = null; }
      return inp;
    },
    IQ: {
      scrapper: { aggro: 0.34, caution: 0.22, itemLove: 0.3, jumpy: 0.35, center: 0 },
      bruiser: { aggro: 0.45, caution: 0.3, itemLove: 0.4, jumpy: 0.45, center: 0 },
      champion: { aggro: 0.62, caution: 0.75, itemLove: 0.7, jumpy: 0.6, center: 0.45 }
    },
    // ---- the Brawl felt-fun model. A match is FUN when the action never goes
    // quiet (flow), the climax lands late (arc), the win is earned not swept
    // (closeness + comeback), and the systems all showed up (variety). Pure
    // function of the deterministic event log → the score replays too.
    //   events: [{t:'hit',f,a,v,dmg,kb} | {t:'ko',f,who,by,stocks} |
    //            {t:'item',f,who,type} | {t:'special',f,who} | {t:'sudden',f}]
    //   ctx: { playerKey, frame, falls, stocks, won, fightStart }
    fun: function (events, ctx) {
      var start = ctx.fightStart != null ? ctx.fightStart : 180;
      var durF = Math.max(1, ctx.frame - start), dur = durF / 60;
      var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
      var hits = events.filter(function (e) { return e.t === 'hit'; });
      var kos = events.filter(function (e) { return e.t === 'ko'; });
      // ACTION — hits per second of fight time (saturates at ~0.8/s)
      var action = clamp((hits.length / dur) / 0.8);
      // FLOW — no dead air between beats (KOs + heavy launches)
      var beats = events.filter(function (e) { return e.t === 'ko' || (e.t === 'hit' && e.kb > 480); })
        .map(function (e) { return e.f; }).sort(function (a, b) { return a - b; });
      var maxGap = 0, prev = start;
      beats.concat([ctx.frame]).forEach(function (f) { maxGap = Math.max(maxGap, f - prev); prev = f; });
      var flow = clamp(1 - ((maxGap / 60) - 8) / 20);
      // ARC — the last KO should land late (the climax)
      var lastKo = kos.length ? kos[kos.length - 1].f : start;
      var arc = clamp((((lastKo - start) / durF) - 0.5) / 0.35);
      // CLOSENESS — an earned win beats a sweep; comebacks count extra
      var left = ctx.stocks - ctx.falls;
      var closeness = ctx.won ? (left <= 1 ? 1 : left === 2 ? 0.85 : 0.55) : 0.3;
      var peak = 0;
      hits.forEach(function (e) { if (e.v === ctx.playerKey && e.dmg > peak) peak = e.dmg; });
      if (peak >= 90) closeness = clamp(closeness + 0.15);
      // VARIETY — specials flew, items mattered, KOs were shared around
      var specials = events.filter(function (e) { return e.t === 'special'; }).length;
      var items = events.filter(function (e) { return e.t === 'item'; }).length;
      var scorers = {};
      kos.forEach(function (e) { if (e.by) scorers[e.by] = 1; });
      var variety = (clamp(specials / 5) + clamp(items / 3) + clamp(Object.keys(scorers).length / 3)) / 3;
      var fun = 100 * (0.24 * action + 0.22 * flow + 0.18 * arc + 0.2 * closeness + 0.16 * variety);
      if (events.some(function (e) { return e.t === 'sudden'; })) fun *= 0.85; // needed the anti-stall = wasn't flowing
      return {
        fun: Math.round(fun * 10) / 10,
        parts: { action: +action.toFixed(2), flow: +flow.toFixed(2), arc: +arc.toFixed(2), closeness: +closeness.toFixed(2), variety: +variety.toFixed(2) },
        hits: hits.length, kos: kos.length, durS: Math.round(dur), peakDmg: peak
      };
    }
  };

  // -------------------------------------------------------------------- Mirth
  // A "funny" felt-comedy model — a NEW gate alongside fun. Where fun asks "is the run
  // engaging?", MIRTH asks "is it FUNNY?". Comedy = EXAGGERATION (slapstick physics) +
  // TIMING (a varied comic rhythm) + VARIETY (incongruous gag kinds) + SURPRISE at the
  // right DENSITY. Score a run's comedic events 0..100; the funny gate passes on >= ~65.
  // Mirror of tools/lib/mirth.mjs (the tested node scorer) — keep the algorithms identical.
  // events: [{ t, f, mag? }], t = 'bounce'|'pratfall'|'smooch'|'reaction'|'surprise'|'combo'.
  Studio.Mirth = {
    GATE: 65,
    score: function (events, ctx) {
      ctx = ctx || {};
      var evs = (events || []).slice().sort(function (a, b) { return a.f - b.f; });
      var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
      var bell = function (x, mid, w) { return clamp(1 - Math.abs(x - mid) / w); };
      var lastF = evs.length ? evs[evs.length - 1].f : 1;
      var durF = Math.max(1, (ctx.frame != null ? ctx.frame : lastF) - (ctx.start || 0));
      var dur = durF / 60;
      var slap = evs.filter(function (e) { return e.t === 'bounce' || e.t === 'pratfall'; });
      var exaggeration = slap.length ? clamp(slap.reduce(function (s, e) { return s + (e.mag || 1); }, 0) / slap.length / 2) : 0.2;
      var density = bell(evs.length / Math.max(1, dur), 2.0, 2.6);   // ~2 gags/s = steady slapstick
      var kinds = {}; evs.forEach(function (e) { kinds[e.t] = 1; });
      var variety = clamp(Object.keys(kinds).length / 6);
      var gaps = []; for (var i = 1; i < evs.length; i++) gaps.push(evs[i].f - evs[i - 1].f);
      var mean = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : 0;
      var sd = gaps.length ? Math.sqrt(gaps.reduce(function (a, g) { return a + (g - mean) * (g - mean); }, 0) / gaps.length) : 0;
      var cv = mean ? sd / mean : 0;
      var timing = gaps.length ? bell(cv, 0.85, 0.95) : 0.3;
      var surprise = clamp(evs.filter(function (e) { return e.t === 'surprise' || e.t === 'combo'; }).length / 5);
      var mirth = 100 * (0.26 * exaggeration + 0.20 * density + 0.18 * variety + 0.16 * timing + 0.20 * surprise);
      return {
        mirth: Math.round(mirth * 10) / 10,
        parts: { exaggeration: +exaggeration.toFixed(2), density: +density.toFixed(2), variety: +variety.toFixed(2), timing: +timing.toFixed(2), surprise: +surprise.toFixed(2) },
        beats: evs.length, durS: Math.round(dur)
      };
    }
  };

  // -------------------------------------------------------------------- Juice
  // The "feel" surface. GPU filters are WebGL-only -> every call is guarded.
  Studio.Juice = {
    shake: function (scene, dur, amt) { try { scene.cameras.main.shake(dur || 120, amt || 0.008); } catch (e) {} },
    flash: function (scene, dur, r, g, b) { try { scene.cameras.main.flash(dur || 120, r || 255, g || 255, b || 255); } catch (e) {} },
    hitStop: function (scene, ms) { try { var t = scene.time; scene.physics.world.pause(); t.delayedCall(ms || 60, function () { scene.physics.world.resume(); }); } catch (e) {} },
    squash: function (scene, obj, sx, sy, dur) {
      try { scene.tweens.add({ targets: obj, scaleX: sx || 1.25, scaleY: sy || 0.8, yoyo: true, duration: dur || 90, ease: 'Quad.out' }); } catch (e) {}
    },
    burst: function (scene, x, y, opt) {
      opt = opt || {};
      try {
        var em = scene.add.particles(x, y, opt.texture || 'dot', {
          speed: { min: opt.spMin || 60, max: opt.spMax || 180 }, angle: { min: 0, max: 360 },
          lifespan: opt.life || 500, scale: { start: opt.scale || 0.9, end: 0 }, quantity: opt.n || 12,
          blendMode: 'ADD', emitting: false, tint: opt.tint
        });
        em.explode(opt.n || 12); scene.time.delayedCall(opt.life || 500, function () { em.destroy(); });
        return em;
      } catch (e) {}
    },
    ambient: function (scene, w, opt) {
      opt = opt || {};
      try {
        return scene.add.particles(0, opt.y != null ? opt.y : -8, opt.texture || 'dot', {
          x: { min: 0, max: w }, lifespan: 5000, speedY: { min: 16, max: 50 },
          scale: { start: opt.scale || 0.7, end: 0 }, alpha: { start: 0.4, end: 0 }, quantity: 1, frequency: 120, blendMode: 'ADD'
        });
      } catch (e) {}
    },
    // ---- brawl-era surfaces (funded by Biome Bash) ----
    // expanding shockwave ring — reads as "impact" in a single frame
    ring: function (scene, x, y, opt) {
      opt = opt || {};
      try {
        var im = scene.add.image(x, y, 'ring').setDepth(opt.depth != null ? opt.depth : 40);
        if (opt.tint != null) im.setTint(opt.tint);
        im.setScale((opt.r0 || 8) / 28);
        scene.tweens.add({ targets: im, scale: (opt.r1 || 70) / 28, alpha: 0, duration: opt.dur || 320, ease: 'Cubic.out', onComplete: function () { im.destroy(); } });
        return im;
      } catch (e) {}
    },
    // directional impact spark (cone burst along an angle, degrees)
    spark: function (scene, x, y, deg, opt) {
      opt = opt || {};
      try {
        var em = scene.add.particles(x, y, opt.texture || 'shard', {
          speed: { min: opt.spMin || 180, max: opt.spMax || 420 },
          angle: { min: deg - (opt.spread || 28), max: deg + (opt.spread || 28) },
          lifespan: opt.life || 300, scale: { start: opt.scale || 1, end: 0 }, quantity: opt.n || 8,
          rotate: { min: 0, max: 360 }, blendMode: 'ADD', emitting: false, tint: opt.tint
        });
        em.setDepth(41); em.explode(opt.n || 8);
        scene.time.delayedCall(opt.life || 300, function () { em.destroy(); });
      } catch (e) {}
    },
    // floating combat text (damage numbers, "KO!", item names)
    pop: function (scene, x, y, str, opt) {
      opt = opt || {};
      try {
        var tx = scene.add.text(x, y, str, {
          fontFamily: opt.font || 'Arial Black, Arial', fontSize: (opt.size || 18) + 'px', fontStyle: 'bold',
          color: opt.color || '#ffffff', stroke: '#16161e', strokeThickness: opt.strokeW != null ? opt.strokeW : 5
        }).setOrigin(0.5).setDepth(60);
        if (opt.scroll === 0) tx.setScrollFactor(0);
        scene.tweens.add({ targets: tx, y: y - (opt.rise || 34), alpha: 0, scale: opt.grow || 1.15, duration: opt.dur || 650, ease: 'Cubic.out', onComplete: function () { tx.destroy(); } });
        return tx;
      } catch (e) {}
    },
    // celebration confetti (multicolor, gravity)
    confetti: function (scene, x, y, opt) {
      opt = opt || {};
      try {
        var em = scene.add.particles(x, y, opt.texture || 'shard', {
          speed: { min: 160, max: 420 }, angle: { min: 230, max: 310 },
          gravityY: 700, lifespan: opt.life || 1400, quantity: opt.n || 26,
          scale: { start: 0.9, end: 0.3 }, rotate: { min: 0, max: 360 },
          tint: opt.tints || [0xff5d8f, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb388eb], emitting: false
        });
        em.setDepth(55); em.explode(opt.n || 26);
        scene.time.delayedCall(opt.life || 1400, function () { em.destroy(); });
      } catch (e) {}
    },
    // afterimage/speed trail attached to a target; returns emitter (destroy to stop)
    trail: function (scene, target, opt) {
      opt = opt || {};
      try {
        var em = scene.add.particles(0, 0, opt.texture || 'dot', {
          lifespan: opt.life || 260, speed: 8, scale: { start: opt.scale || 0.9, end: 0 },
          alpha: { start: 0.55, end: 0 }, quantity: 1, frequency: opt.every || 28, blendMode: 'ADD', tint: opt.tint
        });
        em.setDepth(18); em.startFollow(target, 0, opt.dy || 8);
        return em;
      } catch (e) {}
    },
    // GPU filters (WebGL only) — no-op on canvas
    glow: function (obj, color, outer) { try { if (!obj.enableFilters) return; obj.enableFilters(); obj.filters.internal.addGlow(color != null ? color : 0xffffff, outer || 4); } catch (e) {} },
    vignette: function (scene, strength) { try { var c = scene.cameras.main; if (!c.enableFilters) return; c.enableFilters(); c.filters.internal.addVignette(0.5, 0.5, 0.6, strength || 0.5); } catch (e) {} },
    grade: function (scene, fn) { try { var c = scene.cameras.main; if (!c.enableFilters) return; c.enableFilters(); var cm = c.filters.internal.addColorMatrix(); if (fn) fn(cm); return cm; } catch (e) {} }
  };

  // -------------------------------------------------------------------- Audio
  Studio.Audio = (function () {
    var ctx = null;
    function ac() { if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) {} } return ctx; }
    function tone(freq, dur, type, vol) {
      var a = ac(); if (!a) return;
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.value = freq; g.gain.value = vol || 0.08;
      o.connect(g); g.connect(a.destination);
      var t = a.currentTime; o.start(t); g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12)); o.stop(t + (dur || 0.12));
    }
    var SFX = {
      jump: function () { tone(420, 0.12, 'square'); }, coin: function () { tone(880, 0.08, 'triangle'); tone(1320, 0.08, 'triangle'); },
      stomp: function () { tone(160, 0.12, 'sawtooth'); }, hurt: function () { tone(120, 0.25, 'sawtooth', 0.12); },
      win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.16, 'triangle'); }, i * 110); }); },
      // brawl set
      hit: function () { tone(200, 0.07, 'square', 0.1); tone(95, 0.09, 'sawtooth', 0.07); },
      heavy: function () { tone(90, 0.18, 'sawtooth', 0.14); tone(55, 0.22, 'square', 0.1); },
      whoosh: function () { tone(640, 0.08, 'sine', 0.05); tone(320, 0.1, 'sine', 0.04); },
      ko: function () { [620, 430, 260, 120].forEach(function (f, i) { setTimeout(function () { tone(f, 0.12, 'sawtooth', 0.12); }, i * 70); }); },
      item: function () { [660, 880, 1175].forEach(function (f, i) { setTimeout(function () { tone(f, 0.07, 'triangle', 0.09); }, i * 55); }); },
      shield: function () { tone(520, 0.1, 'sine', 0.09); tone(780, 0.08, 'sine', 0.06); },
      freeze: function () { [1567, 1244, 988].forEach(function (f, i) { setTimeout(function () { tone(f, 0.09, 'triangle', 0.08); }, i * 60); }); },
      boom: function () { tone(60, 0.3, 'sawtooth', 0.16); tone(110, 0.2, 'square', 0.1); },
      count: function () { tone(440, 0.1, 'square', 0.09); }, go: function () { tone(880, 0.22, 'square', 0.11); }
    };
    return { sfx: function (n) { try { (SFX[n] || function () {})(); } catch (e) {} }, music: function (url, vol) { try { var au = new Audio(url); au.loop = true; au.volume = vol || 0.4; au.play(); return au; } catch (e) {} } };
  })();

  // ---------------------------------------------------------------------- Cam
  Studio.Cam = {
    follow: function (scene, target, opt) {
      opt = opt || {}; var c = scene.cameras.main;
      if (opt.bounds) c.setBounds(opt.bounds[0], opt.bounds[1], opt.bounds[2], opt.bounds[3]);
      c.startFollow(target, true, opt.lerp || 0.12, opt.lerp || 0.12);
      if (opt.deadzone) c.setDeadzone(opt.deadzone[0], opt.deadzone[1]);
      return c;
    }
  };

  // ------------------------------------------------------------------ harness
  // Wires window.__rec (deterministic stepper) + window.__game (observability)
  // + window.__run / window.__gate, given game + hooks. This is the eval contract.
  Studio.harness = {
    install: function (game, hooks) {
      // Headless (sim-only) has no renderer, but game.step() calls
      // renderer.preRender/postRender — stub them to no-ops so the update loop
      // (physics + game logic + the event log) runs without pixels. The sim is
      // byte-identical to a rendered run, just ~20x faster (scan/gate).
      if (Studio._headless && !game.renderer) {
        game.renderer = {
          preRender: function () {}, postRender: function () {}, render: function () {},
          resize: function () {}, resetTextures: function () {}, gl: null, type: 0, width: game.scale.width, height: game.scale.height
        };
      }
      root.__rec = {
        on: false, t: 0, dt: 1000 / 60,
        begin: function () { if (this.on) return; game.loop.sleep(); this.on = true; this.t = 1000; },
        step: function (n) { n = n || 1; for (var i = 0; i < n; i++) { this.t += this.dt; game.step(this.t, this.dt); } },
        end: function () { if (!this.on) return; this.on = false; game.loop.wake(); }
      };
      root.__game = {
        ready: function () { return !!root.__ready; },
        snapshot: hooks.snapshot,
        setInput: hooks.setInput || function () {},
        autopilot: hooks.autopilot || function () {},
        reset: hooks.reset || function () {}
      };
      root.__run = function (n) { root.__game.reset(); root.__game.autopilot(true); root.__rec.begin(); root.__rec.step(n); return root.__game.snapshot(); };
      root.__gate = function (maxF) {
        root.__game.reset(); root.__game.autopilot(true); root.__rec.begin();
        var s = root.__game.snapshot();
        while (!s.won && !s.dead && s.frame < maxF) { root.__rec.step(1); s = root.__game.snapshot(); }
        return s;
      };
      root.__ready = true;
      return root.__game;
    }
  };

  root.Studio = Studio;
  if (typeof module !== 'undefined' && module.exports) module.exports = Studio;
})(typeof window !== 'undefined' ? window : globalThis);

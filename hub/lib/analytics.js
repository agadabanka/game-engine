// ── ANALYTICS ────────────────────────────────────────────────────────────────
// Per-game build analytics for the hub's "Analytics" modal. For every registered
// game we pull its repo's git tree (ONE recursive GitHub API call per repo →
// every committed file path, byte size, and blob SHA) and roll it up into three
// views the dashboard renders:
//
//   1. CODE   — how much code each game has + the split within it (by language).
//   2. ASSETS — how many assets each game ships + the split (art vs music vs …).
//   3. COST   — an estimate of spend as a function of tokens × which API made it:
//                 • code  → Claude tokens   (the owner wrote the code with Claude)
//                 • art   → Nano Banana      (Gemini image model)
//                 • music → Lyria            (Google's music model)
//
// Accuracy comes from two repo-level signals (no per-file downloads needed — the
// git tree already carries size + sha for every blob):
//
//   • CROSS-FLEET DEDUP. Every game is a clone of the base engine, so each game's
//     tree re-contains the shared engine + inherited art. We attribute each unique
//     blob (by SHA) to the FIRST game that introduced it (registry order, base
//     first). "Authored" code and "generated" assets count only blobs a game owns
//     — so the engine + base art are billed once, not 16×.
//   • GENERATION CACHES. Where a repo commits its content-addressed generation
//     cache (.cache/<kind>, .artcache/<kind>), each file is exactly one BILLED
//     API call — .cache/lyria → a Lyria clip, the image kinds → a Nano Banana
//     image. We use those exact counts when present, falling back to unique-asset
//     SHAs otherwise.
//
// The cost view is an ESTIMATE; the price + token assumptions are fully env-
// overridable (see PRICING / ESTIMATE) and returned in the payload so the UI
// shows its work.

const TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 8000);

// ── pricing + estimation assumptions (all env-overridable) ──
const num = (v, d) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : d);
export const PRICING = {
  claude: {
    model: process.env.ANALYTICS_CLAUDE_MODEL || 'Claude Opus 4.8',
    inputPerM: num(process.env.ANALYTICS_CLAUDE_INPUT_PER_M, 5),
    outputPerM: num(process.env.ANALYTICS_CLAUDE_OUTPUT_PER_M, 25),
  },
  art: {
    model: process.env.ANALYTICS_ART_MODEL || 'Nano Banana (Gemini 3 Pro Image)',
    perImage: num(process.env.ANALYTICS_ART_PER_IMAGE, 0.13),
  },
  music: {
    model: process.env.ANALYTICS_MUSIC_MODEL || 'Lyria',
    perTrack: num(process.env.ANALYTICS_MUSIC_PER_TRACK, 0.06),
  },
};
export const ESTIMATE = {
  bytesPerToken: num(process.env.ANALYTICS_BYTES_PER_TOKEN, 3.5),   // code is dense
  outputChurn: num(process.env.ANALYTICS_OUTPUT_CHURN, 3),          // code rewritten ~Nx across iterations
  inputRatio: num(process.env.ANALYTICS_INPUT_RATIO, 12),           // context tokens read per output token
  bytesPerLine: num(process.env.ANALYTICS_BYTES_PER_LINE, 38),      // for the estimated-lines readout
};

// ── file classification ──
const LANGS = [
  ['JavaScript', ['js', 'mjs', 'cjs']],
  ['TypeScript', ['ts', 'tsx']],
  ['HTML', ['html', 'htm']],
  ['CSS', ['css']],
  ['JSON / data', ['json']],
  ['Markdown / docs', ['md', 'mdx']],
  ['Shell', ['sh', 'bash']],
  ['Python', ['py']],
];
const EXT_LANG = {};
for (const [label, exts] of LANGS) for (const e of exts) EXT_LANG[e] = label;

const ASSET_KIND = {
  png: 'art', jpg: 'art', jpeg: 'art', webp: 'art', gif: 'art', svg: 'art', avif: 'art',
  mp3: 'music', wav: 'music', ogg: 'music', m4a: 'music', flac: 'music', aac: 'music',
  mp4: 'video', webm: 'video', mov: 'video',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
};
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif']);

const extOf = (p) => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; };
// Caches and VCS internals — excluded from the "shipped" file scan (their
// contents are counted separately, as billed generations).
const IS_CACHE = (p) => /(^|\/)\.(cache|artcache)\//.test(p);
const IGNORED = (p) => /(^|\/)(node_modules|\.git|dist|build)\//.test(p) || /(^|\/)package-lock\.json$/.test(p) || IS_CACHE(p);
// Vendored libraries (Phaser, the studio runtime, minified) — shipped but not authored.
const IS_VENDOR = (p) => /(^|\/)vendor\//.test(p) || /\.min\.(js|css)$/i.test(p);

async function fetchJSON(url, token) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'game-engine-hub', ...(token ? { Authorization: `token ${token}` } : {}) },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}
async function repoTree(repo, token) {
  for (const branch of ['main', 'master']) {
    const j = await fetchJSON(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, token);
    if (j && Array.isArray(j.tree)) return { tree: j.tree, branch, truncated: !!j.truncated };
  }
  return null;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Count BILLED generations from a repo's committed generation caches.
// .cache/lyria/* → Lyria clips; image files under .cache|.artcache → Nano Banana.
function cacheGenerations(tree) {
  let art = 0, music = 0, hasArt = false, hasMusic = false;
  for (const e of tree) {
    if (e.type !== 'blob') continue;
    const m = /(^|\/)\.(?:cache|artcache)\/([^/]+)\//.exec(e.path);
    if (!m) continue;
    if (m[2] === 'lyria') { music++; hasMusic = true; }
    else if (IMG_EXT.has(extOf(e.path))) { art++; hasArt = true; }
  }
  return { art, music, hasArt, hasMusic };
}

// Build the per-game code & asset cost, given its tree and the SHA→owner maps.
function analyzeTree(tree, gameId, codeOwner, assetOwner) {
  const code = { byLang: {}, bytes: 0, files: 0, lines: 0, vendorBytes: 0, authoredBytes: 0, authoredFiles: 0 };
  const assets = { byKind: {}, count: 0, bytes: 0 };
  let uniqArt = 0, uniqMusic = 0;
  for (const e of tree) {
    if (e.type !== 'blob') continue;
    const p = e.path, size = e.size || 0;
    if (IGNORED(p)) continue;
    const ext = extOf(p);
    const kind = ASSET_KIND[ext];
    if (kind) {
      const k = (assets.byKind[kind] = assets.byKind[kind] || { count: 0, bytes: 0 });
      k.count++; k.bytes += size; assets.count++; assets.bytes += size;
      if (assetOwner[e.sha] === gameId) { if (kind === 'art') uniqArt++; else if (kind === 'music') uniqMusic++; }
      continue;
    }
    const lang = EXT_LANG[ext];
    if (!lang) continue;
    if (IS_VENDOR(p)) { code.vendorBytes += size; continue; }
    const l = (code.byLang[lang] = code.byLang[lang] || { bytes: 0, files: 0 });
    l.bytes += size; l.files++;
    code.bytes += size; code.files++; code.lines += Math.round(size / ESTIMATE.bytesPerLine);
    if (codeOwner[e.sha] === gameId) { code.authoredBytes += size; code.authoredFiles++; }
  }
  code.authoredLines = Math.round(code.authoredBytes / ESTIMATE.bytesPerLine);

  // ── generations: exact billed counts from caches, else unique (first-introduced) assets ──
  const cg = cacheGenerations(tree);
  const artGen = cg.hasArt ? cg.art : uniqArt;
  const musicGen = cg.hasMusic ? cg.music : uniqMusic;
  assets.generations = {
    art: artGen, music: musicGen,
    artSource: cg.hasArt ? 'cache' : 'unique', musicSource: cg.hasMusic ? 'cache' : 'unique',
  };

  // ── cost estimate, as a function of tokens × API ──
  // Code billed on AUTHORED bytes only (engine attributed once, to the base).
  const codeTokens = code.authoredBytes / ESTIMATE.bytesPerToken;
  const outputTokens = Math.round(codeTokens * ESTIMATE.outputChurn);
  const inputTokens = Math.round(outputTokens * ESTIMATE.inputRatio);
  const codeUsd = round2((inputTokens * PRICING.claude.inputPerM + outputTokens * PRICING.claude.outputPerM) / 1e6);
  const artUsd = round2(artGen * PRICING.art.perImage);
  const musicUsd = round2(musicGen * PRICING.music.perTrack);
  const cost = {
    code: { api: PRICING.claude.model, tokens: inputTokens + outputTokens, inputTokens, outputTokens, usd: codeUsd },
    art: { api: PRICING.art.model, images: artGen, usd: artUsd },
    music: { api: PRICING.music.model, tracks: musicGen, usd: musicUsd },
    total: round2(codeUsd + artUsd + musicUsd),
  };
  return { code, assets, cost };
}

// Snapshot every game. Two passes: (1) pull all trees + attribute each unique
// blob to the first game that introduced it; (2) compute per-game stats + totals.
export async function analyzeAll(games, opts = {}) {
  const list = Array.isArray(games) ? games : [];
  // pass 1 — pull trees in parallel
  const trees = await Promise.all(list.map(async (g) => (g.repo ? { g, ...(await repoTree(g.repo, opts.ghToken)) } : { g, tree: null })));

  // ownership: first game (registry order — base first) to contain a blob owns it
  const codeOwner = {}, assetOwner = {};
  for (const { g, tree } of trees) {
    if (!tree) continue;
    for (const e of tree) {
      if (e.type !== 'blob' || IGNORED(e.path)) continue;
      const ext = extOf(e.path);
      if (ASSET_KIND[ext]) { if (!(e.sha in assetOwner)) assetOwner[e.sha] = g.id; }
      else if (EXT_LANG[ext] && !IS_VENDOR(e.path)) { if (!(e.sha in codeOwner)) codeOwner[e.sha] = g.id; }
    }
  }

  // pass 2 — per-game stats
  const snaps = trees.map(({ g, tree, branch, truncated }) => {
    const base = { id: g.id, name: g.name, repo: g.repo || null };
    if (!g.repo) return { ...base, ok: false, error: 'no repo registered' };
    if (!tree) return { ...base, ok: false, error: 'repo tree unavailable' };
    return { ...base, ok: true, branch, truncated: !!truncated, ...analyzeTree(tree, g.id, codeOwner, assetOwner) };
  });

  // roll-up totals
  const totals = {
    games: snaps.length,
    analyzed: snaps.filter((s) => s.ok).length,
    code: { bytes: 0, authoredBytes: 0, files: 0, lines: 0, authoredLines: 0, byLang: {} },
    assets: { count: 0, bytes: 0, byKind: {} },
    cost: { code: 0, art: 0, music: 0, total: 0, images: 0, tracks: 0, codeTokens: 0 },
  };
  for (const s of snaps) {
    if (!s.ok) continue;
    totals.code.bytes += s.code.bytes; totals.code.authoredBytes += s.code.authoredBytes;
    totals.code.files += s.code.files; totals.code.lines += s.code.lines; totals.code.authoredLines += s.code.authoredLines;
    for (const [lang, v] of Object.entries(s.code.byLang)) {
      const t = (totals.code.byLang[lang] = totals.code.byLang[lang] || { bytes: 0, files: 0 });
      t.bytes += v.bytes; t.files += v.files;
    }
    totals.assets.count += s.assets.count; totals.assets.bytes += s.assets.bytes;
    for (const [kind, v] of Object.entries(s.assets.byKind)) {
      const t = (totals.assets.byKind[kind] = totals.assets.byKind[kind] || { count: 0, bytes: 0 });
      t.count += v.count; t.bytes += v.bytes;
    }
    totals.cost.code += s.cost.code.usd; totals.cost.art += s.cost.art.usd; totals.cost.music += s.cost.music.usd;
    totals.cost.total += s.cost.total; totals.cost.images += s.cost.art.images; totals.cost.tracks += s.cost.music.tracks;
    totals.cost.codeTokens += s.cost.code.tokens;
  }
  for (const k of ['code', 'art', 'music', 'total']) totals.cost[k] = round2(totals.cost[k]);

  snaps.sort((a, b) => (b.cost?.total || 0) - (a.cost?.total || 0));   // biggest spend first
  return { generated: new Date().toISOString(), pricing: PRICING, estimate: ESTIMATE, totals, games: snaps };
}

// Single-game snapshot (no cross-fleet dedup — authored == total). Kept for ad-hoc use.
export async function analyzeGame(game, opts = {}) {
  const out = (await analyzeAll([game], opts)).games[0];
  return out || { id: game.id, name: game.name, ok: false, error: 'unavailable' };
}

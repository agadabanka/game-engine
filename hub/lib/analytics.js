// ── ANALYTICS ────────────────────────────────────────────────────────────────
// Per-game build analytics for the hub's "Analytics" modal. For every registered
// game we pull its repo's git tree (ONE recursive GitHub API call per repo →
// every committed file path + byte size) and roll it up into three views the
// dashboard renders:
//
//   1. CODE   — how much code each game has + the split within it (by language).
//   2. ASSETS — how many assets each game ships + the split (art vs music vs …).
//   3. COST   — an estimate of spend as a function of tokens × which API made it:
//                 • code  → Claude tokens   (the owner wrote the code with Claude)
//                 • art   → Nano Banana      (Gemini image model)
//                 • music → Lyria            (Google's music model)
//
// The cost view is an ESTIMATE built from measurable artifacts (code bytes →
// tokens, shipped image/audio counts → generations) and a transparent, fully
// overridable set of price + token assumptions (see PRICING / ESTIMATE below).
// Every assumption is returned in the payload so the UI can show its work.

const TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 8000);

// ── pricing + estimation assumptions (all env-overridable) ──
// Prices are per the providers' published rates; the token model is a heuristic
// for agentic coding (the final code is a fraction of the tokens actually spent
// reading context and iterating). Tune these to match your own usage.
const num = (v, d) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : d);
export const PRICING = {
  // Claude (code) — Opus 4.8 list price, $/million tokens.
  claude: {
    model: process.env.ANALYTICS_CLAUDE_MODEL || 'Claude Opus 4.8',
    inputPerM: num(process.env.ANALYTICS_CLAUDE_INPUT_PER_M, 5),
    outputPerM: num(process.env.ANALYTICS_CLAUDE_OUTPUT_PER_M, 25),
  },
  // Nano Banana (art) — Gemini image model, $/generated image.
  art: {
    model: process.env.ANALYTICS_ART_MODEL || 'Nano Banana (Gemini 3 Pro Image)',
    perImage: num(process.env.ANALYTICS_ART_PER_IMAGE, 0.13),
  },
  // Lyria (music) — Google's music model, $/generated clip.
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
// Languages we surface in the "split within the code". The key is the bucket
// label; matched by file extension.
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

// Asset families. Art = images (Nano Banana), Music = audio (Lyria).
const ASSET_KIND = {
  png: 'art', jpg: 'art', jpeg: 'art', webp: 'art', gif: 'art', svg: 'art', avif: 'art',
  mp3: 'music', wav: 'music', ogg: 'music', m4a: 'music', flac: 'music', aac: 'music',
  mp4: 'video', webm: 'video', mov: 'video',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
};

const extOf = (p) => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; };
// Caches and VCS internals — never authored, never shipped. Excluded everywhere.
const IGNORED = (p) => /(^|\/)(node_modules|\.git|\.cache|\.artcache|dist|build)\//.test(p) || /(^|\/)package-lock\.json$/.test(p);
// Vendored libraries (Phaser, the studio runtime, anything minified) — shipped
// but not authored, so kept out of the "code written" + cost numbers.
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

// Pull a repo's full file list (recursive tree) trying main then master.
async function repoTree(repo, token) {
  for (const branch of ['main', 'master']) {
    const j = await fetchJSON(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, token);
    if (j && Array.isArray(j.tree)) return { tree: j.tree, branch, truncated: !!j.truncated };
  }
  return null;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Roll one game's tree into code + asset + cost views.
function analyzeTree(tree) {
  const code = { byLang: {}, bytes: 0, files: 0, lines: 0, vendorBytes: 0 };
  const assets = { byKind: {}, count: 0, bytes: 0 };
  for (const e of tree) {
    if (e.type !== 'blob') continue;
    const p = e.path, size = e.size || 0;
    if (IGNORED(p)) continue;
    const ext = extOf(p);
    const kind = ASSET_KIND[ext];
    if (kind) {
      const k = (assets.byKind[kind] = assets.byKind[kind] || { count: 0, bytes: 0 });
      k.count++; k.bytes += size; assets.count++; assets.bytes += size;
      continue;
    }
    const lang = EXT_LANG[ext];
    if (!lang) continue;
    if (IS_VENDOR(p)) { code.vendorBytes += size; continue; }   // shipped but not authored
    const l = (code.byLang[lang] = code.byLang[lang] || { bytes: 0, files: 0 });
    l.bytes += size; l.files++;
    code.bytes += size; code.files++;
    code.lines += Math.round(size / ESTIMATE.bytesPerLine);
  }

  // ── cost estimate, as a function of tokens × API ──
  const imgCount = assets.byKind.art?.count || 0;
  const trkCount = assets.byKind.music?.count || 0;
  // Claude: final authored code → tokens, scaled for iteration churn + context reads.
  const codeTokens = code.bytes / ESTIMATE.bytesPerToken;          // tokens in the final code
  const outputTokens = Math.round(codeTokens * ESTIMATE.outputChurn);
  const inputTokens = Math.round(outputTokens * ESTIMATE.inputRatio);
  const codeUsd = round2((inputTokens * PRICING.claude.inputPerM + outputTokens * PRICING.claude.outputPerM) / 1e6);
  const artUsd = round2(imgCount * PRICING.art.perImage);
  const musicUsd = round2(trkCount * PRICING.music.perTrack);
  const cost = {
    code: { api: PRICING.claude.model, tokens: inputTokens + outputTokens, inputTokens, outputTokens, usd: codeUsd },
    art: { api: PRICING.art.model, images: imgCount, usd: artUsd },
    music: { api: PRICING.music.model, tracks: trkCount, usd: musicUsd },
    total: round2(codeUsd + artUsd + musicUsd),
  };
  return { code, assets, cost };
}

// Snapshot one game's analytics (best-effort; never throws).
export async function analyzeGame(game, { ghToken } = {}) {
  const base = { id: game.id, name: game.name, repo: game.repo || null, ok: false, error: null };
  if (!game.repo) return { ...base, error: 'no repo registered' };
  const res = await repoTree(game.repo, ghToken);
  if (!res) return { ...base, error: 'repo tree unavailable' };
  return { ...base, ok: true, branch: res.branch, truncated: res.truncated, ...analyzeTree(res.tree) };
}

// Snapshot every game (in parallel) + roll up totals.
export async function analyzeAll(games, opts = {}) {
  const list = Array.isArray(games) ? games : [];
  const settled = await Promise.allSettled(list.map((g) => analyzeGame(g, opts)));
  const snaps = settled.map((r, i) => (r.status === 'fulfilled' ? r.value : { id: list[i]?.id, name: list[i]?.name, ok: false, error: String(r.reason) }));

  const totals = {
    games: snaps.length,
    analyzed: snaps.filter((s) => s.ok).length,
    code: { bytes: 0, files: 0, lines: 0, byLang: {} },
    assets: { count: 0, bytes: 0, byKind: {} },
    cost: { code: 0, art: 0, music: 0, total: 0, images: 0, tracks: 0, codeTokens: 0 },
  };
  for (const s of snaps) {
    if (!s.ok) continue;
    totals.code.bytes += s.code.bytes; totals.code.files += s.code.files; totals.code.lines += s.code.lines;
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

  // biggest spend first — the most useful default order in the modal
  snaps.sort((a, b) => (b.cost?.total || 0) - (a.cost?.total || 0));
  return { generated: new Date().toISOString(), pricing: PRICING, estimate: ESTIMATE, totals, games: snaps };
}

// tools/lib/interactions.mjs — the INTERACTION LOOP: discover → require → discover (the fractal of interactions).
//
// E mines a population for a recurring move-chain ("an interaction"). This closes the loop and makes it
// FRACTAL: promote the discovered chain to a named TOKEN, feed its constituents back as a generation
// TARGET (so the next population is rich in it), then RE-TOKENISE every solver path (replace the chain
// with its token) and mine AGAIN — now you discover higher-order interactions built OUT OF the last one
// (T2 = T1∘T1, T3 = T2∘…). Same shape (a recurring sub-sequence), one scale up, every round. The
// vocabulary grows itself: primitive ⊂ motif ⊂ motif-of-motifs, exactly as move ⊂ room ⊂ level.
//
//   discoverInteractions(spec, { seed, rec, rounds, pop }) → { vocabulary }

import { evolveRoom } from './roomgen.mjs';
import { solveRoom } from './solver.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// replace every non-overlapping occurrence of `pat` in `seq` with the single token `id`
function replaceSubseq(seq, pat, id) {
  const out = []; let i = 0;
  while (i < seq.length) {
    let m = i + pat.length <= seq.length;
    for (let j = 0; m && j < pat.length; j++) if (seq[i + j] !== pat[j]) m = false;
    if (m) { out.push(id); i += pat.length; } else { out.push(seq[i]); i++; }
  }
  return out;
}
const tokenize = (moves, promoted) => promoted.reduce((seq, T) => replaceSubseq(seq, T.gram, T.id), moves.slice());

// the top recurring 2-/3-gram across tokenised paths, by how many DISTINCT rooms use it
function topMotif(paths) {
  const g = new Map();
  paths.forEach((seq, ri) => { for (const n of [2, 3]) for (let j = 0; j + n <= seq.length; j++) { const k = seq.slice(j, j + n).join(' '); let e = g.get(k); if (!e) g.set(k, e = { gram: seq.slice(j, j + n), count: 0, rooms: new Set(), n }); e.count++; e.rooms.add(ri); } });
  return [...g.values()].filter((e) => e.rooms.size >= 2).sort((a, b) => b.rooms.size - a.rooms.size || b.count - a.count)[0] || null;
}
// a move token → the verbs/contraptions it demands (so we can REQUIRE the interaction's constituents)
function moveReqs(mv) { const r = []; if (mv.indexOf('dash') === 0 || mv.indexOf('spring-dash') === 0) r.push('dash'); if (mv.indexOf('spring') === 0) r.push('spring'); if (mv.indexOf('wj') === 0) r.push('walljump'); return r; }
const GLYPHS = ['◆', '◈', '✦', '✸', '❖', '⬢'];

export function discoverInteractions(spec, { seed = 1, rec = null, rounds = 3, pop = 9 } = {}) {
  const promoted = [];                          // the growing interaction vocabulary
  const tierOf = (t) => { const T = promoted.find((p) => p.id === t); return T ? T.tier : 0; };
  const expand = (gram) => gram.flatMap((t) => { const T = promoted.find((p) => p.id === t); return T ? expand(T.gram) : [t]; });
  let requireTarget = ['dash'];

  const snap = (round, roomsView, hist, justPromoted) => ({
    kind: 'interloop', round, require: requireTarget.slice(),
    vocabulary: promoted.map((T) => ({ id: T.id, glyph: T.glyph, gram: T.gram, primitives: T.primitives, tier: T.tier, rooms: T.rooms, of: T.of })),
    rooms: (roomsView || []).map((r) => ({ moves: r.moves, tokenized: tokenize(r.moves, promoted) })),
    histogram: hist || [], justPromoted: justPromoted || null,
  });

  rec && rec.log('seed', 'the interaction loop — discover → require → discover', { rounds, pop }, 'each round mines a recurring interaction, promotes it to a token, requires it, and mines motifs made OF it — a fractal of interactions', snap(0, [], []));

  for (let round = 0; round < rounds; round++) {
    rec && rec.log('cut', `round ${round + 1} — require [${requireTarget.join(', ')}]`, { round: round + 1, require: requireTarget }, `generate a population that REQUIRES the current vocabulary (${requireTarget.join('+')}), so last round's interaction is everywhere`, snap(round + 1, [], []));
    // 1) generate a population requiring the current target vocabulary (TALL rooms → long chains → higher-order motifs)
    const rooms = [];
    for (let i = 0; i < pop; i++) {
      const lo = 44 + (i % 4) * 7, target = { requires: requireTarget.slice(), difficulty: [lo, lo + 22], tightness: [40, 170] };
      const out = evolveRoom(spec, target, { seed: ((seed * 100 + round * 37 + i * 13 + 1) >>> 0), budget: 22 });
      const sol = solveRoom(out.room, spec);
      if (sol.solvable && sol.path && sol.path.length >= 2) rooms.push({ room: out.room, moves: sol.path.map((m) => m.move), requires: sol.requires || [] });
    }
    if (!rooms.length) break;
    // 2) tokenise every path with the vocabulary so far, then mine the top (possibly higher-order) motif
    const toks = rooms.map((r) => tokenize(r.moves, promoted));
    const motif = topMotif(toks);
    const hist = (() => { const g = new Map(); toks.forEach((seq, ri) => { for (const n of [2, 3]) for (let j = 0; j + n <= seq.length; j++) { const k = seq.slice(j, j + n).join(' '); let e = g.get(k); if (!e) g.set(k, e = { gram: seq.slice(j, j + n), rooms: new Set() }); e.rooms.add(ri); } }); return [...g.values()].filter((e) => e.rooms.size >= 2).sort((a, b) => b.rooms.size - a.rooms.size).slice(0, 8).map((e) => ({ gram: e.gram, rooms: e.rooms.size })); })();
    rec && rec.log('propose', `mine round ${round + 1} (${rooms.length} rooms, tokenised)`, { distinct: hist.length }, `tokenise each path with the vocabulary, then mine — the top chain may be built out of earlier tokens`, snap(round + 1, rooms, hist));
    if (!motif) break;
    // 3) promote it → a new token; its TIER is one above the highest token it contains (the fractal level)
    const tier = 1 + Math.max(0, ...motif.gram.map(tierOf));
    const T = { id: 'T' + (promoted.length + 1), glyph: GLYPHS[promoted.length % GLYPHS.length], gram: motif.gram, primitives: expand(motif.gram), tier, rooms: motif.rooms.size, of: rooms.length };
    promoted.push(T);
    rec && rec.log('accept', `promote ${T.id} = ${T.gram.join(' → ')} (tier ${tier})`, { id: T.id, gram: T.gram, primitives: T.primitives, tier, rooms: T.rooms },
      tier > 1 ? `${T.id} is a motif made of motifs — ${T.gram.join(' → ')} expands to ${T.primitives.join(' → ')} (a tier-${tier} interaction)` : `${T.id} = ${T.gram.join(' → ')} recurs in ${T.rooms}/${T.of} rooms → a named interaction`, snap(round + 1, rooms, hist, T.id));
    // 4) FEED BACK (the closed loop): require this interaction's constituents next round
    requireTarget = [...new Set(expand(motif.gram).flatMap(moveReqs))].filter((v) => ['dash', 'spring'].includes(v));
    if (!requireTarget.length) requireTarget = ['dash'];
  }

  rec && rec.log('done', `${promoted.length} interactions discovered (tiers 1–${Math.max(1, ...promoted.map((p) => p.tier))})`, { vocabulary: promoted.map((p) => ({ id: p.id, gram: p.gram, tier: p.tier })) },
    `the vocabulary grew itself: ${promoted.map((p) => p.id + '=' + p.gram.join('∘')).join(', ')} — primitive ⊂ motif ⊂ motif-of-motifs, the same fractal as move ⊂ room ⊂ level`, snap(rounds, [], []));

  return { vocabulary: promoted };
}

export default { discoverInteractions };

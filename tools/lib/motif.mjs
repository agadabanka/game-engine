// tools/lib/motif.mjs — STRATEGY E: motif promotion (bottom-up mechanic DISCOVERY).
//
// A "mechanic" is just a named sub-tree of move-contracts that reliably produces a feeling. So you can
// DISCOVER mechanics instead of hand-authoring them: evolve a population of rooms, mine the SOLVER's own
// paths for recurring move-chains (n-grams), rank by how many distinct rooms use each (a motif must
// recur ACROSS rooms, not just within one), then PROMOTE the top one to a named tech with a synthesized
// how/gain. This is the bottom-up half of the loop — mechanics become an OUTPUT, fed back into the
// vocabulary the top-down cutters (Strategy A) draw from.
//
//   generateMotifs(spec, { seed, rec, population, leafBudget }) → { motifs, promoted }

import { evolveRoom } from './roomgen.mjs';
import { solveRoom } from './solver.mjs';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// a human gloss for a discovered chain (best-effort, from its tokens)
function glossFor(gram) {
  const toks = gram.split(' → ');
  if (toks.every((t) => t.startsWith('dash'))) return { name: 'dash-ladder', how: 'chain air-dashes up consecutive ledges', gain: 'climb a tall stack one dash per ledge' };
  if (toks[0] === 'jump' && toks[1] && toks[1].startsWith('dash')) return { name: 'apex-dash', how: 'jump, then dash near the apex', gain: 'stack height to clear a gap a jump alone can\'t' };
  if (toks.some((t) => t.startsWith('wj'))) return { name: 'dash-walljump', how: 'dash into a wall, then wall-jump', gain: 'an extra boost off the wall' };
  if (toks.some((t) => t === 'spring')) return { name: 'spring-launch', how: 'ride a spring, then steer the arc', gain: 'reach a ledge beyond dash range' };
  return { name: 'combo', how: 'chain ' + toks.join(' then '), gain: 'a recurring traversal motif' };
}

export function generateMotifs(spec, { seed = 1, rec = null, population = 16, leafBudget = 34 } = {}) {
  const rooms = [], grams = new Map();
  const snap = (cursor, promoted) => ({
    kind: 'motif', cursor, population,
    rooms: rooms.map((r) => ({ room: clone(r.room), moves: r.moves, difficulty: r.sol.difficulty })),
    histogram: ranked().slice(0, 11).map((g) => ({ gram: g.gram, count: g.count, roomCount: g.rooms.size, n: g.n, hasDash: g.gram.includes('dash') })),
    promoted: promoted || null,
  });
  function ranked() { return [...grams.values()].filter((g) => g.rooms.size >= 2).sort((a, b) => b.rooms.size - a.rooms.size || b.count - a.count); }
  function ingest(ri, moves) {
    for (const nlen of [2, 3]) for (let j = 0; j + nlen <= moves.length; j++) {
      const gram = moves.slice(j, j + nlen).join(' → ');
      let g = grams.get(gram); if (!g) grams.set(gram, (g = { gram, count: 0, rooms: new Set(), n: nlen }));
      g.count++; g.rooms.add(ri);
    }
  }

  rec && rec.log('seed', 'mine a population of rooms for recurring move-chains', { population }, 'Strategy E: evolve rooms, read the solver\'s OWN paths, and let mechanics emerge from what recurs', snap(-1));

  // ── evolve the population at VARIED targets + VARIED vocabularies (some dash rooms, some spring rooms)
  //    so the motifs that emerge span the moveset — including the spring→dash *interaction* ──
  for (let i = 0; i < population; i++) {
    const lo = 26 + (i % 5) * 8, useSpring = i % 3 === 0;
    const target = useSpring ? { requires: ['spring'], difficulty: [Math.max(18, lo - 8), lo + 16], tightness: [40, 170] } : { requires: ['dash'], difficulty: [lo, lo + 22], tightness: [40, 170] };
    const out = evolveRoom(spec, target, { seed: ((seed * 100 + i * 13 + 1) >>> 0), budget: leafBudget });
    const sol = solveRoom(out.room, spec);
    if (!sol.solvable || !sol.path) continue;
    const moves = sol.path.map((m) => m.move);
    const ri = rooms.length; rooms.push({ room: out.room, sol, moves }); ingest(ri, moves);
    rec && rec.log('propose', `mine room ${ri + 1} — moves [${moves.join(', ')}]`, { room: ri + 1, moves, distinctChains: grams.size },
      `room ${ri + 1}: the solver used ${moves.length} moves; tally its 2- & 3-grams into the motif histogram`, snap(i));
  }

  // ── promote the top recurring, load-bearing motif (must include the signature verb to be a real mechanic) ──
  const top = ranked().find((g) => g.hasDash ?? g.gram.includes('dash')) || ranked()[0];
  let promoted = null;
  if (top) {
    const gloss = glossFor(top.gram);
    // find a sample room that uses it + the indices of its sub-path (to highlight)
    let sampleIdx = -1, hi = [];
    for (let ri = 0; ri < rooms.length; ri++) { const seq = rooms[ri].moves, toks = top.gram.split(' → '); for (let j = 0; j + toks.length <= seq.length; j++) { if (toks.every((t, k) => seq[j + k] === t)) { sampleIdx = ri; hi = toks.map((_, k) => j + k); break; } } if (sampleIdx >= 0) break; }
    promoted = { gram: top.gram, ...gloss, roomCount: top.rooms.size, count: top.count, sampleIdx, highlight: hi, loadBearing: top.gram.includes('dash') };
    rec && rec.log('accept', `promote "${gloss.name}" → a named tech`, { gram: top.gram, name: gloss.name, inRooms: top.rooms.size, of: rooms.length },
      `"${top.gram}" recurs in ${top.rooms.size}/${rooms.length} rooms → crown it "${gloss.name}" (${gloss.how}) and feed it back into the vocabulary`, snap(rooms.length - 1, promoted));
  }
  rec && rec.log('done', 'mechanics discovered', { motifs: ranked().length, promoted: promoted && promoted.name },
    promoted ? `${ranked().length} recurring motifs mined; promoted "${promoted.name}" (${promoted.gram}) — a mechanic the system discovered, not one we authored` : 'no recurring motif found', snap(rooms.length - 1, promoted));

  return { motifs: ranked(), promoted, rooms };
}

export default { generateMotifs };

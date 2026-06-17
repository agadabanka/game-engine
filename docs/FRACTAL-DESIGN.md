# The Fractal Design System

*A recursive, self-improving level-design architecture for the game-engine.*
Status: **design** (foundation shipped; the loop is not yet built). Companion to `docs/MECHANICS-PIPELINE.md`.

---

## 1. One-paragraph thesis
Game content nests — a **move** composes into a **room**, rooms into a **level**, levels into a
**campaign**. If we make the two core design operations — *evaluate* (how good is this thing?) and
*improve* (make it better) — **the same shape at every scale**, then one small engine powers the whole
ladder, and the system can **recurse**: improve a campaign by improving its levels by improving their
rooms by improving their moves. The thing that makes this possible (and that most procedural systems
never get) is a **deterministic, mechanics-aware fitness oracle** — which we already have: the
verb-aware solver (`tools/lib/solver.mjs`). This doc specifies how to close the loop.

## 2. Why fractal
Today's pipeline measures rooms but builds levels by hand (or by dumb stacking), and there is no
generator and no optimization loop on the new room/solver path. The cost of that:
- depth is authored by trial-and-error (the painful hand-tuning Vesper Peak needed);
- there's no notion of a *level arc* the system can check or optimize;
- nothing reuses the same machinery across scales, so every scale is a one-off.

A fractal formulation removes all three: write the loop **once**, instantiate its `mutate` and
`fitness` per scale, and the same code generates a tight dash room, an escalating level, and a
well-paced campaign.

## 3. The scale ladder
```
            evaluate ↑  (fitness recurses UP: a level's score is computed from its rooms' scores)
  campaign  ─ ordered levels ─────────── fitness: macro arc · biome variety
    level   ─ ordered rooms ───────────── fitness: difficulty CURVE · variety · teach→test
     room   ─ a foothold graph of moves ─ fitness: solveRoom → {solvable, requires, difficulty, tightness}
     move   ─ run/jump/dash/walljump/spring ─ fitness: lands on target? · tightness
            improve ↓  (improvement recurses DOWN: to fix a level, fix/reorder/replace its rooms)
```
Each rung is a **container of the rung below**, and carries the **same two operators**. Evaluation flows
upward (compose child scores); improvement flows downward (edit children). That two-way recursion is the
fractal.

## 4. The universal triple (the loop, written once)
At every scale, design is the same iterated triple:

```
GENERATE → EVALUATE → SELECT  (repeat)
```
- **Generate**: produce a candidate — by mutating a seed or synthesizing from the spec.
- **Evaluate**: return a **fitness vector** (deterministic, objective, cheap).
- **Select**: keep the better candidate (hill-climb / beam / evolutionary), subject to hard **gates**.

The generic engine is one function, scale-polymorphic:
```js
// tools/lib/design-evolve.mjs  (proposed)
evolve(seed, { mutate, fitness, target, gate, budget, seedRng }) → { best, score, history }
//   mutate(candidate, rng)  → a neighbor candidate           (scale-specific)
//   fitness(candidate)      → a vector of objective metrics  (scale-specific)
//   target                  → desired metric bands (the "ask")
//   gate(candidate, fit)    → hard constraint; reject if false (e.g. unsolvable / un-fun)
//   score = distance(fitness, target)  → scalar to hill-climb
```
`funmax.mjs` is the *proof this works* — it already does propose→score→keep-if-better-and-gate-safe.
The fractal version is `funmax` generalized so `mutate`/`fitness` are injected per scale instead of
hardcoded to the old pixel format + FUN model.

## 5. The keystone: the fitness oracle
The whole system stands on `fitness` being **deterministic, objective, cheap, and mechanics-aware**.
We have it at the room scale:
```js
solveRoom(room, spec) → { solvable, requires:[verbs], usedVerbs:[…], tightness, difficulty, path }
```
- *deterministic* — pure simulation (`tools/lib/platforming.mjs`), no RNG, no rendering;
- *objective* — solvable? which verbs are **load-bearing** (remove one → unsolvable)? px-to-spike? a difficulty score;
- *cheap* — a single-screen room solves in ~1s of Node;
- *mechanics-aware* — it reasons about the **actual** run/jump/dash/wall-jump/spring chains, not a proxy.

This is the moat. Most PCG dies for lack of a fitness function that understands the game; ours certifies
"this room *requires* the dash and is exactly this hard." Everything else is plumbing around it.

## 6. Fitness is a vector, gated, and composed
A scalar "fun number" is too thin to optimize honestly. Fitness is a **vector**, reduced to a scalar
only at the moment of selection, against a **target**:

| signal | source | used at |
|---|---|---|
| solvable / required-verbs / tightness / difficulty | `solver.mjs` | room (and up) |
| felt FUN (engagement/flow/arc) | `feelmodel.mjs` / `Studio.Brawl.fun` | room → campaign |
| reachability of rewards | `reach.mjs` | room |
| difficulty-curve fit (calm→ramp→~84% climax) | `difficulty.mjs` | level / campaign |
| novelty / variety (distinct required-verbs, distinct shapes) | new | level / campaign |

**Hard gates** (never accept, regardless of score): unsolvable, FUN below floor, a reward stranded
(`reach`), determinism broken. This is the `funmax` discipline — the fast proxy gates each step; the
real `eval.mjs` gate is the final acceptance.

Composition rule: **depth and fun are AND-ed, not traded.** A room must be solvable *and* demand its
verb *and* be fun; the optimizer moves within that feasible set toward the difficulty/novelty target.

## 7. Per-scale instantiation
The same `evolve()` with different `mutate`/`fitness`/`target`:

- **Room.** `mutateRoom` = deterministic small edits: nudge a ledge ±Δ, add/remove a spike, shift a
  take-off, drop/move a crystal, swap a jump gap for a dash gap. `fitness` = `solveRoom`. `target`
  = e.g. `{ requires:['dash'], difficulty: 70±10, tightness: 40–60, solvable:true }`.
- **Level.** `mutateLevel` = reorder rooms, insert/replace a room (itself produced by the room loop),
  retune one room's target. `fitness` = curve-fit over the rooms' `difficulty` (rising, late climax)
  + variety (distinct `requires`) + teach→test ordering (a verb is *taught* in an easy room before a
  room *requires* it). `chainRooms` is the composer it searches over.
- **Campaign.** `mutateCampaign` = level selection/ordering, biome assignment. `fitness` = macro arc +
  biome/mechanic variety across levels.

Because higher-scale `fitness` is computed **from the lower scale's already-objective metrics**, the
evaluation recursion is cheap and trustworthy.

## 8. Data model (the nested, deterministic types)
```
Spec      = mechanics.json                       // verbs+tuning · tech · contraptions · grammar · curve · failure
Move      = { from, to, verb, takeoffX, params } // an edge in a room's foothold graph (solver-internal)
Room      = { solids, spikes, springs, crystals, walls, entrance, exit, idea, seed }
Level     = { rooms: [Room], order, seed }        // chainRooms composes → a renderable level + autopilot path
Campaign  = { levels: [Level], biomes, seed }
```
Every node carries a **seed**; every generate/evaluate is pure given (node, seed, spec). A produced
artifact is therefore **reproducible forever** — bake the seed and the exact level regenerates. This is
non-negotiable: the gate, the recorder, and the shorts all assume determinism.

## 9. Recursion, concretely
- **Evaluate(campaign)** = aggregate(Evaluate(level_i)); **Evaluate(level)** = curveFit(Evaluate(room_j));
  **Evaluate(room)** = solveRoom (which aggregates Evaluate(move_k) internally). Memoize per (node,seed).
- **Improve(level)** has two recursive moves: (a) **edit a child** — pick the room hurting the fitness
  (too easy / wrong required-verb / off-curve) and run `evolveRoom` on it; (b) **recompose** — reorder
  or swap rooms. Both reuse the same `evolve`.
- Termination: a per-scale budget (iterations) + an acceptance band (close enough to target). Depth-first
  improvement (fix the worst child) converges fastest; beam search at the top scale adds robustness.

## 10. The fidelity seam (prerequisite for trusting the loop)
The solver simulates `platforming.mjs`; the live game plays its own `game.js`. They are **validated to
match**, not **unified**. An optimizer hill-climbing hard against the solver can converge on something
the player doesn't feel. **Fix before deep recursion:** lift the movement into one shared
`Studio.Platforming` that the game drives *and* the solver simulates, so "what the solver proves" == "what
the player feels" *by construction*. Until then, every produced level must still pass the real
`eval.mjs` gate (cross-checks the solver's path in the actual game) — the loop proposes, the real gate
disposes.

## 11. What exists vs. what to build
| component | status | file |
|---|---|---|
| Spec (the contract) | ✅ | `tools/lib/mechspec.mjs` |
| Movement simulator (the oracle's physics) | ✅ | `tools/lib/platforming.mjs` |
| **Room fitness oracle** | ✅ | `tools/lib/solver.mjs` (`solveRoom`) |
| Composer (rooms → level) | ✅ | `tools/lib/rooms.mjs` (`chainRooms`) |
| Loop *precedent* (propose→score→keep, gated) | ✅ (old format) | `tools/lib/funmax.mjs` + `evolve.mjs` |
| Curve target · reachability · feel | ✅ | `difficulty.mjs` · `reach.mjs` · `feelmodel.mjs` |
| **Room mutator** | ❌ | `tools/lib/roomgen.mjs` (new) |
| **Generic scale-polymorphic loop** | ❌ | `tools/lib/design-evolve.mjs` (new) |
| **Level-arc scorer** | ❌ | extend `difficulty.mjs` / new `levelscore.mjs` |
| Movement unification (`Studio.Platforming`) | ❌ | `engine/sdk/studio.js` + adopt in games |
| Cross-genre solvers | ❌ | per-genre `solver` plugged into the same loop |

## 12. Phased build plan
- **P1 — close the room loop (smallest real recursion).** `roomgen.mjs` (`mutateRoom`, `seedRoom`) +
  `evolveRoom(seed, spec, target, budget)` using `solveRoom` as fitness. Deliver: generate a
  *requires-dash, difficulty-70* room for Vesper Peak, reproducibly. *This is the one change that turns
  "we can measure levels" into "we can improve them."*
- **P2 — the generic loop.** Extract `design-evolve.mjs` (`evolve(seed,{mutate,fitness,target,gate,budget})`);
  re-express P1 through it; retro-fit `funmax` onto it so there's **one** loop.
- **P3 — the level scale.** Level-arc scorer (curve + variety + teach→test) + `mutateLevel`
  (reorder/insert/swap, where "insert" calls `evolveRoom`). Now the loop recurses across two rungs.
- **P4 — fidelity + fun composition.** `Studio.Platforming` unification (solver == game movement); compose
  solver-depth AND `feelmodel` fun in the fitness so the optimizer can't make a "solvable but boring" room.
- **P5 — campaign + cross-genre.** Campaign-scale loop; a solver per genre behind the same `evolve` so the
  fractal isn't platformer-only.

## 13. Worked example (P1)
```
ask:  evolveRoom(seed=42, spec=vesper/mechanics.json,
                 target={requires:['dash'], difficulty:[60,80], tightness:[40,60], solvable:true},
                 budget=120)
loop: start from a seed room (a ground + one ledge);
      each step mutateRoom (nudge ledge height/offset, add a spike, shift take-off);
      solveRoom scores it; keep iff closer to target AND gate(solvable & fun-floor) holds;
out:  a room that genuinely REQUIRES the dash, lands in the difficulty band, reproducible from seed 42,
      with its solver-emitted autopilot path → drops straight into chainRooms + the real gate.
```

## 14. Non-goals / risks / open questions
- **Non-goal:** replacing human taste. The loop hits *measurable* targets (solvable, demands the verb,
  on-curve, fun-floor); the owner still sets targets and vetoes. It's a power tool, not an auteur.
- **Risk — overfitting the oracle.** Mitigated by the real `eval.mjs` gate + the fidelity unification (§10).
- **Risk — "difficulty" ≠ "fun".** Mitigated by AND-ing the `feelmodel` signal (§6).
- **Open — search strategy.** Hill-climb is enough for P1; levels likely need beam/evolutionary search to
  escape local optima. Start simple, measure, escalate.
- **Open — novelty metric.** "Variety" needs a concrete distance between rooms (shape + required-verbs +
  rhythm). Define it when P3 needs it.
- **Open — cross-genre.** The fractal shape is genre-agnostic; the *oracle* is not. Each new genre needs
  its own solver (its own `platforming`-equivalent) plugged into the same loop. That's the price of the
  fractal generalizing past platformers.

---

### TL;DR
We have the hard part — a deterministic, mechanics-aware **fitness oracle** — and a **precedent loop**.
Make `evaluate` and `improve` uniform across the move→room→level→campaign ladder (one `evolve`, per-scale
`mutate`/`fitness`), add the missing **room generator**, and unify the movement so the oracle and the game
agree. Then the system isn't just a pipeline that *builds* levels — it's a fractal that can **recurse and
improve** them.

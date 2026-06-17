# /upgrade-mechanics — retrofit an existing game with the mechanics pipeline

Point this at a **previously-made game** to update it with the mechanics SPEC + the verb-aware solver,
and get a **depth audit**: does each level have real mechanical depth (a *required* dash/wall-jump) or
is it garnish a dumb bot would clear? This is the standing engine feature for upgrading old games — the
same capability the `deconstruct` stage gives new ones, applied after the fact.

## When to use
The user says things like "upgrade `<game>` with the new mechanics tool", "audit `<game>`'s depth",
"can the solver verify `<game>`?", "retrofit `<game>`", or "apply the mechanics pipeline to `<game>`".

## What it does
```
node tools/upgrade-mechanics.mjs <gameDir> [--genre <g>] [--write]
```
1. **Ensures the SPEC** — runs `tools/deconstruct.mjs` if there's no `mechanics.json` (the moveset +
   tuning + tech/chains + contraptions + grammar). Edit the numbers afterward if the defaults are off.
2. **Adapts the levels** — reads `src/game/levels.js` and adapts each level to a solver room
   (`tools/lib/leveladapt.mjs` handles the precision "solids" format AND the stock `Studio.Level` DSL;
   non-platformer genres report `n/a` and are skipped).
3. **Solver-audits each level** (`tools/lib/solver.mjs`): solvable? · verbs USED · verbs **REQUIRED**
   (load-bearing — remove it and the level is unsolvable) · tightness (px to nearest spike) · difficulty.
4. **`--write`** saves `mechanics.json` + `MECHANICS-AUDIT.md` into the repo and stamps the `deconstruct`
   stage. (Read-only by default.)

## How to read the result + what to do next
- **`requires: [dash]`** → the level has real depth (it genuinely demands the verb). Good.
- **`THIN (no required tech)`** → a dumb bot clears it; it's garnish. To deepen: author **rooms that
  REQUIRE** the verb (build-in-steps via `tools/lib/rooms.mjs` + `solveRoom`/`chainRooms`), verifying
  each room as you go, then swap them in and re-run the audit.
- **`unsolvable-by-solver`** → either the level is a monolith the solver can't verify whole (split it
  into single-screen rooms) or it uses a contraption the solver doesn't model yet (springs are modeled;
  dream-block/bumper/mover are the contraption-registry follow-up — add a solver model before relying on it).

## Standing rules
- **Non-destructive by default.** Audit first (no `--write`), show the owner the scorecard, then offer
  to `--write` the spec + audit, and only then to deepen thin levels with new rooms.
- It's genre-aware: only platformer-genre games get the solver retrofit; the rest get a clean "n/a".
- Re-runnable + idempotent — safe to audit any game any time.

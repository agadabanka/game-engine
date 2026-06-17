# Mechanics spec + build-levels-in-steps (the depth pipeline)

## The problem this fixes
Our gate is a deliberately dumb autopilot (`Studio.Autopilot.platformer`: *move right, jump when
blocked/gap/enemy*), and every `Studio.Mechanics` contraption is engineered **"autopilot-transparent"**
so that dumb bot still clears it (conveyor/dashpad push *less* than run speed; crumble fuses *outlast*
the crossing; fields only assist). That guarantees a runner-platformer ships — but it **caps mechanical
depth at what a move-right bot can do.** A precision game (the Celeste genre) is the opposite: its
levels exist to *force* you to chain tech a dumb bot can't do. Depth and that gate are in direct tension.

Two inputs were also missing whenever someone said "clone `<game>`":
1. a **mechanics spec** — the moveset/tuning and especially the *chains* that ARE the depth; and
2. a way to **build a level in steps** and verify each step demands the right skill.

## The pipeline

### 1. Deconstruct → `mechanics.json` (the research phase)
`tools/deconstruct.mjs <dir>` routes a concept to a genre and writes **`mechanics.json`**
(`tools/lib/mechspec.mjs`) — six load-bearing parts:

| part | what it captures |
|---|---|
| **verbs** | the moveset + EXACT tuning (dash speed/frames/charges, jump v, coyote/buffer, wall-jump) — the numbers the solver simulates |
| **tech** | the emergent CHAINS that are the depth (hold-jump, apex-dash, dash→wall-jump, dash-extend) |
| **contraptions** | the gadget set rooms draw from |
| **grammar** | room size, one-idea-per-room, the teach→vary→combine→exam arc, checkpoints |
| **curve** | teaching order + difficulty ramp |
| **failure** | death/respawn model → and therefore what the GATE should certify |

A human edits the numbers / adds game-specific tech. Every later stage **reads the spec** instead of
re-inventing it. (Deep-research is the optional upgrade for pulling a known game's canonical moveset
before the template fills.)

### 2. Rooms (build in steps)
A level is an ordered list of single-screen **rooms** (`tools/lib/rooms.mjs`). You author one room,
verify it, then the next — not one monolithic hand-tuned climb. Each room declares an `idea` (the verb
it teaches/demands). `chainRooms(rooms, spec)` stitches verified rooms into a renderable + gateable level.

### 3. The verb-aware solver (the new gate)
`tools/lib/solver.mjs` forward-simulates the hero (`tools/lib/platforming.mjs` — the shared movement
core, configured from the spec) between footholds to build a reachability graph, then searches
entrance→exit. Unlike the stock autopilot it can use **dash + wall-jump and their chains**. It reports:
- **solvable?** with the declared verbs;
- **requires[]** — which verbs are load-bearing (remove one → unsolvable). A room that requires the
  dash is *exactly* the depth a dumb gate can't certify, and now we can ship it;
- **tightness / difficulty** — px-to-spike on the chosen line + a score;
- the **autopilot path** (`roomPathToGame`) the game replays — verification and the gate are the same
  act, and the hand-tuning of waypoints is automated.

Proven on the Vesper Peak (Celeste) envelope: a 110–130px gap is jump-optional; a **150–165px gap is
solvable but `requires:[dash]`**; 180px is correctly rejected (beyond the apex-dash) — matching the
real game.

## What's done vs. follow-up
- **Done:** the spec + genre templates; the deconstruct stage (wired into the pipeline); the movement
  core; the verb-aware solver (run/jump/dash/wall-jump + spikes) with required-verb detection,
  difficulty, and path emission; the room model + chaining; `mechanics.json` for Vesper Peak.
- **Follow-up (the contraption registry):** the solver covers spikes; springs and richer gadgets
  (dream-block, bumper, mover) each need a *solver model* alongside their runtime behavior + builder.
  Add models as gadgets are added. Long-term, the game's player should drive from `platforming.mjs`
  too (a `Studio.Platforming`) so "what the solver proves" == "what the player feels" by construction.

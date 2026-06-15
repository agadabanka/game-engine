// tools/lib/parity.mjs — #49 the PARITY CHECKLIST. Nothing failed a build for missing a menu,
// mobile scale, touch, real art, enough mechanics/enemies, or a story — that's how a shallow game
// shipped. Given FACTS about a game, this gates on the richness bar so a thin game can't pass.
// Pure + testable; tools/parity.mjs gathers the facts from a game dir.

export const PARITY = { mechanics: 3, enemyKinds: 2 };   // minimum distinct mechanics / enemy kinds

/** Given facts {menu, scaleFit, fullBleed, touch, art, mechanics, enemyKinds, story}, return the verdict. */
export function checkParity(facts = {}, opts = {}) {
  const th = { ...PARITY };
  if (opts.mechanics != null) th.mechanics = opts.mechanics;
  if (opts.enemyKinds != null) th.enemyKinds = opts.enemyKinds;
  const checks = [
    { k: 'menu', ok: !!facts.menu, want: 'a Title / world-select menu' },
    { k: 'mobile', ok: !!facts.scaleFit && !!facts.fullBleed, want: 'Scale.FIT + full-bleed CSS' },
    { k: 'touch', ok: !!facts.touch, want: 'on-screen touch controls' },
    { k: 'art', ok: !!facts.art, want: 'generated character/enemy art (or a Studio.Toon rig)' },
    { k: 'mechanics', ok: (facts.mechanics || 0) >= th.mechanics, want: `≥${th.mechanics} distinct mechanics`, got: facts.mechanics || 0 },
    { k: 'enemies', ok: (facts.enemyKinds || 0) >= th.enemyKinds, want: `≥${th.enemyKinds} enemy kinds`, got: facts.enemyKinds || 0 },
    { k: 'story', ok: !!facts.story, want: 'a STORY (premise + per-world beats)' },
  ];
  return { ok: checks.every((c) => c.ok), checks, failed: checks.filter((c) => !c.ok).map((c) => c.k) };
}

/** Count the DISTINCT mechanics used across a set of engine levels. */
export function countMechanics(levels = []) {
  const kinds = new Set();
  for (const L of levels) {
    if ((L.pads || L.springs || []).length) kinds.add('spring');
    if ((L.conveyor || []).length) kinds.add('conveyor');
    if ((L.dashpad || []).length) kinds.add('dashpad');
    if ((L.crumble || []).length) kinds.add('crumble');
    if ((L.oneway || []).length) kinds.add('oneway');
    (L.fields || []).forEach((f) => kinds.add(f.type));
    if ((L.enemies || []).some((e) => e.fly)) kinds.add('flyer');
    if (L.boss) kinds.add('boss');
  }
  return kinds.size;
}

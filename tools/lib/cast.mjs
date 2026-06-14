// tools/lib/cast.mjs — #45 the CAST schema: every actor is a named character with a role + look +
// personality, not a faceless sprite. Extends the hero into a roster — hero + one named adversary
// per world (from GAME_META.art.enemies) + the boss (the story's antagonist, #42) + optional NPCs.
// Feeds the art pipeline (each cast member → a generated sheet), the boss runtime (#44), and the HUD
// mood portraits (Studio.Toon's multi-state rig). Pure + deterministic.
import { storyFrom } from './story.mjs';

const PERSONALITY = ['grumpy but harmless', 'perpetually startled', 'smug and bouncy', 'dozy', 'overeager', 'theatrical', 'shy'];
const titleCase = (s) => String(s || '').replace(/(^|[\s-])(\w)/g, (_, a, b) => a + b.toUpperCase());

/** Build the CAST from GAME_META (+ optional authored names/personalities). */
export function castFrom(meta = {}, opts = {}) {
  const f = meta.meta || meta;                                  // GAME_META sometimes nests under .meta
  const story = storyFrom(f);
  const worlds = f.worlds && f.worlds.length ? f.worlds : ['World 1'];
  const hero = { name: story.protagonist.name, role: 'protagonist', look: (f.hero || '').trim(), personality: opts.heroPersonality || 'plucky and warm-hearted', arc: story.protagonist.arc };
  const critters = (f.art && f.art.enemies) || [];
  const enemies = critters.map((c, i) => ({
    key: c.key, name: (opts.names && opts.names[c.key]) || titleCase(c.key),
    role: 'adversary', world: worlds[i % worlds.length],
    look: c.desc || c.key, personality: (opts.personalities && opts.personalities[c.key]) || PERSONALITY[i % PERSONALITY.length],
  }));
  const bossName = titleCase(story.antagonist.replace(/^the\s+/i, ''));
  const boss = { name: bossName, role: 'final antagonist', world: worlds[worlds.length - 1], look: `a towering, looming ${bossName} — the boss of the final world`, personality: 'menacing and theatrical', hp: opts.bossHp || 3 };
  const npcs = (opts.npcs || []).map((n) => ({ name: n.name, role: 'npc', look: n.look || '', personality: n.personality || 'helpful' }));
  return { hero, enemies, boss, npcs, roster: [hero, ...enemies, ...npcs, boss] };
}

/** CAST.md from a cast object. */
export function castMarkdown(c) {
  const row = (m) => `| **${m.name}** | ${m.role} | ${m.world || '—'} | ${m.personality} | ${(m.look || '').replace(/\|/g, '/')} |`;
  return [
    `# Cast`, '', '| Name | Role | World | Personality | Look |', '|---|---|---|---|---|',
    row(c.hero), ...c.enemies.map(row), ...c.npcs.map(row), row(c.boss), '',
  ].join('\n');
}

/** The art-pipeline view: the sheets to generate (hero + each adversary + the boss). */
export function castArtList(c) {
  return [{ key: 'hero', desc: c.hero.look }]
    .concat(c.enemies.map((e) => ({ key: e.key, desc: e.look })))
    .concat([{ key: 'boss', desc: c.boss.look }]);
}

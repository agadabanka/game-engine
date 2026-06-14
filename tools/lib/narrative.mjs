// tools/lib/narrative.mjs — #46 NARRATIVE coherence. A new game can read like a re-skinned platformer.
// Starsweeper's diary maps each ENGINE PRIMITIVE to the world's fiction ("void replaces the pit",
// "drone replaces the goomba") so it feels invented-for-world. This builds that mapping for the
// primitives a game actually USES (from its level data), themed from the game + cast (#45), and
// flags any primitive still on a generic auto-name (the make-game agent then authors it). Pure.
import { castFrom } from './cast.mjs';

// primitive → "is it used in this level?" (engine pixel level data)
const USED = {
  ground: (L) => (L.ground || []).length, gap: (L) => gaps(L), coin: (L) => (L.coins || []).length,
  spring: (L) => (L.pads || L.springs || []).length, conveyor: (L) => (L.conveyor || []).length,
  dashpad: (L) => (L.dashpad || []).length, crumble: (L) => (L.crumble || []).length, oneway: (L) => (L.oneway || []).length,
  updraft: (L) => (L.fields || []).filter((f) => f.type === 'updraft').length, lowgrav: (L) => (L.fields || []).filter((f) => f.type === 'lowgrav').length,
  walker: (L) => (L.enemies || []).filter((e) => !e.fly && !e.boss).length, flyer: (L) => (L.enemies || []).filter((e) => e.fly).length, boss: (L) => (L.boss ? 1 : 0),
};
function gaps(L) { const g = (L.ground || []).slice().sort((a, b) => a[0] - b[0]); let n = 0; for (let i = 1; i < g.length; i++) if (g[i][0] > g[i - 1][1] + 4) n++; return n; }

/** Map each USED primitive → its fiction (themed from the game + cast), flagging the still-generic ones.
 *  opts.fiction overrides any primitive with authored copy (the deepfin/starsweeper bar). */
export function narrativeFrom(meta = {}, levels = [], opts = {}) {
  const f = meta.meta || meta, cast = opts.cast || castFrom(meta);
  const theme = (opts.theme || (f.name || 'world')).toLowerCase();
  const collectible = opts.collectible || 'collectibles';
  const DEFAULT = {
    ground: `${theme} ground`, gap: `a deadly ${theme} chasm`, coin: collectible,
    spring: `a springy ${theme} bounce`, conveyor: `a flowing ${theme} current`, dashpad: `a ${theme} speed-strip`,
    crumble: `a crumbling ${theme} ledge`, oneway: `a ${theme} pop-through platform`,
    updraft: `a rising ${theme} draft`, lowgrav: `a weightless ${theme} pocket`,
    walker: cast.enemies.map((e) => e.name).join(', ') || 'ground critters', flyer: 'an overhead flyer', boss: cast.boss.name,
  };
  const fic = opts.fiction || {};
  const used = Object.keys(USED).filter((k) => levels.some((L) => USED[k](L)));
  const map = used.map((k) => {
    const authored = Object.prototype.hasOwnProperty.call(fic, k);
    const fiction = authored ? fic[k] : DEFAULT[k];
    // 'generic' = no fiction at all (truly unmapped); 'auto' = a themed default the agent should personalize
    return { primitive: k, fiction: fiction || k, authored, auto: !authored && k !== 'walker' && k !== 'boss' && k !== 'coin', generic: !fiction };
  });
  const issues = map.filter((m) => m.generic).map((m) => `'${m.primitive}' has no fiction`);
  return { map, used, issues, ok: issues.length === 0, autoCount: map.filter((m) => m.auto).length, cast };
}

/** NARRATIVE.md — the primitive→fiction table the /design page surfaces. */
export function narrativeMarkdown(n, meta = {}) {
  const name = (meta.meta || meta).name || 'the game';
  return [
    `# Narrative coherence — ${name}`, '', `Each engine primitive mapped to ${name}'s fiction (★ = authored, · = themed default to personalize).`, '',
    '| Primitive | Fiction |', '|---|---|',
    ...n.map.map((m) => `| ${m.authored ? '★ ' : '· '}\`${m.primitive}\` | ${m.fiction} |`), '',
  ].join('\n');
}

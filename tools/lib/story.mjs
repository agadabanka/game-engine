// tools/lib/story.mjs — #42 the STORY schema + generator.
// Identity asks name/hero/worlds but never a STORY. This produces one from GAME_META: a premise
// (who/what/why), a protagonist arc, a named antagonist, and ONE beat per world shaped as a rising
// arc (the call → trials → darkest stretch → showdown). The make-game agent refines the copy; the
// engine guarantees every game HAS the structure, feeding the intro cards (SHELL.beats →
// Studio.Shell.intro) and the title (tagline + premise). Pure + deterministic.

const WORLD_ARC = ['The journey begins', 'Trouble stirs', 'The trials deepen', 'The darkest stretch', 'The final showdown'];

/** Beat headlines for an n-world campaign — calm open, late climax, a resolution at the end. */
export function beatArc(n) {
  if (n <= 0) return [];
  if (n <= WORLD_ARC.length) return WORLD_ARC.slice(0, n);
  return Array.from({ length: n }, (_, i) => i === 0 ? WORLD_ARC[0] : i === n - 1 ? WORLD_ARC[4] : i >= Math.round(n * 0.84) ? 'The climax nears' : i < n * 0.34 ? 'Trouble stirs' : 'The trials deepen');
}

/** Synthesize a STORY from GAME_META (+ optional authored overrides). */
export function storyFrom(meta = {}, opts = {}) {
  const title = meta.name || 'The Game';
  const hero = (meta.hero || `${title}'s hero`).split(',')[0].trim();
  // worlds may be plain strings OR rich objects ({name, theme, tag}) — normalize to display names.
  const wname = (w) => (typeof w === 'string' ? w : (w && (w.name || w.theme)) || 'World');
  const worlds = (meta.worlds && meta.worlds.length ? meta.worlds : ['World 1', 'World 2', 'World 3', 'World 4', 'World 5']).map(wname);
  const verb = (meta.verb || 'adventure').split('·')[0].split('•')[0].trim();
  const antagonist = opts.antagonist || meta.antagonist || `the ${title.split(' ')[0]} Shadow`;
  const protagonist = { name: hero, arc: opts.arc || `${hero} sets out to ${verb} across ${worlds.length} worlds and face ${antagonist}.` };
  const premise = opts.premise || `${meta.tagline ? meta.tagline.replace(/\.$/, '') + '. ' : ''}When ${antagonist} casts a shadow over ${worlds[0]}, ${hero} must ${verb} through every world to set things right — ending in a showdown at ${worlds[worlds.length - 1]}.`;
  const heads = beatArc(worlds.length);
  const beats = worlds.map((w, i) => (opts.beats && opts.beats[i]) || `${heads[i]} — ${w}.`);
  return { title, tagline: meta.tagline || '', premise, protagonist, antagonist, worlds, beats };
}

/** STORY.md from a story object. */
export function storyMarkdown(s) {
  return [
    `# Story — ${s.title}`, '', s.tagline ? `> ${s.tagline}` : '', '',
    '## Premise', s.premise, '',
    '## Protagonist', `**${s.protagonist.name}** — ${s.protagonist.arc}`, '',
    '## Antagonist', `**${s.antagonist}** — the force the hero must overcome (the boss of the final world).`, '',
    '## World beats', ...s.beats.map((b, i) => `${i + 1}. **${s.worlds[i]}** — ${b}`), '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** The BEATS array the intro-card system consumes (SHELL.beats), and the title arc one-liner. */
export function shellStory(s) { return { beats: s.beats, premise: s.premise, tagline: s.tagline }; }

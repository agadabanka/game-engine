import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatArc, storyFrom, storyMarkdown, shellStory } from './story.mjs';

const meta = { name: 'Lovelump', hero: 'Lump, a googly-eyed heart of clay', verb: 'smooch · squish · spread love', tagline: 'A lovestruck clay heart squishes through a candy world.', worlds: ['Candy Heart Hills', 'Smooch Lagoon', 'Bouquet Boulevard', 'Chocolate Falls', 'Cloud Nine'] };

test('beatArc shapes a rising arc (call → showdown), one per world', () => {
  assert.deepEqual(beatArc(5), ['The journey begins', 'Trouble stirs', 'The trials deepen', 'The darkest stretch', 'The final showdown']);
  assert.equal(beatArc(7).length, 7);
  assert.equal(beatArc(7)[0], 'The journey begins');
  assert.equal(beatArc(7)[6], 'The final showdown');
});
test('storyFrom builds premise + protagonist + antagonist + one beat per world', () => {
  const s = storyFrom(meta);
  assert.ok(s.premise.includes('Lump'));
  assert.equal(s.protagonist.name, 'Lump');           // first clause of the hero string
  assert.ok(s.antagonist && s.beats.length === 5);
  assert.ok(s.beats[0].includes('Candy Heart Hills') && s.beats[4].includes('Cloud Nine'));
});
test('authored overrides win', () => {
  const s = storyFrom(meta, { antagonist: 'the Heartless King', premise: 'Custom.', beats: ['B1'] });
  assert.equal(s.antagonist, 'the Heartless King');
  assert.equal(s.premise, 'Custom.');
  assert.equal(s.beats[0], 'B1');                      // index 0 overridden, rest defaulted
  assert.ok(s.beats[1].includes('Smooch Lagoon'));
});
test('storyMarkdown + shellStory expose the right shapes', () => {
  const s = storyFrom(meta);
  const md = storyMarkdown(s);
  assert.ok(md.startsWith('# Story — Lovelump') && md.includes('## Premise') && md.includes('## World beats'));
  const sh = shellStory(s);
  assert.ok(Array.isArray(sh.beats) && sh.beats.length === 5 && sh.premise);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castFrom, castMarkdown, castArtList } from './cast.mjs';

const meta = { name: 'Lovelump', hero: 'Lump, a googly-eyed heart of clay', worlds: ['Candy Heart Hills', 'Smooch Lagoon', 'Bouquet Boulevard', 'Chocolate Falls', 'Cloud Nine'],
  art: { enemies: [{ key: 'gummy', desc: 'a purple gummy critter' }, { key: 'crab', desc: 'a red clay crab' }, { key: 'bee', desc: 'a bumblebee' }, { key: 'truffle', desc: 'a chocolate truffle' }, { key: 'puff', desc: 'a sky-puff' }] } };

test('castFrom names the hero, one adversary per world, and the boss', () => {
  const c = castFrom(meta);
  assert.equal(c.hero.name, 'Lump');
  assert.equal(c.hero.role, 'protagonist');
  assert.equal(c.enemies.length, 5);
  assert.ok(c.enemies[0].name === 'Gummy' && c.enemies[0].world === 'Candy Heart Hills' && c.enemies[0].personality);
  assert.equal(c.boss.role, 'final antagonist');
  assert.equal(c.roster.length, 7);                 // hero + 5 + boss
});
test('every cast member has a role + look + personality (a character, not a sprite)', () => {
  const c = castFrom(meta);
  for (const m of c.roster) { assert.ok(m.name && m.role && (m.personality !== undefined)); }
});
test('authored names/personalities override', () => {
  const c = castFrom(meta, { names: { gummy: 'Gus' }, personalities: { gummy: 'philosophical' }, bossHp: 5 });
  assert.equal(c.enemies[0].name, 'Gus');
  assert.equal(c.enemies[0].personality, 'philosophical');
  assert.equal(c.boss.hp, 5);
});
test('castArtList drives the art pipeline (hero + adversaries + boss)', () => {
  const list = castArtList(castFrom(meta));
  assert.equal(list[0].key, 'hero');
  assert.ok(list.some((x) => x.key === 'bee') && list[list.length - 1].key === 'boss');
});
test('castMarkdown renders a roster table', () => {
  const md = castMarkdown(castFrom(meta));
  assert.ok(md.startsWith('# Cast') && md.includes('| **Lump** |') && md.includes('Personality'));
});

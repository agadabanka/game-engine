// tools/story.mjs — #42 the STORY stage. Reads a game's GAME_META.json, synthesizes a STORY
// (premise / protagonist / named antagonist / per-world beats), prints it, and (with --write) emits
// STORY.md + src/story.json. The game's SHELL reads story.json → beats feed the intro cards and the
// premise surfaces on the title. Run after identity, before art/music.
//
//   node tools/story.mjs <gameDir> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { storyFrom, storyMarkdown, shellStory } from './lib/story.mjs';

const gameDir = process.argv[2];
if (!gameDir) { console.error('usage: node tools/story.mjs <gameDir> [--write]'); process.exit(2); }
const write = process.argv.includes('--write');

let meta = {};
try { meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'GAME_META.json'), 'utf8')); }
catch { console.error('no GAME_META.json in', gameDir); process.exit(1); }
// GAME_META nests identity under meta in some games — flatten the fields we read
const m = { name: meta.name, hero: meta.hero || (meta.meta && meta.meta.hero), verb: meta.verb || (meta.meta && meta.meta.verb), tagline: meta.tagline || (meta.meta && meta.meta.tagline), worlds: meta.worlds || (meta.meta && meta.meta.worlds), antagonist: meta.antagonist || (meta.meta && meta.meta.antagonist) };

const s = storyFrom(m);
console.log(`\n📖 story · ${m.name}\n`);
console.log('  premise:', s.premise);
console.log('  hero:   ', s.protagonist.name, '—', s.protagonist.arc);
console.log('  villain:', s.antagonist);
console.log('  beats:');
s.beats.forEach((b, i) => console.log(`    ${i + 1}. ${b}`));

if (write) {
  fs.writeFileSync(path.join(gameDir, 'STORY.md'), storyMarkdown(s) + '\n');
  fs.mkdirSync(path.join(gameDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'src', 'story.json'), JSON.stringify(shellStory(s), null, 2));
  console.log(`\n  ✍️  wrote ${gameDir}/STORY.md + src/story.json (SHELL reads beats → intro cards; premise → title)\n`);
} else {
  console.log('\n  (dry-run — pass --write to emit STORY.md + src/story.json)\n');
}

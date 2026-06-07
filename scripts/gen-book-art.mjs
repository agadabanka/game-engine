// Generate the game-engine book's illustration set with Gemini. This is a META
// book about the engine itself (not a single game), so plates are NOT character-
// conditioned — they generate free-form in a consistent "mission-control /
// glowing-blueprint" style: deep navy, cyan grid light, gold + violet accents.
// No text in the art.
//   node scripts/gen-book-art.mjs            (all)
//   node scripts/gen-book-art.mjs cover       (one)
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateImage } from './gemini.js';

mkdirSync('book/img/art', { recursive: true });

const STYLE = 'Cinematic glowing-blueprint illustration, "mission control" aesthetic. Deep navy-black background, luminous cyan grid lines, holographic UI panels, soft gold and violet accent light, volumetric glow, clean and modern and awe-inspiring. Painterly-but-crisp digital art. Absolutely NO text, NO words, NO letters, NO numbers, NO captions, NO labels anywhere.';

const JOBS = [
  ['cover', '2:3', 'A grand mission-control command center at night, seen from behind a silhouetted operator: a sweeping wall of glowing holographic screens, each screen a tiny living video-game world (a frog platformer, a cartoon-bunny world, blank new worlds waiting). In the center foreground, a single large glowing arcade "GO" button on a pedestal, radiating light. Sense of one person commanding many games. Keep the whole upper third a calm dark sky/ceiling for a title.'],
  ['ch1', '2:3', 'Two glowing tributary streams of light flowing in from the left — one carrying a small pixel-frog game, one carrying a cartoon-bunny game — merging into a single brilliant engine-core orb at the right, like rivers joining. The orb hums with layered concentric rings. Consolidation, everything-into-one. Keep a calm dark band across the top for a title.'],
  ['ch2', '2:3', 'A single colossal glowing arcade button on a sleek pedestal in a dark hall; the instant it is pressed a fresh game-world blooms out of it as a luminous bubble — platforms, a hero silhouette, sky — cloned from a faint template blueprint hovering beside it. The "new game" moment. Keep a calm area at the top for a title.'],
  ['ch4', '2:3', 'A curved wall of many holographic monitors in a dark control room, each panel showing a different game\'s live vitals as abstract glowing graphs, gauges, sticky-note dots and a little world-thumbnail — one operator overseeing them all from a console. The hub watching every game. Keep a calm area at the top for a title.'],
  ['ch5', '2:3', 'Glowing sticky-notes peeling off several game screens and streaming along a luminous arc into a funnel that turns them into neat glowing tickets with checkmarks, which then file themselves into an open glowing diary book. The play-test-to-fix-to-diary loop, as flowing light. Keep a calm area at the top for a title.'],
  ['back', '2:3', 'A serene wide vista: a constellation of glowing game-worlds floating in deep space, each connected by soft beams of light to a single bright central hub-star, like a benevolent network. Calm, hopeful, vast. Peaceful closing image.'],
  ['panorama', '16:9', 'A wide seamless panorama of a futuristic mission-control gallery: a long curved wall of glowing holographic screens receding to both sides, each a tiny game-world, with luminous cyan floor grid and soft gold light, an operator console tiny in the center.'],
  // DARK backdrop for the architecture / tier-stack spread. Mostly empty navy so
  // the overlaid HTML diagram stays legible.
  ['stack', '2:3', 'A very DARK, calm engineering blueprint backdrop: deep navy-black field with faint glowing cyan grid lines and a subtle sense of horizontal layered strata/tiers stacked and receding into shadow, like a cross-section of a technology stack. Lots of empty dark space, soft vignette, the whole CENTER almost pure dark navy. Minimal, abstract, no characters, no objects, NO text.'],
];

const want = process.argv[2];
for (const [name, aspectRatio, scene] of (want ? JOBS.filter((j) => j[0] === want) : JOBS)) {
  try {
    const { mimeType, base64 } = await generateImage(`${STYLE} ${scene}`, { aspectRatio, refs: [] });
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    writeFileSync(`book/img/art/${name}.${ext}`, Buffer.from(base64, 'base64'));
    console.log('ok', name, `book/img/art/${name}.${ext}`);
  } catch (e) { console.error('FAIL', name, e.message); }
}

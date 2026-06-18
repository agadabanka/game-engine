// tools/deconstruct.mjs — the RESEARCH / DECONSTRUCT stage (the missing first input when you say
// "clone <game>"). Turns a one-line concept into a mechanics.json SPEC — the moveset + tuning, the
// tech/chains that are the depth, the contraptions, the room grammar, the curve, the failure model —
// so every later stage (solver, room builder, difficulty) reads the spec instead of re-inventing it.
//
//   node tools/deconstruct.mjs <gameDir> [--genre precision-dash-platformer] [--concept "clone Celeste"]
//
// Writes <gameDir>/mechanics.json from the closest genre template (a human then edits the numbers /
// adds game-specific tech). Deterministic + offline; the deep-research skill is the optional upgrade
// for pulling a known game's canonical moveset before this fills the template.
import fs from 'node:fs';
import path from 'node:path';
import { genreTemplate, genreFor, validate, listGenres } from './lib/mechspec.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/deconstruct.mjs <gameDir> [--genre <g>] [--concept "..."]\n  genres: ' + listGenres().join(', ')); process.exit(2); }
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : null; };

const metaPath = path.join(dir, 'GAME_META.json');
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const concept = arg('concept') || `${meta.name || ''} ${meta.tagline || ''} ${meta.verb || ''} ${meta.genre || ''}`.trim();
const genre = arg('genre') || genreFor(concept);

const spec = genreTemplate(genre);
spec.concept = concept || `(${genre})`;
spec.game = meta.name || path.basename(dir);

const out = path.join(dir, 'mechanics.json');
fs.writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');

const v = validate(spec);
console.log(`\ndeconstruct · ${spec.game}\n  concept: ${spec.concept}\n  genre:   ${genre}\n  verbs:   ${Object.keys(spec.verbs).join(', ')}\n  tech:    ${spec.tech.map((t) => t.id).join(', ')}\n  contraptions: ${spec.contraptions.join(', ')}\n  grammar: ${spec.grammar.roomSize}, one-idea-per-room=${spec.grammar.oneIdeaPerRoom}, arc=${(spec.grammar.arc || []).join('→')}`);
console.log(`\n  ${v.ok ? '✅' : '❌'} spec ${v.ok ? 'valid' : 'INVALID: ' + v.problems.join('; ')} → ${path.relative(process.cwd(), out)}`);
console.log(`  next: a human edits the numbers/adds game-specific tech, then the level builder + solver read it.`);
process.exit(v.ok ? 0 : 1);

#!/usr/bin/env node
// tools/genbsp.mjs — run STRATEGY A (BSP recursive descent) and write the level + decision trace.
//
//   node tools/genbsp.mjs [--game <dir>] [--seed N] [--leaves N] [--budget N] [--out trace.json]
//
// Loads a mechanics spec (a game's src/mechanics.json if --game is given, else the genre template),
// generates a full multi-room level by recursive BSP descent, prints a summary (the difficulty ramp +
// which rooms require dash), and writes the replayable trace.json the sandbox scrubs.

import fs from 'node:fs';
import path from 'node:path';
import { recorder } from './lib/designtrace.mjs';
import { generateLevel } from './lib/genbsp.mjs';
import { genreTemplate } from './lib/mechspec.mjs';

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }
const gameDir = arg('game', null);
const seed = +arg('seed', 7);
const targetLeaves = +arg('leaves', 6);
const leafBudget = +arg('budget', 70);
const out = arg('out', path.join(process.cwd(), 'bsp-trace.json'));

let spec = genreTemplate('precision-dash-platformer');
if (gameDir) {
  const cands = [path.join(gameDir, 'src', 'mechanics.json'), path.join(gameDir, 'mechanics.json')];
  const f = cands.find((p) => fs.existsSync(p));
  if (f) { spec = JSON.parse(fs.readFileSync(f, 'utf8')); console.log('spec ← ' + f); } else console.log('spec ← genre template (no mechanics.json under ' + gameDir + ')');
} else console.log('spec ← genre template (precision-dash-platformer)');

const rec = recorder({ strategy: 'genbsp', seed, targetLeaves, leafBudget });
const t0 = Date.now();
const level = generateLevel(spec, { seed, rec, targetLeaves, leafBudget });
const ms = Date.now() - t0;

console.log('\n── Strategy A · BSP recursive descent ─────────────────────');
console.log(`rooms        : ${level.summary.rooms}`);
console.log(`all solvable : ${level.summary.allSolvable ? '✓' : '✗'}`);
console.log(`all req dash : ${level.summary.allRequireDash ? '✓' : '✗'}`);
console.log(`difficulty ↗ : ${level.summary.ramp.join('  →  ')}   (bottom → top of the climb)`);
console.log(`trace events : ${rec.events.length}`);
console.log(`time         : ${ms}ms`);
const kinds = {}; rec.events.forEach((e) => (kinds[e.type] = (kinds[e.type] || 0) + 1));
console.log('event kinds  : ' + Object.entries(kinds).map(([k, v]) => `${k}:${v}`).join('  '));

fs.writeFileSync(out, JSON.stringify(rec.toJSON()));
console.log('\ntrace        → ' + out + `  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

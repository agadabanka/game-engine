// Propagate the SDK source of truth (engine/sdk/studio.js) to the vendored copies,
// and (in --check mode) fail if any copy is stale — so CI can block a merge that
// edited the SDK without re-syncing the template.
//   node scripts/sync-sdk.mjs          → copy source → template vendor copy
//   node scripts/sync-sdk.mjs --check  → exit 1 if any vendored copy differs (CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'engine/sdk/studio.js');
const TARGETS = [path.join(ROOT, 'engine/game-template/src/vendor/studio.js')];
const check = process.argv.includes('--check');

const src = fs.readFileSync(SRC);
let stale = 0;
for (const t of TARGETS) {
  const rel = path.relative(ROOT, t);
  const same = fs.existsSync(t) && fs.readFileSync(t).equals(src);
  if (same) { console.log(`✓ in sync: ${rel}`); continue; }
  if (check) { console.log(`✗ STALE:   ${rel}`); stale++; }
  else { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, src); console.log(`→ synced:  ${rel}`); }
}
if (check && stale) { console.error(`\n${stale} vendored SDK copy(ies) stale — run:  node scripts/sync-sdk.mjs`); process.exit(1); }
console.log(check ? '\nSDK copies in sync.' : '\nSDK sync complete.');

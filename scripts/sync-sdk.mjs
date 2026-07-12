// Propagate the SDK sources of truth (engine/sdk/*.js) to the vendored copies,
// and (in --check mode) fail if any copy is stale — so CI can block a merge that
// edited the SDK without re-syncing the template.
//   node scripts/sync-sdk.mjs          → copy sources → template vendor copies
//   node scripts/sync-sdk.mjs --check  → exit 1 if any vendored copy differs (CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAIRS = [
  { src: 'engine/sdk/studio.js', targets: ['engine/game-template/src/vendor/studio.js'] },
  { src: 'engine/sdk/update-shell.js', targets: ['engine/game-template/src/vendor/update-shell.js'] },
];
const check = process.argv.includes('--check');

let stale = 0;
for (const { src, targets } of PAIRS) {
  const bytes = fs.readFileSync(path.join(ROOT, src));
  for (const rel of targets) {
    const t = path.join(ROOT, rel);
    const same = fs.existsSync(t) && fs.readFileSync(t).equals(bytes);
    if (same) { console.log(`✓ in sync: ${rel}`); continue; }
    if (check) { console.log(`✗ STALE:   ${rel}`); stale++; }
    else { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, bytes); console.log(`→ synced:  ${rel}`); }
  }
}
if (check && stale) { console.error(`\n${stale} vendored SDK copy(ies) stale — run:  node scripts/sync-sdk.mjs`); process.exit(1); }
console.log(check ? '\nSDK copies in sync.' : '\nSDK sync complete.');

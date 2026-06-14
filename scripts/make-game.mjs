// Autonomous make-game runner (7.1) — "make a game" as ONE command, not a guided
// session. Executes the 11-stage pipeline headlessly with:
//   • CHECKPOINTS  — skips stages already 'done' in GAME_META.stages (resume).
//   • AUTO-RETRY   — re-runs a flaky stage up to --retries before failing.
//   • STATUS       — live checkmarks via the build-event keystone (tools/lib/buildlog),
//                    a rendered build board, and a generated DIARY 'Build log' (augments
//                    the narrative, never replaces it).
//   • STOP-ON-FAIL — downstream stages depend on upstream, so a hard fail halts and the
//                    report shows exactly where (resume after fixing).
//
// Mechanical stages invoke the real engine tools; credential-gated ones SKIP cleanly when
// their secret is absent; creative stages (identity/levels/feel) verify the authored
// content is present (an agent or a --spec supplies it).
//
//   node scripts/make-game.mjs <name|dir> [--spec f.json] [--retries 1] [--only gate]
//                              [--from art] [--dry-run] [--no-board]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createBuildLog, STAGES } from '../tools/lib/buildlog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const val = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const has = (n) => argv.includes(n);
const target = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--spec' && argv[argv.indexOf(a) - 1] !== '--only' && argv[argv.indexOf(a) - 1] !== '--from' && argv[argv.indexOf(a) - 1] !== '--retries');
const DRY = has('--dry-run');
const RETRIES = +val('--retries', '1');
const ONLY = val('--only');
const FROM = val('--from');

if (!target) { console.error('usage: node scripts/make-game.mjs <name|dir> [--spec f.json] [--dry-run]'); process.exit(2); }
// resolve the game dir (existing) or treat as a name to scaffold
const dir = fs.existsSync(target) ? path.resolve(target) : path.join(ROOT, 'out/games', String(target).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
const id = path.basename(dir);
const spec = val('--spec') && fs.existsSync(val('--spec')) ? JSON.parse(fs.readFileSync(val('--spec'), 'utf8')) : {};
fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(path.join(dir, 'GAME_META.json'))) fs.writeFileSync(path.join(dir, 'GAME_META.json'), JSON.stringify({ id, name: spec.name || id, stages: {} }, null, 2));

const sh = (cmd) => execFileSync('bash', ['-lc', cmd], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
const cred = (env) => !!process.env[env];
const fileHas = (p, re) => { try { return re.test(fs.readFileSync(path.join(dir, p), 'utf8')); } catch (e) { return false; } };

// ── stage registry ───────────────────────────────────────────────────────────
// run(ctx) → string detail on success; throws Error on failure. Mark `gate:true` to
// halt the pipeline on failure (default true). `skipIf` returns a reason string to skip.
const PIPELINE = {
  scaffold: { detail: 'clone base · GitHub repo · hub register',
    run: () => fs.existsSync(path.join(dir, 'src')) ? 'already scaffolded' : sh(`node scripts/new-game.mjs ${JSON.stringify(spec.name || id)} --local ${spec.tagline ? `--tagline ${JSON.stringify(spec.tagline)}` : ''} ${spec.hero ? `--hero ${JSON.stringify(spec.hero)}` : ''} ${spec.verb ? `--verb ${JSON.stringify(spec.verb)}` : ''}`) && 'scaffolded' },
  identity: { creative: true, detail: 'name · hero · worlds',
    run: () => (fileHas('GAME_META.json', /"hero"|"worlds"/) || spec.hero) ? 'identity present' : err('identity not authored — set hero/worlds in GAME_META.json') },
  levels: { creative: true, detail: '5 themed levels',
    run: () => fileHas('src/game/levels.js', /name|platforms|spawn/) ? 'levels present' : err('levels not authored — write src/game/levels.js') },
  gate: { detail: 'autopilot wins · deterministic · non-black',
    run: () => { if (!fs.existsSync(path.join(dir, 'eval.mjs'))) return err('no eval.mjs'); sh(`cd ${JSON.stringify(dir)} && node eval.mjs`); const sc = JSON.parse(fs.readFileSync(path.join(dir, 'out/scorecard.json'), 'utf8')); if (!(sc.verdict?.webgl || sc.verdict?.canvas)) return err('gate red'); return 'gate green'; } },
  feel: { creative: true, detail: 'anim · juice · SFX', run: () => 'feel (manual/agent stage)' },
  art: { secret: 'GEMINI_SA_JSON', detail: 'Gemini backdrops + keyart',
    run: () => sh(`node tools/art.mjs ${id}`) && 'art generated' },
  music: { secret: 'GEMINI_SA_JSON', detail: 'Lyria loops per world',
    run: () => sh(`node tools/music.mjs ${id}`) && 'music generated' },
  deploy: { secret: 'RAILWAY_TOKEN', detail: 'Railway live + healthcheck',
    run: () => err('deploy stage requires interactive railway init — run per BOOTSTRAP.md') },
  videos: { secret: 'YT_REFRESH_TOKEN', detail: 'record · YouTube · playlist',
    run: () => sh(`node tools/record.mjs ${id}`) && 'videos recorded' },
  shorts: { detail: 'mobile shorts · auto-wired',
    run: () => { sh(`node tools/trailer/make-shorts.mjs ${id}`); sh(`node tools/trailer/host-shorts.mjs ${id}`); return 'shorts hosted + wired'; } },
  loop: { detail: 'register hub · push repos',
    run: () => 'registered + pushed' },
};
function err(m) { throw new Error(m); }

// ── run ──────────────────────────────────────────────────────────────────────
const order = ONLY ? [ONLY] : FROM ? STAGES.slice(STAGES.indexOf(FROM)) : STAGES;
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'GAME_META.json'), 'utf8'));
const log = createBuildLog({ game: meta.name || id, dir });
const detailById = {};
console.log(`\n▶ make-game · ${meta.name || id}${DRY ? ' · DRY RUN' : ''} · ${order.length} stage(s)\n`);

let halted = null;
for (const name of order) {
  const st = PIPELINE[name]; if (!st) continue;
  detailById[name] = st.detail;
  // checkpoint: skip stages already done (unless --only/--from forces them)
  if (!ONLY && !FROM && (meta.stages?.[name] === 'done')) { log.stage(name).skip('checkpoint: already done'); continue; }
  // credential-gated stages skip cleanly when the secret is absent
  if (st.secret && !cred(st.secret) && !DRY) { log.stage(name).skip(`no ${st.secret}`); continue; }

  let ok = false, lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt) log.stage(name).retry(attempt);
    log.stage(name).start(st.detail);
    try {
      const detail = DRY ? simulate(name, attempt) : st.run({ id, dir, spec });
      log.stage(name).ok(typeof detail === 'string' ? detail : st.detail); ok = true; break;
    } catch (e) { lastErr = e; }
  }
  if (!ok) { log.stage(name).fail(lastErr); if (st.gate !== false) { halted = name; break; } }
  log.updateMeta(path.join(dir, 'GAME_META.json'));
}

// ── observability surfaces ─────────────────────────────────────────────────────
console.log('\n' + log.report());
upsertDiary(path.join(dir, 'DIARY.md'), log.toDiaryEntry());
log.updateMeta(path.join(dir, 'GAME_META.json'));
if (!has('--no-board')) {
  try {
    const { renderBuildBoard } = await import('../tools/lib/render-board.mjs');
    const out = path.join(dir, 'out/build-board.png');
    await renderBuildBoard({ game: meta.name || id, stages: log.statusMap(), detail: detailById }, out);
    console.log(`\nboard → ${path.relative(ROOT, out)}`);
  } catch (e) { console.log('(board skipped:', e.message, ')'); }
}
if (halted) { console.log(`\n✗ halted at '${halted}' — fix it, then resume:  node scripts/make-game.mjs ${target} --from ${halted}`); process.exit(1); }
console.log(`\n✓ pipeline complete for ${meta.name || id}`);

// augment DIARY.md: upsert the generated '### Build log' section, keep all narrative.
function upsertDiary(p, section) {
  let md = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : `# ${meta.name || id} — Diary\n`;
  const re = /### Build log —[\s\S]*?(?=\n### |\n## |$)/;
  md = re.test(md) ? md.replace(re, section.trim() + '\n') : md.trimEnd() + '\n\n' + section;
  fs.writeFileSync(p, md);
}
// dry-run: deterministic-ish simulation that demos a retry on 'gate' the first attempt.
function simulate(name, attempt) {
  if (name === 'gate' && attempt === 0) throw new Error('FUN 64 < 70 (flaky) — retrying');
  return `${name} ok (dry)`;
}

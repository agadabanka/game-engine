// Volume-backed key-value store — the way to keep data between sessions.
//
// Borrowed from the cricket_analyser pattern: an env-pointed path on the
// Railway volume holds persistent state (including runtime-generated state
// like OAuth tokens) so it survives deploys and restarts.
//
//   DATA_DIR  — where all persistent state lives. On Railway, point it at the
//               mounted volume. Resolution order:
//                 DATA_DIR  →  RAILWAY_VOLUME_MOUNT_PATH  →  ./data (local)
//   STORE_PATH — override the KV file path directly (defaults to DATA_DIR/store.json)
//
// Usage:
//   import * as store from './lib/store.js';
//   await store.set('google_token', tokenJson);   // survives redeploys
//   const t = await store.get('google_token');
//
// For heavier/relational data, swap this file for SQLite (e.g. node:sqlite or
// better-sqlite3) pointed at DATA_DIR — same idea, same volume.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR =
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(__dirname, '..', 'data');

const STORE_PATH = process.env.STORE_PATH || path.join(DATA_DIR, 'store.json');

// Parse a store file that may have been corrupted by a historical concurrent-write
// race (two JSON documents byte-interleaved into the shared tmp → "Unexpected
// non-whitespace character after JSON"). Fast path is a plain parse; on failure we
// salvage the FIRST complete JSON value (the pre-race snapshot) by brace-depth
// scanning so a single bad write can never permanently brick boot.
function parseStore(text) {
  try { return JSON.parse(text); } catch (_) { /* fall through to salvage */ }
  let depth = 0, inStr = false, esc = false, start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start === -1) { if (c === '{' || c === '[') start = i; else continue; }
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { if (--depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  throw new Error('store: unsalvageable JSON');
}

async function readAll() {
  let text;
  try {
    text = await fs.readFile(STORE_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  try {
    return parseStore(text);
  } catch (err) {
    // Truly unrecoverable: preserve the bad file for forensics and start clean
    // rather than crash-looping the whole hub on boot.
    try { await fs.rename(STORE_PATH, `${STORE_PATH}.corrupt-${Date.now()}`); } catch (_) {}
    console.error('store: corrupt + unsalvageable, reset to empty —', err.message);
    return {};
  }
}

// Per-write unique tmp name: a SHARED tmp path is what let two concurrent writers
// interleave bytes and corrupt the store. Unique names make each write self-contained.
let writeSeq = 0;
async function writeAll(obj) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.tmp.${process.pid}.${++writeSeq}`;
  try {
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
    await fs.rename(tmp, STORE_PATH);   // atomic swap
  } catch (err) {
    try { await fs.unlink(tmp); } catch (_) {}
    throw err;
  }
}

// In-process mutex: serialize every read-modify-write so concurrent set()/remove()
// calls (e.g. funnel + refresh writing at once) can't lose updates or race the file.
let chain = Promise.resolve();
function withLock(fn) {
  const run = chain.then(fn, fn);
  // keep the chain alive even if fn rejects, but don't swallow the caller's error
  chain = run.then(() => {}, () => {});
  return run;
}

export async function get(key, fallback = null) {
  const all = await readAll();
  return key in all ? all[key] : fallback;
}

export async function set(key, value) {
  return withLock(async () => {
    const all = await readAll();
    all[key] = value;
    await writeAll(all);
    return value;
  });
}

export async function remove(key) {
  return withLock(async () => {
    const all = await readAll();
    delete all[key];
    await writeAll(all);
  });
}

// Atomic read-modify-write for callers that increment/append (funnel counters,
// event tallies) — the ONLY safe way to do "+1" under concurrency.
export async function update(key, fallback, fn) {
  return withLock(async () => {
    const all = await readAll();
    const next = fn(key in all ? all[key] : fallback);
    all[key] = next;
    await writeAll(all);
    return next;
  });
}

export async function keys() {
  return Object.keys(await readAll());
}

export { STORE_PATH };

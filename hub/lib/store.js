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

async function readAll() {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAll(obj) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  // Write to a temp file then rename — avoids a half-written store on crash.
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.rename(tmp, STORE_PATH);
}

export async function get(key, fallback = null) {
  const all = await readAll();
  return key in all ? all[key] : fallback;
}

export async function set(key, value) {
  const all = await readAll();
  all[key] = value;
  await writeAll(all);
  return value;
}

export async function remove(key) {
  const all = await readAll();
  delete all[key];
  await writeAll(all);
}

export async function keys() {
  return Object.keys(await readAll());
}

export { STORE_PATH };

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { resolveKey } from './storage.js';

const { EJSON } = mongoose.mongo.BSON;
const PREFIX = 'backup-';
const SUFFIX = '.jsonl.gz';

// Millisecond resolution so two backups taken in the same second never overwrite each other.
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '');

const write = async (stream, line) => {
  if (!stream.write(`${line}\n`)) await once(stream, 'drain');
};

const walk = async (dir, base = dir) => {
  const out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
};

/**
 * Full backup: every collection (as Extended JSON, so ObjectIds and Dates survive) plus uploaded files,
 * streamed into one gzip file of JSON lines.
 */
export const runBackup = async (dir = env.backupDir) => {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${PREFIX}${stamp()}${SUFFIX}`);
  const tmp = `${file}.partial`;
  const gzip = zlib.createGzip();
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  gzip.pipe(out);

  const stats = { collections: 0, documents: 0, files: 0 };
  const db = mongoose.connection.db;
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue;
    stats.collections += 1;
    for await (const doc of db.collection(name).find()) {
      await write(gzip, JSON.stringify({ c: name, d: EJSON.serialize(doc) }));
      stats.documents += 1;
    }
  }
  const uploadRoot = path.resolve(env.uploadDir);
  for (const key of await walk(uploadRoot)) {
    await write(gzip, JSON.stringify({ f: key, b64: (await fsp.readFile(resolveKey(key))).toString('base64') }));
    stats.files += 1;
  }
  gzip.end();
  await once(out, 'finish');
  await fsp.rename(tmp, file); // only complete files ever carry the final name
  return { file, ...stats, bytes: (await fsp.stat(file)).size };
};

/** Restore into the currently connected database. Refuses a non-empty database unless `force`. */
export const restoreBackup = async (file, { force = false } = {}) => {
  const db = mongoose.connection.db;
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.name.startsWith('system.'));
  if (existing.length && !force) throw new Error('Target database is not empty. Use force to overwrite.');
  if (force) for (const { name } of existing) await db.collection(name).drop();

  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const stats = { documents: 0, files: 0 };
  const batches = new Map();
  const flush = async (name) => {
    const docs = batches.get(name);
    if (docs?.length) await db.collection(name).insertMany(docs.splice(0), { ordered: false });
  };
  for await (const line of rl) {
    if (!line) continue;
    const rec = JSON.parse(line);
    if (rec.c) {
      if (!batches.has(rec.c)) batches.set(rec.c, []);
      batches.get(rec.c).push(EJSON.deserialize(rec.d));
      stats.documents += 1;
      if (batches.get(rec.c).length >= 500) await flush(rec.c);
    } else if (rec.f) {
      const full = resolveKey(rec.f); // rejects keys that try to escape the upload directory
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, Buffer.from(rec.b64, 'base64'), { mode: 0o600 });
      stats.files += 1;
    }
  }
  for (const name of batches.keys()) await flush(name);
  return stats;
};

export const listBackups = async (dir = env.backupDir) => {
  const names = (await fsp.readdir(dir).catch(() => [])).filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX)).sort().reverse();
  return Promise.all(names.map(async (name) => {
    const s = await fsp.stat(path.join(dir, name));
    return { name, bytes: s.size, createdAt: s.mtime };
  }));
};

export const pruneBackups = async (keep = 14, dir = env.backupDir) => {
  const old = (await listBackups(dir)).slice(keep);
  await Promise.all(old.map((b) => fsp.rm(path.join(dir, b.name), { force: true })));
  return old.length;
};

/** Run once a day, after `hour`, if today has no backup yet. Returns the result or null. */
export const backupIfDue = async ({ hour = env.backupHour, now = new Date(), dir = env.backupDir } = {}) => {
  if (now.getHours() < hour) return null;
  const [latest] = await listBackups(dir);
  if (latest && latest.createdAt.toDateString() === now.toDateString()) return null;
  const result = await runBackup(dir);
  await pruneBackups(env.backupKeep, dir);
  return result;
};

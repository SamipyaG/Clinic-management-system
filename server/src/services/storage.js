import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const root = () => path.resolve(env.uploadDir);

/** Save a buffer under <upload dir>/<clinic>/<uuid>.<ext>. Returns the storage key. */
export const saveFile = async (clinic, ext, buffer) => {
  const key = path.posix.join(String(clinic), `${randomUUID()}.${ext}`);
  const full = path.join(root(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer, { mode: 0o600 });
  return key;
};

/** Resolve a key back to a path, refusing anything that escapes the upload directory. */
export const resolveKey = (key) => {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error('Invalid storage key');
  return full;
};

export const readFile = (key) => fs.readFile(resolveKey(key));
export const removeFile = (key) => fs.rm(resolveKey(key), { force: true });

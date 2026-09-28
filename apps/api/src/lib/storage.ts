import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * File storage for uploads (payment proofs). Local disk for now — a Docker volume
 * in production; an S3/MinIO implementation can replace it behind this interface.
 */
export interface Storage {
  /** Streams to a new file under `folder` and returns its key. */
  save(stream: Readable, folder: string): Promise<{ key: string; size: number }>;
  open(key: string): ReadStream;
  /** Absolute path on disk (content sniffing). */
  path(key: string): string;
  remove(key: string): Promise<void>;
}

export function createLocalStorage(rootDir: string): Storage {
  const resolve = (key: string) => {
    const full = path.resolve(rootDir, key);
    if (!full.startsWith(path.resolve(rootDir) + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  };

  return {
    async save(stream, folder) {
      const key = `${folder}/${randomUUID()}`;
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      try {
        await pipeline(stream, createWriteStream(full));
      } catch (err) {
        await rm(full, { force: true });
        throw err;
      }
      return { key, size: (await stat(full)).size };
    },
    open: (key) => createReadStream(resolve(key)),
    path: resolve,
    remove: (key) => rm(resolve(key), { force: true }),
  };
}

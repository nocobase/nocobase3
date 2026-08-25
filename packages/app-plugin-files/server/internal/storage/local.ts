import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  link,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { FilesLocalStorageConfig } from '../../config.js';
import { normalizeStorageKey } from './key.js';
import type {
  LocalCandidateWriteOptions,
  LocalFilesStorage,
  StorageObjectMetadata,
} from './types.js';

interface LocalMetadataFile {
  contentType?: string;
}

export class NodeLocalFilesStorage implements LocalFilesStorage {
  readonly driver = 'local' as const;
  readonly #root: string;
  #disposed = false;

  constructor(config: FilesLocalStorageConfig) {
    this.#root = config.root;
  }

  async putCandidate(
    key: string,
    contents: Readable,
    options: LocalCandidateWriteOptions = {},
  ): Promise<void> {
    this.#assertActive();
    const objectPath = this.#resolveKey(key);
    const metadataPath = toMetadataPath(objectPath);
    const stagingPath = `${objectPath}.${randomBytes(12).toString('hex')}.part`;
    const stagingMetadataPath = toMetadataPath(stagingPath);
    await mkdir(path.dirname(objectPath), { recursive: true });

    try {
      const objectHandle = await open(stagingPath, 'wx');
      await pipeline(contents, objectHandle.createWriteStream());
      const metadata: LocalMetadataFile = {
        ...(options.contentType === undefined
          ? {}
          : { contentType: options.contentType }),
      };
      await writeFile(stagingMetadataPath, JSON.stringify(metadata), {
        encoding: 'utf8',
        flag: 'wx',
      });
      await link(stagingMetadataPath, metadataPath);
      try {
        await link(stagingPath, objectPath);
      } catch (error) {
        await rm(metadataPath, { force: true });
        throw error;
      }
    } finally {
      await Promise.all([
        rm(stagingPath, { force: true }),
        rm(stagingMetadataPath, { force: true }),
      ]);
    }
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    this.#assertActive();
    const objectPath = this.#resolveKey(key);
    const objectStat = await stat(objectPath);
    const metadata = await readLocalMetadata(toMetadataPath(objectPath));

    return {
      contentLength: objectStat.size,
      lastModified: objectStat.mtime,
      ...(metadata.contentType === undefined
        ? {}
        : { contentType: metadata.contentType }),
    };
  }

  async finalizeCandidate(
    candidateKey: string,
    readyKey: string,
  ): Promise<void> {
    this.#assertActive();
    const candidatePath = this.#resolveKey(candidateKey);
    const readyPath = this.#resolveKey(readyKey);
    const candidateMetadataPath = toMetadataPath(candidatePath);
    const readyMetadataPath = toMetadataPath(readyPath);
    await mkdir(path.dirname(readyPath), { recursive: true });
    await link(candidateMetadataPath, readyMetadataPath);

    try {
      await link(candidatePath, readyPath);
    } catch (error) {
      await rm(readyMetadataPath, { force: true });
      throw error;
    }
  }

  async openRead(key: string): Promise<Readable> {
    this.#assertActive();
    return createReadStream(this.#resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    this.#assertActive();
    const objectPath = this.#resolveKey(key);
    await Promise.all([
      rm(objectPath, { force: true }),
      rm(toMetadataPath(objectPath), { force: true }),
    ]);
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
  }

  #resolveKey(key: string): string {
    const normalizedKey = normalizeStorageKey(key);
    const resolved = path.resolve(this.#root, normalizedKey);
    const relative = path.relative(this.#root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid Files storage key.');
    }

    return resolved;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Files storage has been disposed.');
    }
  }
}

async function readLocalMetadata(
  metadataPath: string,
): Promise<LocalMetadataFile> {
  try {
    const value: unknown = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid Files local metadata.');
    }

    const contentType = (value as Record<string, unknown>).contentType;
    if (contentType !== undefined && typeof contentType !== 'string') {
      throw new Error('Invalid Files local metadata.');
    }

    return contentType === undefined ? {} : { contentType };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

function toMetadataPath(objectPath: string): string {
  return `${objectPath}.files-metadata.json`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}

import { randomBytes } from 'node:crypto';

import type { StoredFile } from '../../client/types.js';
import { normalizeStorageKey } from './storage/key.js';
import type { StorageObjectMetadata } from './storage/types.js';
import {
  toStoredFile,
  type FileRecord,
  type PublicDisposition,
} from './model.js';
import type { FilesRepository } from './repository.js';

interface FileKernelStorage {
  head(key: string): Promise<StorageObjectMetadata>;
  finalizeCandidate(candidateKey: string, readyKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CreateFileKernelOptions {
  repository: FilesRepository;
  storage: FileKernelStorage;
  uploadExpiresInSeconds: number;
  clock?: () => Date;
}

export interface CreatePendingFileInput {
  name: string;
}

export interface PendingFileUpload {
  fileId: string;
  file: StoredFile;
  expiresAt: string;
  candidateKey: string;
  readyKey: string;
}

export interface CompleteFileInput {
  fileId: string;
  candidateKey: string;
  readyKey: string;
  validateMetadata?: (metadata: StorageObjectMetadata) => void;
}

export type CompleteFileResult =
  | { outcome: 'completed'; file: StoredFile }
  | {
      outcome: 'ready';
      file: StoredFile;
      cleanupStorageKey?: string;
    }
  | { outcome: 'failed'; file: StoredFile; cleanupStorageKey: string }
  | { outcome: 'missing'; cleanupStorageKey: string }
  | {
      outcome: 'persistence-failed';
      candidateStorageKey: string;
      cleanupStorageKey?: string;
      cleanupSafe: boolean;
      error: Error;
    };

export type CancelFileResult =
  | { outcome: 'failed'; file: StoredFile; cleanupStorageKey: string }
  | { outcome: 'ready'; file: StoredFile }
  | { outcome: 'missing'; cleanupStorageKey: string };

export interface PublicAccessState {
  tokenHash: string | null;
  disposition: PublicDisposition | null;
}

export class FileKernel {
  readonly #repository: FilesRepository;
  readonly #storage: FileKernelStorage;
  readonly #uploadExpiresInSeconds: number;
  readonly #clock: () => Date;

  constructor(options: CreateFileKernelOptions) {
    if (
      !Number.isSafeInteger(options.uploadExpiresInSeconds) ||
      options.uploadExpiresInSeconds <= 0
    ) {
      throw new Error('Files upload expiry must be a positive safe integer.');
    }
    this.#repository = options.repository;
    this.#storage = options.storage;
    this.#uploadExpiresInSeconds = options.uploadExpiresInSeconds;
    this.#clock = options.clock ?? (() => new Date());
  }

  async createPending(
    input: CreatePendingFileInput,
  ): Promise<PendingFileUpload> {
    const name = readFileName(input.name);
    const now = this.#now();
    const uploadExpiresAt = new Date(
      now.getTime() + this.#uploadExpiresInSeconds * 1_000,
    );
    const fileId = randomHex(32);
    const record = await this.#repository.createPending({
      id: fileId,
      name,
      uploadExpiresAt,
      now,
    });
    const candidateKey = `pending/${fileId}/${randomHex(24)}`;
    const readyKey = `ready/${fileId}/${randomHex(24)}`;

    return {
      fileId,
      file: toStoredFile(record),
      expiresAt: uploadExpiresAt.toISOString(),
      candidateKey,
      readyKey,
    };
  }

  async getFile(fileId: string): Promise<StoredFile | undefined> {
    const record = await this.#repository.get(readFileId(fileId));
    return record ? toStoredFile(record) : undefined;
  }

  async getFiles(fileIds: readonly string[]): Promise<StoredFile[]> {
    const records = await this.#repository.getMany(fileIds.map(readFileId));
    return records.map(toStoredFile);
  }

  async getRecord(fileId: string): Promise<FileRecord | undefined> {
    const record = await this.#repository.get(readFileId(fileId));
    return record ? cloneFileRecord(record) : undefined;
  }

  async completeUpload(input: CompleteFileInput): Promise<CompleteFileResult> {
    const fileId = readFileId(input.fileId);
    const candidateKey = normalizeStorageKey(input.candidateKey);
    const readyKey = normalizeStorageKey(input.readyKey);
    assertStorageKeyOwnership(fileId, candidateKey, 'pending');
    assertStorageKeyOwnership(fileId, readyKey, 'ready');
    const current = await this.#repository.get(fileId);

    if (!current) {
      return { outcome: 'missing', cleanupStorageKey: candidateKey };
    }
    if (current.status === 'ready') {
      return {
        outcome: 'ready',
        file: toStoredFile(current),
        cleanupStorageKey: candidateKey,
      };
    }
    if (current.status === 'failed') {
      return {
        outcome: 'failed',
        file: toStoredFile(current),
        cleanupStorageKey: candidateKey,
      };
    }

    const metadata = normalizeStorageMetadata(
      await this.#storage.head(candidateKey),
    );
    input.validateMetadata?.(metadata);
    await this.#storage.finalizeCandidate(candidateKey, readyKey);
    let completed: boolean;
    try {
      completed = await this.#repository.completePending({
        id: fileId,
        storageKey: readyKey,
        size: metadata.contentLength,
        contentType: metadata.contentType ?? null,
        now: this.#now(),
      });
    } catch (error) {
      return this.#resolvePersistenceFailure(
        fileId,
        readyKey,
        toError(error, 'Files completion persistence failed.'),
      );
    }
    if (completed) {
      return {
        outcome: 'completed',
        file: toStoredFile(await this.#repository.getRequired(fileId)),
      };
    }

    let winner: FileRecord | undefined;
    try {
      winner = await this.#repository.get(fileId);
    } catch (error) {
      return {
        outcome: 'persistence-failed',
        candidateStorageKey: readyKey,
        cleanupSafe: false,
        error: toError(error, 'Files completion winner lookup failed.'),
      };
    }
    if (!winner) {
      return { outcome: 'missing', cleanupStorageKey: readyKey };
    }
    if (winner.status === 'failed') {
      return {
        outcome: 'failed',
        file: toStoredFile(winner),
        cleanupStorageKey: readyKey,
      };
    }
    if (winner.status === 'ready') {
      return {
        outcome: 'ready',
        file: toStoredFile(winner),
        ...(winner.storageKey === readyKey
          ? {}
          : { cleanupStorageKey: readyKey }),
      };
    }
    throw new Error('Files completion CAS ended without a terminal state.');
  }

  async cancelUpload(
    fileId: string,
    candidateKey: string,
  ): Promise<CancelFileResult> {
    const normalizedFileId = readFileId(fileId);
    const normalizedCandidateKey = normalizeStorageKey(candidateKey);
    assertStorageKeyOwnership(
      normalizedFileId,
      normalizedCandidateKey,
      'pending',
    );
    const failed = await this.#repository.failPending(
      normalizedFileId,
      this.#now(),
    );
    const current = await this.#repository.get(normalizedFileId);
    if (!current) {
      return {
        outcome: 'missing',
        cleanupStorageKey: normalizedCandidateKey,
      };
    }
    if (failed || current.status === 'failed') {
      try {
        await this.#storage.delete(normalizedCandidateKey);
      } catch {
        // The result retains the exact candidate key for best-effort cleanup.
      }
      return {
        outcome: 'failed',
        file: toStoredFile(current),
        cleanupStorageKey: normalizedCandidateKey,
      };
    }
    if (current.status === 'ready') {
      return { outcome: 'ready', file: toStoredFile(current) };
    }
    throw new Error('Files cancellation CAS ended without a terminal state.');
  }

  async setPublicAccess(
    fileId: string,
    tokenHash: string,
    disposition: PublicDisposition,
  ): Promise<StoredFile> {
    const normalizedFileId = readFileId(fileId);
    const normalizedTokenHash = readTokenHash(tokenHash);
    const normalizedDisposition = readDisposition(disposition);
    const updated = await this.#repository.setPublicAccess({
      id: normalizedFileId,
      tokenHash: normalizedTokenHash,
      disposition: normalizedDisposition,
      now: this.#now(),
    });
    if (!updated) {
      throw new Error('Public access requires an existing ready file.');
    }
    return toStoredFile(await this.#repository.getRequired(normalizedFileId));
  }

  async enablePublicAccess(
    fileId: string,
    tokenHash: string,
    disposition: PublicDisposition,
  ): Promise<StoredFile> {
    const normalizedFileId = readFileId(fileId);
    const updated = await this.#repository.enablePublicAccess({
      id: normalizedFileId,
      tokenHash: readTokenHash(tokenHash),
      disposition: readDisposition(disposition),
      now: this.#now(),
    });
    if (updated) {
      return toStoredFile(await this.#repository.getRequired(normalizedFileId));
    }

    const current = await this.#repository.get(normalizedFileId);
    if (!current || current.status !== 'ready') {
      throw new Error('Public access requires an existing ready file.');
    }
    throw new Error('Public access is already enabled.');
  }

  async resetPublicAccess(
    fileId: string,
    tokenHash: string,
    disposition: PublicDisposition,
  ): Promise<StoredFile> {
    const normalizedFileId = readFileId(fileId);
    const updated = await this.#repository.resetPublicAccess({
      id: normalizedFileId,
      tokenHash: readTokenHash(tokenHash),
      disposition: readDisposition(disposition),
      now: this.#now(),
    });
    if (updated) {
      return toStoredFile(await this.#repository.getRequired(normalizedFileId));
    }

    const current = await this.#repository.get(normalizedFileId);
    if (!current || current.status !== 'ready') {
      throw new Error('Public access requires an existing ready file.');
    }
    throw new Error('Public access is not enabled.');
  }

  async disablePublicAccess(fileId: string): Promise<StoredFile> {
    const normalizedFileId = readFileId(fileId);
    const current = await this.#repository.get(normalizedFileId);
    if (!current || current.status !== 'ready') {
      throw new Error('Public access requires an existing ready file.');
    }
    if (current.publicTokenHash === null) {
      return toStoredFile(current);
    }

    await this.#repository.clearPublicAccess(normalizedFileId, this.#now());
    return toStoredFile(await this.#repository.getRequired(normalizedFileId));
  }

  async clearPublicAccess(fileId: string): Promise<StoredFile> {
    const normalizedFileId = readFileId(fileId);
    const updated = await this.#repository.clearPublicAccess(
      normalizedFileId,
      this.#now(),
    );
    if (!updated) {
      throw new Error('Public access requires an existing ready file.');
    }
    return toStoredFile(await this.#repository.getRequired(normalizedFileId));
  }

  async getPublicAccessState(fileId: string): Promise<PublicAccessState> {
    const record = await this.#repository.getRequired(readFileId(fileId));
    return {
      tokenHash: record.publicTokenHash,
      disposition: record.publicDisposition,
    };
  }

  async findExpiredPending(limit = 100): Promise<StoredFile[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Files expiry query limit must be a positive integer.');
    }
    const records = await this.#repository.findExpiredPending(
      this.#now(),
      limit,
    );
    return records.map(toStoredFile);
  }

  async deleteStorageObject(storageKey: string): Promise<void> {
    await this.#storage.delete(normalizeStorageKey(storageKey));
  }

  async purgeFile(fileId: string): Promise<boolean> {
    const normalizedFileId = readFileId(fileId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = await this.#repository.get(normalizedFileId);
      if (!record) {
        return false;
      }
      if (!(await this.#repository.deleteExact(record))) {
        continue;
      }
      if (record.storageKey !== null) {
        await this.#storage.delete(record.storageKey);
      }
      return true;
    }
    throw new Error('Files purge could not acquire a stable record state.');
  }

  async #resolvePersistenceFailure(
    fileId: string,
    readyKey: string,
    error: Error,
  ): Promise<CompleteFileResult> {
    try {
      const current = await this.#repository.get(fileId);
      if (current?.status === 'ready' && current.storageKey === readyKey) {
        return { outcome: 'ready', file: toStoredFile(current) };
      }
      return {
        outcome: 'persistence-failed',
        candidateStorageKey: readyKey,
        cleanupStorageKey: readyKey,
        cleanupSafe: true,
        error,
      };
    } catch {
      return {
        outcome: 'persistence-failed',
        candidateStorageKey: readyKey,
        cleanupSafe: false,
        error,
      };
    }
  }

  #now(): Date {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error('Files clock returned an invalid date.');
    }
    return new Date(value.getTime());
  }
}

export function createFileKernel(options: CreateFileKernelOptions): FileKernel {
  return new FileKernel(options);
}

function normalizeStorageMetadata(
  metadata: StorageObjectMetadata,
): StorageObjectMetadata {
  if (
    !Number.isSafeInteger(metadata.contentLength) ||
    metadata.contentLength < 0
  ) {
    throw new Error('Files storage returned an invalid content length.');
  }
  if (
    metadata.contentType !== undefined &&
    (!metadata.contentType.trim() || metadata.contentType.length > 255)
  ) {
    throw new Error('Files storage returned an invalid content type.');
  }
  return {
    ...metadata,
    ...(metadata.contentType === undefined
      ? {}
      : { contentType: metadata.contentType.trim() }),
  };
}

function readFileName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 255) {
    throw new Error('Files name must contain 1 to 255 characters.');
  }
  return name;
}

function readFileId(value: string): string {
  const fileId = value.trim();
  if (!fileId || fileId.length > 64) {
    throw new Error('Files fileId must contain 1 to 64 characters.');
  }
  return fileId;
}

function readTokenHash(value: string): string {
  const tokenHash = value.trim();
  if (!tokenHash || tokenHash.length > 512) {
    throw new Error('Files public token hash is invalid.');
  }
  return tokenHash;
}

function readDisposition(value: PublicDisposition): PublicDisposition {
  if (value !== 'inline' && value !== 'attachment') {
    throw new Error('Files public disposition is invalid.');
  }
  return value;
}

function assertStorageKeyOwnership(
  fileId: string,
  storageKey: string,
  area: 'pending' | 'ready',
): void {
  if (!storageKey.startsWith(`${area}/${fileId}/`)) {
    throw new Error(`Files ${area} storage key does not belong to fileId.`);
  }
}

function randomHex(byteLength: number): string {
  return randomBytes(byteLength).toString('hex');
}

function toError(value: unknown, message: string): Error {
  return value instanceof Error ? value : new Error(message, { cause: value });
}

function cloneFileRecord(record: FileRecord): FileRecord {
  return {
    ...record,
    uploadExpiresAt: new Date(record.uploadExpiresAt.getTime()),
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

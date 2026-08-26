import { randomBytes } from 'node:crypto';

import type { DatabaseConnection } from '@nocobase/app-database';

import type { StoredFile } from '../../protocol.js';
import { normalizeStorageKey } from './storage/index.js';
import type { StorageObjectMetadata } from './storage/types.js';
import { normalizeOptionalContentType } from './upload-policy.js';
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
}

export interface CompleteFileInput<TBinding = undefined> {
  fileId: string;
  candidateKey: string;
  validateMetadata?: (metadata: StorageObjectMetadata) => void;
  commitBinding?(
    connection: DatabaseConnection,
    file: StoredFile,
  ): Promise<TBinding>;
}

export type CompleteFileResult<TBinding = undefined> =
  | {
      outcome: 'completed' | 'ready';
      file: StoredFile;
      binding?: TBinding;
      cleanupStorageKeys: readonly string[];
    }
  | {
      outcome: 'failed';
      file: StoredFile;
      cleanupStorageKeys: readonly string[];
    }
  | { outcome: 'missing'; cleanupStorageKeys: readonly string[] }
  | {
      outcome: 'persistence-failed';
      cleanupStorageKeys: readonly string[];
      error: Error;
    };

export interface CancelFileBindingInput {
  connection: DatabaseConnection;
  file: StoredFile | undefined;
}

export type CancelFileResult<TBinding = undefined> =
  | { outcome: 'failed'; file: StoredFile; binding?: TBinding }
  | { outcome: 'ready'; file: StoredFile }
  | { outcome: 'missing'; binding?: TBinding };

export interface PublicAccessState {
  tokenHash: string | null;
  disposition: PublicDisposition | null;
}

export type PublicAccessKernelErrorReason =
  'file-not-ready' | 'already-enabled' | 'not-enabled';

export class PublicAccessKernelError extends Error {
  constructor(readonly reason: PublicAccessKernelErrorReason) {
    super(
      reason === 'file-not-ready'
        ? 'Public access requires an existing ready file.'
        : reason === 'already-enabled'
          ? 'Public access is already enabled.'
          : 'Public access is not enabled.',
    );
    this.name = new.target.name;
  }
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
    const candidateKey = pendingStorageKey(fileId);

    return {
      fileId,
      file: toStoredFile(record),
      expiresAt: uploadExpiresAt.toISOString(),
      candidateKey,
    };
  }

  async getFile(
    fileId: string,
    connection?: DatabaseConnection,
  ): Promise<StoredFile | undefined> {
    const record = await this.#repository.get(readFileId(fileId), connection);
    return record ? toStoredFile(record) : undefined;
  }

  async getFiles(
    fileIds: readonly string[],
    connection?: DatabaseConnection,
  ): Promise<Array<StoredFile | null>> {
    const records = await this.#repository.getMany(
      fileIds.map(readFileId),
      connection,
    );
    return records.map((record) => (record ? toStoredFile(record) : null));
  }

  async getRecord(
    fileId: string,
    connection?: DatabaseConnection,
  ): Promise<FileRecord | undefined> {
    const record = await this.#repository.get(readFileId(fileId), connection);
    return record ? cloneFileRecord(record) : undefined;
  }

  async completeUpload<TBinding = undefined>(
    input: CompleteFileInput<TBinding>,
  ): Promise<CompleteFileResult<TBinding>> {
    const fileId = readFileId(input.fileId);
    const candidateKey = normalizeStorageKey(input.candidateKey);
    assertStorageKeyOwnership(fileId, candidateKey, 'pending');
    const commitBinding = input.commitBinding?.bind(input);
    const current = await this.#repository.get(fileId);

    if (!current) {
      return { outcome: 'missing', cleanupStorageKeys: [candidateKey] };
    }
    if (current.status === 'ready') {
      const file = toStoredFile(current);
      let binding: TBinding | undefined;
      try {
        binding = commitBinding
          ? await this.#repository.transaction((connection) =>
              commitBinding(connection, file),
            )
          : undefined;
      } catch (error) {
        return {
          outcome: 'persistence-failed',
          cleanupStorageKeys: [candidateKey],
          error: toError(error, 'Files binding persistence failed.'),
        };
      }
      return {
        outcome: 'ready',
        file,
        ...(binding === undefined ? {} : { binding }),
        cleanupStorageKeys: [candidateKey],
      };
    }
    if (current.status === 'failed') {
      return {
        outcome: 'failed',
        file: toStoredFile(current),
        cleanupStorageKeys: [candidateKey],
      };
    }

    const readyKey = readyStorageKey(fileId);
    let metadata: StorageObjectMetadata;
    try {
      const candidateMetadata = normalizeStorageMetadata(
        await this.#storage.head(candidateKey),
      );
      input.validateMetadata?.(candidateMetadata);
      await this.#storage.finalizeCandidate(candidateKey, readyKey);
      metadata = normalizeStorageMetadata(await this.#storage.head(readyKey));
      input.validateMetadata?.(metadata);
    } catch (error) {
      try {
        await this.#storage.delete(readyKey);
      } catch {
        // Preserve the upload validation or storage failure.
      }
      const concurrent = await this.#resolveConcurrentTerminalState(
        fileId,
        readyKey,
        commitBinding,
      );
      if (concurrent) {
        return concurrent;
      }
      throw error;
    }
    try {
      return await this.#repository.transaction(
        async (connection): Promise<CompleteFileResult<TBinding>> => {
          const transactionCurrent = await this.#repository.get(
            fileId,
            connection,
          );
          if (!transactionCurrent) {
            return { outcome: 'missing', cleanupStorageKeys: [readyKey] };
          }
          if (transactionCurrent.status === 'failed') {
            return {
              outcome: 'failed',
              file: toStoredFile(transactionCurrent),
              cleanupStorageKeys: [readyKey],
            };
          }

          let outcome: 'completed' | 'ready' = 'ready';
          let readyRecord = transactionCurrent;
          if (transactionCurrent.status === 'pending') {
            const completed = await this.#repository.completePending(
              {
                id: fileId,
                storageKey: readyKey,
                size: metadata.contentLength,
                contentType: metadata.contentType ?? null,
                now: this.#now(),
              },
              connection,
            );
            readyRecord = await this.#repository.getRequired(
              fileId,
              connection,
            );
            if (completed) {
              outcome = 'completed';
            }
          }
          if (readyRecord.status === 'pending') {
            throw new Error(
              'Files completion CAS ended without a terminal state.',
            );
          }
          if (readyRecord.status === 'failed') {
            return {
              outcome: 'failed',
              file: toStoredFile(readyRecord),
              cleanupStorageKeys: [readyKey],
            };
          }

          const file = toStoredFile(readyRecord);
          const binding: TBinding | undefined = commitBinding
            ? await commitBinding(connection, file)
            : undefined;
          return {
            outcome,
            file,
            ...(binding === undefined ? {} : { binding }),
            cleanupStorageKeys:
              outcome === 'completed' ? [candidateKey] : [readyKey],
          };
        },
      );
    } catch (error) {
      return this.#resolvePersistenceFailure(
        fileId,
        candidateKey,
        readyKey,
        toError(error, 'Files completion persistence failed.'),
        commitBinding,
      );
    }
  }

  async cancelUpload<TBinding = undefined>(
    fileId: string,
    cancelBinding?: (input: CancelFileBindingInput) => Promise<TBinding>,
  ): Promise<CancelFileResult<TBinding>> {
    const normalizedFileId = readFileId(fileId);
    const candidateKey = pendingStorageKey(normalizedFileId);
    const result = await this.#repository.transaction(
      async (connection): Promise<CancelFileResult<TBinding>> => {
        const failed = await this.#repository.failPending(
          normalizedFileId,
          this.#now(),
          connection,
        );
        const current = await this.#repository.get(
          normalizedFileId,
          connection,
        );
        if (!current) {
          const binding = cancelBinding
            ? await cancelBinding({ connection, file: undefined })
            : undefined;
          return {
            outcome: 'missing',
            ...(binding === undefined ? {} : { binding }),
          };
        }
        if (failed || current.status === 'failed') {
          const file = toStoredFile(current);
          const binding = cancelBinding
            ? await cancelBinding({ connection, file })
            : undefined;
          return {
            outcome: 'failed',
            file,
            ...(binding === undefined ? {} : { binding }),
          };
        }
        if (current.status === 'ready') {
          return { outcome: 'ready', file: toStoredFile(current) };
        }
        throw new Error(
          'Files cancellation CAS ended without a terminal state.',
        );
      },
    );
    await Promise.all(
      [candidateKey].map(async (key) => {
        try {
          await this.#storage.delete(key);
        } catch {
          // Cleanup is best-effort; failed state and reservation release are durable.
        }
      }),
    );
    return result;
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
      throw new PublicAccessKernelError('file-not-ready');
    }
    throw new PublicAccessKernelError('already-enabled');
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
      throw new PublicAccessKernelError('file-not-ready');
    }
    throw new PublicAccessKernelError('not-enabled');
  }

  async disablePublicAccess(fileId: string): Promise<StoredFile> {
    const normalizedFileId = readFileId(fileId);
    const current = await this.#repository.get(normalizedFileId);
    if (!current || current.status !== 'ready') {
      throw new PublicAccessKernelError('file-not-ready');
    }
    if (current.publicTokenHash === null) {
      return toStoredFile(current);
    }

    await this.#repository.clearPublicAccess(normalizedFileId, this.#now());
    return toStoredFile(await this.#repository.getRequired(normalizedFileId));
  }

  async getPublicAccessState(fileId: string): Promise<PublicAccessState> {
    const record = await this.#repository.getRequired(readFileId(fileId));
    return {
      tokenHash: record.publicTokenHash,
      disposition: record.publicDisposition,
    };
  }

  async #resolvePersistenceFailure<TBinding>(
    fileId: string,
    candidateKey: string,
    readyKey: string,
    error: Error,
    commitBinding:
      | ((
          connection: DatabaseConnection,
          file: StoredFile,
        ) => Promise<TBinding>)
      | undefined,
  ): Promise<CompleteFileResult<TBinding>> {
    try {
      const current = await this.#repository.get(fileId);
      if (current?.status === 'ready') {
        if (current.storageKey !== readyKey) {
          return (
            (await this.#resolveConcurrentTerminalState(
              fileId,
              readyKey,
              commitBinding,
            )) ?? {
              outcome: 'persistence-failed',
              cleanupStorageKeys: [readyKey],
              error,
            }
          );
        }
        return {
          outcome: 'ready',
          file: toStoredFile(current),
          cleanupStorageKeys: [candidateKey],
        };
      }
      if (current?.status === 'pending') {
        return {
          outcome: 'persistence-failed',
          cleanupStorageKeys: [readyKey],
          error,
        };
      }
      return {
        outcome: 'persistence-failed',
        cleanupStorageKeys: [candidateKey, readyKey],
        error,
      };
    } catch {
      return {
        outcome: 'persistence-failed',
        cleanupStorageKeys: [],
        error,
      };
    }
  }

  async #resolveConcurrentTerminalState<TBinding>(
    fileId: string,
    readyKey: string,
    commitBinding:
      | ((
          connection: DatabaseConnection,
          file: StoredFile,
        ) => Promise<TBinding>)
      | undefined,
  ): Promise<CompleteFileResult<TBinding> | undefined> {
    const current = await this.#repository.get(fileId);
    if (!current) {
      return { outcome: 'missing', cleanupStorageKeys: [readyKey] };
    }
    if (current.status === 'failed') {
      return {
        outcome: 'failed',
        file: toStoredFile(current),
        cleanupStorageKeys: [readyKey],
      };
    }
    if (current.status !== 'ready') {
      return undefined;
    }
    const file = toStoredFile(current);
    const cleanupStorageKeys =
      current.storageKey === readyKey ? [] : [readyKey];
    try {
      const binding = commitBinding
        ? await this.#repository.transaction((connection) =>
            commitBinding(connection, file),
          )
        : undefined;
      return {
        outcome: 'ready',
        file,
        ...(binding === undefined ? {} : { binding }),
        cleanupStorageKeys,
      };
    } catch (error) {
      return {
        outcome: 'persistence-failed',
        cleanupStorageKeys,
        error: toError(error, 'Files binding persistence failed.'),
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
  const contentType = normalizeOptionalContentType(metadata.contentType);
  const normalized = { ...metadata };
  delete normalized.contentType;
  return contentType === null ? normalized : { ...normalized, contentType };
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

function pendingStorageKey(fileId: string): string {
  return `pending/${fileId}/candidate`;
}

function readyStorageKey(fileId: string): string {
  return `ready/${fileId}/${randomHex(32)}`;
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

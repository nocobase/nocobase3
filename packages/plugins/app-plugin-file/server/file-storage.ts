import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { NocoBaseDriveDisk, NocoBaseDriveManager } from '@nocobase/drive';

import {
  FileObjectNotFoundError,
  FileUnavailableError,
  InvalidFileInputError,
} from './errors.js';
import { fileNameExtension, normalizeFileName } from './filename.js';
import type { FileRecord } from './types.js';

export type FileContentSource =
  | Blob
  | Uint8Array
  | string
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;

export interface FileStorageOptions {
  readonly drive?: NocoBaseDriveManager;
  readonly defaultDisk: string;
}

export interface PutFileObjectInput {
  readonly filename: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly content: FileContentSource;
  readonly disk?: string;
}

export interface StoredFileObject {
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface EnsureFileObjectInput {
  readonly disk?: string;
  readonly key: string;
  readonly mimeType: string;
  readonly content: FileContentSource;
  readonly size?: number;
}

export async function putFileObject(
  options: FileStorageOptions,
  input: PutFileObjectInput,
): Promise<StoredFileObject> {
  const diskName = resolveDiskName(input.disk, options.defaultDisk);
  const disk = resolveDisk(options.drive, diskName);
  const filename = normalizeFileName(input.filename);
  const key = `files/${randomUUID()}${fileNameExtension(filename)}`;
  const mimeType = resolveMimeType(input.content, input.mimeType);
  const size = resolveContentSize(input.content, input.size);

  await writeFileObject(disk, key, input.content, mimeType, size);
  return { disk: diskName, key, filename, mimeType, size };
}

export async function openFileObject(
  drive: NocoBaseDriveManager | undefined,
  record: FileRecord,
): Promise<ReadableStream<Uint8Array>> {
  const disk = resolveDisk(drive, record.disk);
  let exists: boolean;
  try {
    exists = await disk.exists(record.key);
  } catch (cause) {
    throw new FileUnavailableError('File storage could not be read.', {
      cause,
    });
  }
  if (!exists) throw new FileObjectNotFoundError();

  try {
    const stream = await disk.getStream(record.key);
    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  } catch (cause) {
    throw new FileUnavailableError('File storage could not be read.', {
      cause,
    });
  }
}

export async function removeFileObject(
  drive: NocoBaseDriveManager | undefined,
  record: Pick<FileRecord, 'disk' | 'key'>,
): Promise<void> {
  const disk = resolveDisk(drive, record.disk);
  try {
    await disk.delete(record.key);
  } catch (cause) {
    throw new FileUnavailableError('File storage could not be updated.', {
      cause,
    });
  }
}

export async function ensureFileObject(
  options: FileStorageOptions,
  input: EnsureFileObjectInput,
): Promise<void> {
  const diskName = resolveDiskName(input.disk, options.defaultDisk);
  const disk = resolveDisk(options.drive, diskName);
  let exists: boolean;
  try {
    exists = await disk.exists(input.key);
  } catch (cause) {
    throw new FileUnavailableError('File storage could not be read.', {
      cause,
    });
  }
  if (exists) return;

  const size = resolveContentSize(input.content, input.size);
  await writeFileObject(disk, input.key, input.content, input.mimeType, size);
}

function resolveDiskName(disk: string | undefined, fallback: string): string {
  const resolved = disk?.trim() || fallback.trim();
  if (!resolved) {
    throw new FileUnavailableError('A file storage disk is not configured.');
  }
  return resolved;
}

function resolveDisk(
  drive: NocoBaseDriveManager | undefined,
  diskName: string,
): NocoBaseDriveDisk {
  if (!drive) throw new FileUnavailableError('File storage is not configured.');
  try {
    return drive.use(diskName);
  } catch (cause) {
    throw new FileUnavailableError(
      `File storage disk "${diskName}" is unavailable.`,
      { cause },
    );
  }
}

function resolveContentSize(
  content: FileContentSource,
  providedSize: number | undefined,
): number {
  if (
    providedSize !== undefined &&
    (!Number.isSafeInteger(providedSize) || providedSize < 0)
  ) {
    throw new InvalidFileInputError(
      'File size must be a non-negative safe integer.',
    );
  }

  let knownSize: number | undefined;
  if (isBlobContent(content)) knownSize = content.size;
  else if (content instanceof Uint8Array) knownSize = content.byteLength;
  else if (typeof content === 'string') knownSize = Buffer.byteLength(content);

  if (knownSize !== undefined) return knownSize;
  if (providedSize !== undefined) return providedSize;
  throw new InvalidFileInputError(
    'File size is required for streamed content.',
  );
}

function resolveMimeType(
  content: FileContentSource,
  providedMimeType: string | undefined,
): string {
  const blobMimeType = isBlobContent(content) ? content.type.trim() : '';
  return providedMimeType?.trim() || blobMimeType || 'application/octet-stream';
}

async function writeFileObject(
  disk: NocoBaseDriveDisk,
  key: string,
  content: FileContentSource,
  mimeType: string,
  size: number,
): Promise<void> {
  const writeOptions = {
    contentType: mimeType || undefined,
    contentLength: size,
  };

  try {
    if (typeof content === 'string' || content instanceof Uint8Array) {
      await disk.put(key, content, writeOptions);
      return;
    }
    if (isBlobContent(content)) {
      const stream = getBlobStream(content);
      if (stream) {
        await disk.putStream(key, toNodeReadable(stream), writeOptions);
        return;
      }
      await disk.put(
        key,
        new Uint8Array(await content.arrayBuffer()),
        writeOptions,
      );
      return;
    }
    if (isReadableStream(content)) {
      await disk.putStream(key, toNodeReadable(content), writeOptions);
      return;
    }
    if (isAsyncIterable(content)) {
      await disk.putStream(key, Readable.from(content), writeOptions);
      return;
    }
  } catch (cause) {
    throw new FileUnavailableError('File storage could not be updated.', {
      cause,
    });
  }

  throw new InvalidFileInputError('Unsupported file content input.');
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof Reflect.get(value, 'getReader') === 'function',
  );
}

function isBlobContent(value: unknown): value is Blob {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof Reflect.get(value, 'size') === 'number' &&
    typeof Reflect.get(value, 'arrayBuffer') === 'function',
  );
}

function getBlobStream(content: Blob): ReadableStream<Uint8Array> | undefined {
  const stream = Reflect.get(content, 'stream');
  if (typeof stream !== 'function') return undefined;
  const value = Reflect.apply(stream, content, []);
  return isReadableStream(value) ? value : undefined;
}

function toNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.from(readWebStream(stream));
}

async function* readWebStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof Reflect.get(value, Symbol.asyncIterator) === 'function',
  );
}

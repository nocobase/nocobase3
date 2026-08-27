import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { NocoBaseDriveDisk } from '@nocobase/drive';

import { createDatabaseFileStore } from './database-file-store.js';
import {
  FileObjectNotFoundError,
  FilesUnavailableError,
  InvalidFileInputError,
} from './errors.js';
import { normalizeFileName } from './filename.js';
import { issueFileToken, verifyFileToken } from './token.js';
import type {
  CreateFilesServiceOptions,
  DatabaseFileStoreOptions,
  EnsureFileObjectInput,
  FileAccessUrl,
  FileRecord,
  FilesService,
  FileStore,
  IssueFileAccessInput,
  PutFileInput,
  StoredFileObject,
  VerifyFileAccessInput,
} from './types.js';

export function createFilesService(
  options: CreateFilesServiceOptions,
): FilesService {
  return {
    createDatabaseStore(storeOptions: DatabaseFileStoreOptions): FileStore {
      if (!options.database) {
        throw new FilesUnavailableError(
          'File database storage is not configured.',
        );
      }
      return createDatabaseFileStore(options.database, storeOptions);
    },
    async put(input: PutFileInput): Promise<StoredFileObject> {
      const diskName = resolveDiskName(input.disk, options.defaultDisk);
      const disk = resolveDisk(options, diskName);
      const filename = normalizeFileName(input.filename);
      const key = `files/${randomUUID()}-${filename}`;
      const mimeType = resolveMimeType(input.content, input.mimeType);
      const size = resolveContentSize(input.content, input.size);

      await writeObject(disk, key, input.content, mimeType, size);

      return {
        disk: diskName,
        key,
        filename,
        mimeType,
        size,
      };
    },
    async open(record: FileRecord): Promise<ReadableStream<Uint8Array>> {
      const disk = resolveDisk(options, record.disk);
      let exists: boolean;
      try {
        exists = await disk.exists(record.key);
      } catch (cause) {
        throw new FilesUnavailableError('File storage could not be read.', {
          cause,
        });
      }
      if (!exists) {
        throw new FileObjectNotFoundError();
      }

      try {
        const stream = await disk.getStream(record.key);
        return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
      } catch (cause) {
        throw new FilesUnavailableError('File storage could not be read.', {
          cause,
        });
      }
    },
    async removeObject(record: FileRecord): Promise<void> {
      const disk = resolveDisk(options, record.disk);
      try {
        await disk.delete(record.key);
      } catch (cause) {
        throw new FilesUnavailableError('File storage could not be updated.', {
          cause,
        });
      }
    },
    async issueAccessUrl(input: IssueFileAccessInput): Promise<FileAccessUrl> {
      const secret = resolveTokenSecret(options.tokenSecret);
      const issued = issueFileToken({
        secret,
        audience: input.audience,
        fileId: input.fileId,
        expiresIn: input.expiresIn,
      });
      const pathname = resolvePublicPath(
        input.contentPath,
        options.publicBasePath,
      );
      const url = new URL(pathname, 'http://files.local');
      url.searchParams.set('token', issued.token);

      return {
        url: `${url.pathname}${url.search}`,
        expiresAt: new Date(issued.expiresAt * 1000).toISOString(),
      };
    },
    async verifyAccessToken(input: VerifyFileAccessInput): Promise<void> {
      verifyFileToken({
        secret: resolveTokenSecret(options.tokenSecret),
        audience: input.audience,
        fileId: input.fileId,
        token: input.token,
        now: input.now,
      });
    },
    async ensureObject(input: EnsureFileObjectInput): Promise<void> {
      const diskName = resolveDiskName(input.disk, options.defaultDisk);
      const disk = resolveDisk(options, diskName);
      let exists: boolean;
      try {
        exists = await disk.exists(input.key);
      } catch (cause) {
        throw new FilesUnavailableError('File storage could not be read.', {
          cause,
        });
      }
      if (exists) {
        return;
      }

      const size = resolveContentSize(input.content, input.size);
      await writeObject(disk, input.key, input.content, input.mimeType, size);
    },
  };
}

function resolveDiskName(disk: string | undefined, fallback: string): string {
  const resolved = disk?.trim() || fallback.trim();
  if (!resolved) {
    throw new FilesUnavailableError('A file storage disk is not configured.');
  }
  return resolved;
}

function resolveDisk(
  options: CreateFilesServiceOptions,
  diskName: string,
): NocoBaseDriveDisk {
  if (!options.drive) {
    throw new FilesUnavailableError('File storage is not configured.');
  }

  try {
    return options.drive.use(diskName);
  } catch (cause) {
    throw new FilesUnavailableError(
      `File storage disk "${diskName}" is unavailable.`,
      { cause },
    );
  }
}

function resolveContentSize(
  content: PutFileInput['content'],
  providedSize: number | undefined,
): number {
  if (providedSize !== undefined) {
    if (!Number.isSafeInteger(providedSize) || providedSize < 0) {
      throw new InvalidFileInputError(
        'File size must be a non-negative safe integer.',
      );
    }
  }

  let knownSize: number | undefined;
  if (isBlobContent(content)) {
    knownSize = content.size;
  } else if (content instanceof Uint8Array) {
    knownSize = content.byteLength;
  } else if (typeof content === 'string') {
    knownSize = Buffer.byteLength(content);
  }

  if (knownSize !== undefined) {
    return knownSize;
  }
  if (providedSize !== undefined) {
    return providedSize;
  }
  throw new InvalidFileInputError(
    'File size is required for streamed content.',
  );
}

function resolveMimeType(
  content: PutFileInput['content'],
  providedMimeType: string | undefined,
): string {
  const blobMimeType = isBlobContent(content) ? content.type.trim() : '';
  return providedMimeType?.trim() || blobMimeType || 'application/octet-stream';
}

async function writeObject(
  disk: NocoBaseDriveDisk,
  key: string,
  content: PutFileInput['content'],
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
    throw new FilesUnavailableError('File storage could not be updated.', {
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
  if (typeof stream !== 'function') {
    return undefined;
  }
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
      if (result.done) {
        return;
      }
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

function resolveTokenSecret(secret: string | undefined): string {
  if (!secret) {
    throw new FilesUnavailableError(
      'File access token signing is not configured.',
    );
  }
  return secret;
}

function resolvePublicPath(
  contentPath: string,
  publicBasePath: string,
): string {
  if (!contentPath.trim().startsWith('/')) {
    throw new InvalidFileInputError('File content path must be root-relative.');
  }

  let url: URL;
  try {
    url = new URL(contentPath, 'http://files.local');
  } catch {
    throw new InvalidFileInputError('File content path is invalid.');
  }
  if (
    url.origin !== 'http://files.local' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new InvalidFileInputError(
      'File content path must be a root-relative path without a query or fragment.',
    );
  }

  const basePath = normalizePath(publicBasePath);
  const pathname = normalizePath(url.pathname);
  if (!basePath) {
    return pathname || '/';
  }
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    return pathname;
  }
  return pathname ? `${basePath}${pathname}` : `${basePath}/`;
}

function normalizePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}

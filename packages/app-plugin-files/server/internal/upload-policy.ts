import path from 'node:path';
import { Readable, Transform, type TransformCallback } from 'node:stream';

import type { StorageObjectMetadata } from './storage/types.js';
import type { CreateFileInput, FileConstraints } from '../types.js';
import { FilesDataPlaneError } from './errors.js';

export interface UploadPolicy {
  maxBytes: number;
  expectedSize: number;
  contentType: string | null;
  allowedExtensions: readonly string[];
  allowedContentTypes: readonly string[];
}

export interface StreamUploadPolicy {
  maxBytes: number;
  expectedSize: number | undefined;
  contentType: string | null;
  allowedExtensions: readonly string[];
  allowedContentTypes: readonly string[];
}

export interface UploadDeclaration {
  name: string;
  size: number;
  contentType?: string;
  constraints?: FileConstraints;
}

export function normalizeUploadPolicy(
  input: UploadDeclaration,
  configuredMaxBytes: number,
): UploadPolicy {
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    throw uploadFailed('The declared file size is invalid.');
  }
  const maxBytes = resolveMaxBytes(
    input.constraints?.maxBytes,
    configuredMaxBytes,
  );
  if (input.size > maxBytes) {
    throw uploadSizeExceeded();
  }
  return {
    maxBytes,
    expectedSize: input.size,
    contentType: normalizeOptionalContentType(input.contentType),
    allowedExtensions: normalizeExtensions(
      input.constraints?.allowedExtensions ?? [],
    ),
    allowedContentTypes: normalizeContentTypes(
      input.constraints?.allowedContentTypes ?? [],
    ),
  };
}

export function normalizeStreamUploadPolicy(
  input: CreateFileInput,
  configuredMaxBytes: number,
): StreamUploadPolicy {
  if (
    input.size !== undefined &&
    (!Number.isSafeInteger(input.size) || input.size < 0)
  ) {
    throw uploadFailed('The declared file size is invalid.');
  }
  return {
    maxBytes: resolveMaxBytes(input.constraints?.maxBytes, configuredMaxBytes),
    expectedSize: input.size,
    contentType: normalizeOptionalContentType(input.contentType),
    allowedExtensions: normalizeExtensions(
      input.constraints?.allowedExtensions ?? [],
    ),
    allowedContentTypes: normalizeContentTypes(
      input.constraints?.allowedContentTypes ?? [],
    ),
  };
}

export function assertStreamUploadPolicy(
  name: string,
  policy: StreamUploadPolicy,
): void {
  if (
    policy.expectedSize !== undefined &&
    policy.expectedSize > policy.maxBytes
  ) {
    throw uploadSizeExceeded();
  }
  assertUploadType(name, policy);
}

export function assertUploadPolicy(name: string, policy: UploadPolicy): void {
  if (policy.expectedSize > policy.maxBytes) {
    throw uploadSizeExceeded();
  }
  assertUploadType(name, policy);
}

export function validateStreamStorageMetadata(
  metadata: StorageObjectMetadata,
  policy: StreamUploadPolicy,
): void {
  if (metadata.contentLength > policy.maxBytes) {
    throw uploadSizeExceeded();
  }
  if (
    policy.expectedSize !== undefined &&
    metadata.contentLength !== policy.expectedSize
  ) {
    throw uploadFailed('The streamed byte count does not match size.');
  }
  validateContentType(
    normalizeOptionalContentType(metadata.contentType),
    policy,
  );
}

export function validateContentType(
  contentType: string | null,
  policy: Pick<UploadPolicy, 'contentType' | 'allowedContentTypes'>,
): void {
  if (contentType !== policy.contentType) {
    throw uploadTypeNotAllowed();
  }
  if (
    policy.allowedContentTypes.length > 0 &&
    (contentType === null || !policy.allowedContentTypes.includes(contentType))
  ) {
    throw uploadTypeNotAllowed();
  }
}

export function validateContentLength(
  value: string | undefined,
  policy: UploadPolicy,
): void {
  if (value === undefined) {
    return;
  }
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw uploadFailed('The Content-Length header is invalid.');
  }
  if (contentLength > policy.maxBytes) {
    throw uploadSizeExceeded();
  }
  if (contentLength !== policy.expectedSize) {
    throw uploadFailed('The Content-Length header does not match the plan.');
  }
}

export function validateStorageMetadata(
  metadata: StorageObjectMetadata,
  policy: UploadPolicy,
): void {
  if (metadata.contentLength > policy.maxBytes) {
    throw uploadSizeExceeded();
  }
  if (metadata.contentLength !== policy.expectedSize) {
    throw uploadFailed('The uploaded byte count does not match the plan.');
  }
  validateContentType(
    normalizeOptionalContentType(metadata.contentType),
    policy,
  );
}

export function normalizeOptionalContentType(
  value: string | undefined,
): string | null {
  if (value === undefined || !value.trim()) {
    return null;
  }
  const normalized = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (
    !normalized ||
    normalized.length > 255 ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)
  ) {
    throw uploadTypeNotAllowed();
  }
  return normalized;
}

export function normalizeFileName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 255) {
    throw uploadFailed('The file name is invalid.');
  }
  return name;
}

export function toNodeReadable(source: CreateFileInput['content']): Readable {
  try {
    if (isWebReadableStream(source)) {
      return Readable.fromWeb(
        source as import('node:stream/web').ReadableStream<Uint8Array>,
      );
    }
    if (
      source &&
      typeof source === 'object' &&
      Symbol.asyncIterator in source &&
      typeof source[Symbol.asyncIterator] === 'function'
    ) {
      return Readable.from(source);
    }
  } catch {
    throw uploadFailed('The file content source is invalid.');
  }
  throw uploadFailed('The file content source is invalid.');
}

export class ByteLimitTransform extends Transform {
  readonly #maxBytes: number;
  bytesRead = 0;

  constructor(maxBytes: number) {
    super();
    this.#maxBytes = maxBytes;
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const chunkBytes =
      typeof chunk === 'string'
        ? Buffer.byteLength(chunk, encoding)
        : chunk.byteLength;
    this.bytesRead += chunkBytes;
    if (this.bytesRead > this.#maxBytes) {
      callback(uploadSizeExceeded());
      return;
    }
    callback(null, chunk);
  }
}

function resolveMaxBytes(
  requestedMax: number | undefined,
  configuredMaxBytes: number,
): number {
  if (
    requestedMax !== undefined &&
    (!Number.isSafeInteger(requestedMax) || requestedMax <= 0)
  ) {
    throw uploadFailed('The file size constraint is invalid.');
  }
  return Math.min(requestedMax ?? configuredMaxBytes, configuredMaxBytes);
}

function assertUploadType(
  name: string,
  policy: Pick<
    UploadPolicy,
    'allowedExtensions' | 'allowedContentTypes' | 'contentType'
  >,
): void {
  if (policy.allowedExtensions.length > 0) {
    const extension = path.extname(name).toLowerCase();
    if (!policy.allowedExtensions.includes(extension)) {
      throw uploadTypeNotAllowed();
    }
  }
  if (
    policy.allowedContentTypes.length > 0 &&
    (policy.contentType === null ||
      !policy.allowedContentTypes.includes(policy.contentType))
  ) {
    throw uploadTypeNotAllowed();
  }
}

function normalizeExtensions(values: readonly string[]): readonly string[] {
  return [...new Set(values.map(normalizeExtension))];
}

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^\.[a-z0-9][a-z0-9._+-]{0,31}$/.test(normalized)) {
    throw uploadFailed('A file extension constraint is invalid.');
  }
  return normalized;
}

function normalizeContentTypes(values: readonly string[]): readonly string[] {
  return [...new Set(values.map(normalizeRequiredContentType))];
}

function normalizeRequiredContentType(value: string): string {
  const normalized = normalizeOptionalContentType(value);
  if (normalized === null) {
    throw uploadFailed('A content type constraint is invalid.');
  }
  return normalized;
}

function isWebReadableStream(
  value: CreateFileInput['content'],
): value is ReadableStream<Uint8Array> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'getReader' in value &&
    typeof value.getReader === 'function'
  );
}

function uploadSizeExceeded(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'UPLOAD_SIZE_EXCEEDED',
    413,
    'The file exceeds the upload size limit.',
  );
}

function uploadTypeNotAllowed(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'UPLOAD_TYPE_NOT_ALLOWED',
    415,
    'The file type is not allowed.',
  );
}

function uploadFailed(message: string): FilesDataPlaneError {
  return new FilesDataPlaneError('UPLOAD_FAILED', 409, message);
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { Readable, Transform, type TransformCallback } from 'node:stream';

import { Hono, type Context } from 'hono';

import type { FileUploadPlan, StoredFile } from '../../client/types.js';
import type { FilesConfig } from '../config.js';
import type { FileConstraints } from '../types.js';
import {
  ExpiredFileCapabilityError,
  FileCapabilityCodec,
  InvalidFileCapabilityError,
  type FileCapabilityDisposition,
  type FileUploadCapability,
} from './capability.js';
import {
  fileNotFound,
  fileNotReady,
  FilesDataPlaneError,
  invalidAccess,
  storageUnavailable,
  uploadExpired,
} from './errors.js';
import type { FileKernel } from './kernel.js';
import type { FileRecord, PublicDisposition } from './model.js';
import type {
  InternalFilesStorage,
  StorageObjectMetadata,
} from './storage/types.js';

const PUBLIC_TOKEN_PREFIX = 'fp1_';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const INLINE_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

export interface CreateFilesDataPlaneOptions {
  config: FilesConfig;
  kernel: FileKernel;
  storage: InternalFilesStorage;
  capabilityCodec: FileCapabilityCodec;
  clock?: () => Date;
  basePath?: string;
}

export interface CreateFileUploadPlanInput {
  name: string;
  size: number;
  contentType?: string;
  constraints?: FileConstraints;
}

export interface CreatedFileUploadAttempt {
  plan: FileUploadPlan;
  file: StoredFile;
  candidateKey: string;
}

export interface FileReadAccess {
  url: string;
  expiresAt: string;
}

export interface PublicFileAccess {
  file: StoredFile;
  token: string;
  url: string;
  disposition: PublicDisposition;
}

interface UploadPolicy {
  maxBytes: number;
  expectedSize: number;
  contentType: string | null;
  allowedExtensions: readonly string[];
  allowedContentTypes: readonly string[];
}

interface AuthorizedContent {
  disposition: FileCapabilityDisposition;
  publicAccess: boolean;
}

interface FileResponseBody {
  file: StoredFile;
}

interface FilesErrorResponseBody {
  error: string;
  code: string;
}

export class FilesDataPlane {
  readonly #config: FilesConfig;
  readonly #kernel: FileKernel;
  readonly #storage: InternalFilesStorage;
  readonly #capabilityCodec: FileCapabilityCodec;
  readonly #clock: () => Date;
  readonly #basePath: string;

  constructor(options: CreateFilesDataPlaneOptions) {
    this.#config = options.config;
    this.#kernel = options.kernel;
    this.#storage = options.storage;
    this.#capabilityCodec = options.capabilityCodec;
    this.#clock = options.clock ?? (() => new Date());
    this.#basePath = normalizeBasePath(options.basePath ?? '/api/files');
  }

  createRoute(): Hono {
    const routes = new Hono();

    routes.put('/:fileId/upload', async (context) =>
      this.#handleLocalUpload(context),
    );
    routes.post('/:fileId/complete', async (context) =>
      this.#handleComplete(context),
    );
    routes.get('/:fileId/content', async (context) =>
      this.#handleContent(context, false),
    );
    routes.on('HEAD', '/:fileId/content', async (context) =>
      this.#handleContent(context, true),
    );
    routes.onError((error, context) => this.#errorResponse(error, context));

    return routes;
  }

  async createUploadPlan(
    input: CreateFileUploadPlanInput,
  ): Promise<FileUploadPlan> {
    return (await this.createUploadAttempt(input)).plan;
  }

  async createUploadAttempt(
    input: CreateFileUploadPlanInput,
  ): Promise<CreatedFileUploadAttempt> {
    const name = normalizeFileName(input.name);
    const policy = normalizeUploadPolicy(input, this.#config.upload.maxBytes);
    assertUploadPolicy(name, policy);
    const pending = await this.#kernel.createPending({ name });
    const expiresAt = new Date(pending.expiresAt).getTime();
    const commonCapability = {
      fileId: pending.fileId,
      expiresAt,
      candidateKey: pending.candidateKey,
      readyKey: pending.readyKey,
      ...policy,
    } as const;

    try {
      if (this.#storage.driver === 'local') {
        const access = this.#capabilityCodec.issue({
          ...commonCapability,
          action: 'upload',
        });
        const plan: FileUploadPlan = {
          fileId: pending.fileId,
          expiresAt: pending.expiresAt,
          upload: {
            method: 'PUT',
            url: this.#accessUrl(pending.fileId, 'upload', access),
            ...(policy.contentType === null
              ? {}
              : { headers: { 'content-type': policy.contentType } }),
          },
        };
        return {
          plan,
          file: pending.file,
          candidateKey: pending.candidateKey,
        };
      }

      const upload = await this.#storage.createCandidateUpload(
        pending.candidateKey,
        {
          expiresInSeconds: secondsUntil(expiresAt, this.#now()),
          contentLength: policy.expectedSize,
          ...(policy.contentType === null
            ? {}
            : { contentType: policy.contentType }),
        },
      );
      const completeAccess = this.#capabilityCodec.issue({
        ...commonCapability,
        action: 'complete',
      });
      const plan: FileUploadPlan = {
        fileId: pending.fileId,
        expiresAt: pending.expiresAt,
        upload,
        complete: {
          method: 'POST',
          url: this.#accessUrl(pending.fileId, 'complete', completeAccess),
        },
      };
      return {
        plan,
        file: pending.file,
        candidateKey: pending.candidateKey,
      };
    } catch (error) {
      await this.#kernel.cancelUpload(pending.fileId, pending.candidateKey);
      if (error instanceof FilesDataPlaneError) {
        throw error;
      }
      throw storageUnavailable(error);
    }
  }

  async createReadAccess(
    fileId: string,
    disposition: PublicDisposition = 'attachment',
  ): Promise<FileReadAccess> {
    const record = await this.#requireReadyFile(fileId);
    assertInlineAllowed(record.contentType, disposition);
    const expiresAt =
      this.#now() + this.#config.access.temporaryExpiresInSeconds * 1_000;
    const access = this.#capabilityCodec.issue({
      action: 'read',
      fileId: record.id,
      expiresAt,
      disposition,
    });
    return {
      url: this.#accessUrl(record.id, 'content', access),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async enablePublicAccess(
    fileId: string,
    disposition: PublicDisposition = 'attachment',
  ): Promise<PublicFileAccess> {
    this.#assertPublicAccessEnabled();
    const record = await this.#requireReadyFile(fileId);
    assertInlineAllowed(record.contentType, disposition);
    const token = createPublicToken();
    try {
      const file = await this.#kernel.enablePublicAccess(
        record.id,
        hashPublicToken(token),
        disposition,
      );
      return this.#publicAccessResult(file, token, disposition);
    } catch (error) {
      throw mapPublicAccessKernelError(error);
    }
  }

  async resetPublicAccess(
    fileId: string,
    disposition: PublicDisposition = 'attachment',
  ): Promise<PublicFileAccess> {
    this.#assertPublicAccessEnabled();
    const record = await this.#requireReadyFile(fileId);
    assertInlineAllowed(record.contentType, disposition);
    const token = createPublicToken();
    try {
      const file = await this.#kernel.resetPublicAccess(
        record.id,
        hashPublicToken(token),
        disposition,
      );
      return this.#publicAccessResult(file, token, disposition);
    } catch (error) {
      throw mapPublicAccessKernelError(error);
    }
  }

  async disablePublicAccess(fileId: string): Promise<StoredFile> {
    try {
      return await this.#kernel.disablePublicAccess(fileId);
    } catch (error) {
      throw mapPublicAccessKernelError(error);
    }
  }

  async #handleLocalUpload(context: Context): Promise<Response> {
    if (this.#storage.driver !== 'local') {
      throw invalidAccess();
    }
    const fileId = readFileIdParam(context);
    const capability = this.#verifyUploadCapability(
      fileId,
      'upload',
      readAccess(context),
    );
    const record = await this.#requirePendingUpload(fileId);
    assertBeforeUploadDeadline(record, this.#now());
    assertUploadPolicy(record.name, capability);
    const contentType = normalizeOptionalContentType(
      context.req.header('content-type'),
    );
    validateContentType(contentType, capability);
    validateContentLength(context.req.header('content-length'), capability);
    const body = context.req.raw.body;
    if (!body) {
      throw uploadFailed('The upload request body is required.');
    }

    const source = Readable.fromWeb(
      body as import('node:stream/web').ReadableStream<Uint8Array>,
    );
    const byteLimit = new ByteLimitTransform(capability.maxBytes);
    source.once('error', (error) => byteLimit.destroy(error));
    source.pipe(byteLimit);
    let candidateWritten = false;
    try {
      await this.#storage.putCandidate(capability.candidateKey, byteLimit, {
        ...(contentType === null ? {} : { contentType }),
      });
      candidateWritten = true;
      if (byteLimit.bytesRead !== capability.expectedSize) {
        throw uploadFailed('The uploaded byte count does not match the plan.');
      }
      const file = await this.#completeCandidate(capability);
      return context.json<FileResponseBody>({ file });
    } catch (error) {
      if (candidateWritten) {
        await this.#deleteBestEffort(capability.candidateKey);
      }
      if (error instanceof FilesDataPlaneError) {
        throw error;
      }
      throw uploadFailed('The file upload could not be completed.', error);
    } finally {
      source.destroy();
    }
  }

  async #handleComplete(context: Context): Promise<Response> {
    const fileId = readFileIdParam(context);
    const capability = this.#verifyUploadCapability(
      fileId,
      'complete',
      readAccess(context),
    );
    const record = await this.#kernel.getRecord(fileId);
    if (!record) {
      await this.#deleteBestEffort(capability.candidateKey);
      throw fileNotFound();
    }
    if (record.status === 'pending') {
      assertBeforeUploadDeadline(record, this.#now());
      assertUploadPolicy(record.name, capability);
    }
    if (record.status === 'failed') {
      await this.#deleteBestEffort(capability.candidateKey);
      throw fileNotReady();
    }

    try {
      const file = await this.#completeCandidate(capability);
      return context.json<FileResponseBody>({ file });
    } catch (error) {
      if (error instanceof FilesDataPlaneError) {
        throw error;
      }
      if (isMissingStorageObject(error)) {
        throw uploadFailed('The uploaded object could not be found.');
      }
      throw storageUnavailable(error);
    }
  }

  async #handleContent(context: Context, head: boolean): Promise<Response> {
    const fileId = readFileIdParam(context);
    const access = readAccess(context);
    const capabilityDisposition = access.startsWith(PUBLIC_TOKEN_PREFIX)
      ? undefined
      : this.#verifyReadCapability(fileId, access);
    const record = await this.#kernel.getRecord(fileId);
    if (!record) {
      if (capabilityDisposition === undefined) {
        throw invalidAccess();
      }
      throw fileNotFound();
    }
    if (record.status !== 'ready') {
      throw fileNotReady();
    }
    const authorized =
      capabilityDisposition === undefined
        ? this.#authorizePublicContent(record, access)
        : { disposition: capabilityDisposition, publicAccess: false };
    assertInlineAllowed(record.contentType, authorized.disposition);
    if (record.storageKey === null || record.size === null) {
      throw fileNotReady();
    }

    const contentDisposition = createContentDisposition(
      authorized.disposition,
      record.name,
    );
    const headers = createContentHeaders(
      record,
      contentDisposition,
      authorized.publicAccess,
    );
    try {
      if (this.#storage.driver === 's3') {
        const location = await this.#storage.createReadUrl(record.storageKey, {
          expiresInSeconds: this.#config.access.providerUrlExpiresInSeconds,
          contentDisposition,
        });
        headers.delete('content-length');
        headers.set('location', location);
        return new Response(null, { status: 302, headers });
      }

      if (head) {
        return new Response(null, { status: 200, headers });
      }
      const stream = await this.#storage.openRead(record.storageKey);
      const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
      return new Response(body, { status: 200, headers });
    } catch (error) {
      throw storageUnavailable(error);
    }
  }

  async #completeCandidate(
    capability: FileUploadCapability,
  ): Promise<StoredFile> {
    let result;
    try {
      result = await this.#kernel.completeUpload({
        fileId: capability.fileId,
        candidateKey: capability.candidateKey,
        readyKey: capability.readyKey,
        validateMetadata: (metadata) =>
          validateStorageMetadata(metadata, capability),
      });
    } catch (error) {
      await this.#deleteBestEffort(capability.candidateKey);
      throw error;
    }

    if (
      'cleanupStorageKey' in result &&
      result.cleanupStorageKey !== undefined
    ) {
      await this.#deleteBestEffort(result.cleanupStorageKey);
    }
    switch (result.outcome) {
      case 'completed':
      case 'ready':
        return result.file;
      case 'missing':
        throw fileNotFound();
      case 'failed':
        throw uploadFailed('The pending upload was cancelled.');
      case 'persistence-failed':
        throw uploadFailed(
          'The uploaded file could not be committed.',
          result.error,
        );
    }
  }

  #authorizePublicContent(
    record: FileRecord,
    access: string,
  ): AuthorizedContent {
    if (!this.#config.publicAccess.enabled) {
      throw new FilesDataPlaneError(
        'PUBLIC_ACCESS_DISABLED',
        403,
        'Public file access is disabled.',
      );
    }
    if (
      record.publicTokenHash === null ||
      record.publicDisposition === null ||
      !matchesPublicToken(record.publicTokenHash, access)
    ) {
      throw invalidAccess();
    }
    return {
      disposition: record.publicDisposition,
      publicAccess: true,
    };
  }

  #verifyReadCapability(
    fileId: string,
    access: string,
  ): FileCapabilityDisposition {
    try {
      const capability = this.#capabilityCodec.verify(
        { fileId, action: 'read' },
        access,
      );
      if (capability.action !== 'read') {
        throw invalidAccess();
      }
      return capability.disposition;
    } catch {
      throw invalidAccess();
    }
  }

  #verifyUploadCapability(
    fileId: string,
    action: 'upload' | 'complete',
    access: string,
  ): FileUploadCapability {
    try {
      const capability = this.#capabilityCodec.verify(
        { fileId, action },
        access,
      );
      if (capability.action !== action) {
        throw invalidAccess();
      }
      return capability;
    } catch (error) {
      if (error instanceof ExpiredFileCapabilityError) {
        throw uploadExpired();
      }
      if (error instanceof InvalidFileCapabilityError) {
        throw invalidAccess();
      }
      throw error;
    }
  }

  async #requirePendingUpload(fileId: string): Promise<FileRecord> {
    const record = await this.#kernel.getRecord(fileId);
    if (!record) {
      throw fileNotFound();
    }
    if (record.status !== 'pending') {
      throw fileNotReady();
    }
    return record;
  }

  async #requireReadyFile(fileId: string): Promise<FileRecord> {
    const record = await this.#kernel.getRecord(fileId);
    if (!record) {
      throw fileNotFound();
    }
    if (record.status !== 'ready') {
      throw fileNotReady();
    }
    return record;
  }

  #assertPublicAccessEnabled(): void {
    if (!this.#config.publicAccess.enabled) {
      throw new FilesDataPlaneError(
        'PUBLIC_ACCESS_DISABLED',
        403,
        'Public file access is disabled.',
      );
    }
  }

  #publicAccessResult(
    file: StoredFile,
    token: string,
    disposition: PublicDisposition,
  ): PublicFileAccess {
    return {
      file,
      token,
      url: this.#accessUrl(file.id, 'content', token),
      disposition,
    };
  }

  #accessUrl(fileId: string, action: string, access: string): string {
    return `${this.#basePath}/${encodeURIComponent(fileId)}/${action}?access=${encodeURIComponent(access)}`;
  }

  async #deleteBestEffort(storageKey: string): Promise<void> {
    try {
      await this.#storage.delete(storageKey);
    } catch {
      // The file state is authoritative; cleanup jobs can retry safe leftovers.
    }
  }

  #errorResponse(error: Error, context: Context): Response {
    const mapped =
      error instanceof FilesDataPlaneError ? error : storageUnavailable(error);
    return context.json<FilesErrorResponseBody>(
      { error: mapped.message, code: mapped.code },
      mapped.status,
    );
  }

  #now(): number {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error('Files data plane clock returned an invalid date.');
    }
    return value.getTime();
  }
}

export function createFilesDataPlane(
  options: CreateFilesDataPlaneOptions,
): FilesDataPlane {
  return new FilesDataPlane(options);
}

function normalizeUploadPolicy(
  input: CreateFileUploadPlanInput,
  configuredMaxBytes: number,
): UploadPolicy {
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    throw uploadFailed('The declared file size is invalid.');
  }
  const requestedMax = input.constraints?.maxBytes;
  if (
    requestedMax !== undefined &&
    (!Number.isSafeInteger(requestedMax) || requestedMax <= 0)
  ) {
    throw uploadFailed('The file size constraint is invalid.');
  }
  const maxBytes = Math.min(
    requestedMax ?? configuredMaxBytes,
    configuredMaxBytes,
  );
  if (input.size > maxBytes) {
    throw new FilesDataPlaneError(
      'UPLOAD_SIZE_EXCEEDED',
      413,
      'The file exceeds the upload size limit.',
    );
  }

  const contentType = normalizeOptionalContentType(input.contentType);
  return {
    maxBytes,
    expectedSize: input.size,
    contentType,
    allowedExtensions: normalizeExtensions(
      input.constraints?.allowedExtensions ?? [],
    ),
    allowedContentTypes: normalizeContentTypes(
      input.constraints?.allowedContentTypes ?? [],
    ),
  };
}

function assertUploadPolicy(name: string, policy: UploadPolicy): void {
  if (policy.expectedSize > policy.maxBytes) {
    throw new FilesDataPlaneError(
      'UPLOAD_SIZE_EXCEEDED',
      413,
      'The file exceeds the upload size limit.',
    );
  }
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

function validateContentType(
  contentType: string | null,
  policy: UploadPolicy,
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

function validateContentLength(
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
    throw new FilesDataPlaneError(
      'UPLOAD_SIZE_EXCEEDED',
      413,
      'The file exceeds the upload size limit.',
    );
  }
  if (contentLength !== policy.expectedSize) {
    throw uploadFailed('The Content-Length header does not match the plan.');
  }
}

function validateStorageMetadata(
  metadata: StorageObjectMetadata,
  policy: UploadPolicy,
): void {
  if (metadata.contentLength > policy.maxBytes) {
    throw new FilesDataPlaneError(
      'UPLOAD_SIZE_EXCEEDED',
      413,
      'The file exceeds the upload size limit.',
    );
  }
  if (metadata.contentLength !== policy.expectedSize) {
    throw uploadFailed('The uploaded byte count does not match the plan.');
  }
  validateContentType(
    normalizeOptionalContentType(metadata.contentType),
    policy,
  );
}

function normalizeExtensions(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => normalizeExtension(value)))];
}

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^\.[a-z0-9][a-z0-9._+-]{0,31}$/.test(normalized)) {
    throw uploadFailed('A file extension constraint is invalid.');
  }
  return normalized;
}

function normalizeContentTypes(values: readonly string[]): readonly string[] {
  return [
    ...new Set(values.map((value) => normalizeRequiredContentType(value))),
  ];
}

function normalizeRequiredContentType(value: string): string {
  const normalized = normalizeOptionalContentType(value);
  if (normalized === null) {
    throw uploadFailed('A content type constraint is invalid.');
  }
  return normalized;
}

function normalizeOptionalContentType(
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

function normalizeFileName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 255) {
    throw uploadFailed('The file name is invalid.');
  }
  return name;
}

function normalizeBasePath(value: string): string {
  const pathValue = value.trim();
  if (
    !pathValue.startsWith('/') ||
    pathValue.includes('?') ||
    pathValue.includes('#')
  ) {
    throw new Error('Files data plane basePath must be an absolute URL path.');
  }
  return pathValue === '/' ? '' : pathValue.replace(/\/+$/, '');
}

function assertBeforeUploadDeadline(record: FileRecord, now: number): void {
  if (now >= record.uploadExpiresAt.getTime()) {
    throw uploadExpired();
  }
}

function assertInlineAllowed(
  contentType: string | null,
  disposition: PublicDisposition,
): void {
  if (
    disposition === 'inline' &&
    (contentType === null ||
      !INLINE_CONTENT_TYPES.has(contentType.toLowerCase()))
  ) {
    throw invalidAccess();
  }
}

function createContentDisposition(
  disposition: PublicDisposition,
  name: string,
): string {
  const sourceName = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const normalizedName =
    [...sourceName]
      .map((character) =>
        isSafeDispositionCharacter(character) ? character : '_',
      )
      .join('')
      .trim()
      .slice(0, 200) || 'file';
  const fallback =
    [...normalizedName]
      .map((character) =>
        isSafeFallbackCharacter(character) ? character : '_',
      )
      .join('')
      .replace(/[^\x20-\x7e]/g, '_')
      .trim()
      .slice(0, 150) || 'file';
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeDispositionFileName(normalizedName)}`;
}

function isSafeDispositionCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 32 && code !== 127;
}

function isSafeFallbackCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 32 && code !== 127 && character !== '"' && character !== ';';
}

function createContentHeaders(
  record: FileRecord,
  contentDisposition: string,
  publicAccess: boolean,
): Headers {
  return new Headers({
    'cache-control': publicAccess ? 'private, no-store' : 'private, no-store',
    'content-disposition': contentDisposition,
    'content-length': String(record.size ?? 0),
    'content-type': record.contentType ?? DEFAULT_CONTENT_TYPE,
    'x-content-type-options': 'nosniff',
  });
}

function readAccess(context: Context): string {
  const access = context.req.query('access');
  if (!access || access.length > 4096) {
    throw invalidAccess();
  }
  return access;
}

function readFileIdParam(context: Context): string {
  const fileId = context.req.param('fileId');
  if (!fileId) {
    throw fileNotFound();
  }
  return fileId;
}

function createPublicToken(): string {
  return `${PUBLIC_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

function hashPublicToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function matchesPublicToken(expectedHash: string, token: string): boolean {
  const actual = Buffer.from(hashPublicToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function secondsUntil(expiresAt: number, now: number): number {
  return Math.max(1, Math.ceil((expiresAt - now) / 1_000));
}

function uploadTypeNotAllowed(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'UPLOAD_TYPE_NOT_ALLOWED',
    415,
    'The file type is not allowed.',
  );
}

function encodeDispositionFileName(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function uploadFailed(message: string, cause?: unknown): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'UPLOAD_FAILED',
    409,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function mapPublicAccessKernelError(error: unknown): FilesDataPlaneError {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('existing ready file')) {
    return fileNotReady();
  }
  if (message.includes('already enabled') || message.includes('not enabled')) {
    return new FilesDataPlaneError('INVALID_ACCESS', 409, message);
  }
  return storageUnavailable(error);
}

function isMissingStorageObject(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  const code = String(error.code);
  return code === 'ENOENT' || code === 'NoSuchKey' || code === 'NotFound';
}

class ByteLimitTransform extends Transform {
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
      callback(
        new FilesDataPlaneError(
          'UPLOAD_SIZE_EXCEEDED',
          413,
          'The file exceeds the upload size limit.',
        ),
      );
      return;
    }
    callback(null, chunk);
  }
}

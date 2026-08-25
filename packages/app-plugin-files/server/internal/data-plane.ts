import { Readable } from 'node:stream';

import { Hono, type Context } from 'hono';
import type { DatabaseConnection } from '@nocobase/app-database';

import type { FileUploadPlan, StoredFile } from '../../protocol.js';
import type { FilesConfig } from '../config.js';
import type { CreateFileInput, FileConstraints, OpenedFile } from '../types.js';
import {
  ExpiredFileCapabilityError,
  FileCapabilityCodec,
  InvalidFileCapabilityError,
  type FileCapabilityDisposition,
  type FileTransferDescriptor,
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
import type {
  CancelFileBindingInput,
  CompleteFileResult,
  FileKernel,
} from './kernel.js';
import { PublicAccessKernelError } from './kernel.js';
import {
  assertInlineAllowed,
  createContentDisposition,
  createContentHeaders,
  resolveContentDisposition,
} from './content-delivery.js';
import {
  toStoredFile,
  type FileRecord,
  type PublicDisposition,
} from './model.js';
import {
  createPublicToken,
  hashPublicToken,
  isPublicToken,
  matchesPublicToken,
} from './public-access.js';
import type { InternalFilesStorage } from './storage/types.js';
import {
  assertStreamUploadPolicy,
  assertUploadPolicy,
  ByteLimitTransform,
  normalizeFileName,
  normalizeOptionalContentType,
  normalizeStreamUploadPolicy,
  normalizeUploadPolicy,
  toNodeReadable,
  validateContentLength,
  validateContentType,
  validateStorageMetadata,
  validateStreamStorageMetadata,
} from './upload-policy.js';

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
  transfer: FileTransferDescriptor;
}

export interface CreateUploadAttemptTarget {
  basePath: string;
  issueCapability(
    action: 'upload' | 'cancel' | 'complete',
    transfer: FileTransferDescriptor,
  ): string;
}

export interface CompleteUploadBinding<TBinding> {
  commit(connection: DatabaseConnection, file: StoredFile): Promise<TBinding>;
}

export interface CancelUploadBinding<TBinding> {
  cancel(input: CancelFileBindingInput): Promise<TBinding>;
}

export interface CompletedFileUpload<TBinding = undefined> {
  file: StoredFile;
  binding?: TBinding;
}

export interface CancelledFileUpload<TBinding = undefined> {
  binding?: TBinding;
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

interface AuthorizedContent {
  disposition: FileCapabilityDisposition;
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
    routes.delete('/:fileId/upload', async (context) =>
      this.#handleCancel(context),
    );
    routes.post('/:fileId/complete', async (context) =>
      this.#handleComplete(context),
    );
    routes.on(['GET', 'HEAD'], '/:fileId/content', async (context) =>
      this.#handleContent(context, context.req.method === 'HEAD'),
    );
    routes.onError((error, context) => this.#errorResponse(error, context));

    return routes;
  }

  async createUploadPlan(
    input: CreateFileUploadPlanInput,
  ): Promise<FileUploadPlan> {
    return (await this.createUploadAttempt(input)).plan;
  }

  async cleanupExpiredPending(): Promise<void> {
    await this.#kernel.cleanupExpiredPending();
  }

  async createFile(input: CreateFileInput): Promise<StoredFile> {
    const name = normalizeFileName(input.name);
    const policy = normalizeStreamUploadPolicy(
      input,
      this.#config.upload.maxBytes,
    );
    assertStreamUploadPolicy(name, policy);
    const source = toNodeReadable(input.content);
    let pending;
    try {
      await this.cleanupExpiredPending();
      pending = await this.#kernel.createPending({ name });
    } catch (error) {
      source.destroy();
      throw error;
    }
    const byteLimit = new ByteLimitTransform(policy.maxBytes);
    byteLimit.on('error', () => undefined);
    source.once('error', (error) => byteLimit.destroy(error));
    source.pipe(byteLimit);

    try {
      await this.#storage.putCandidate(pending.candidateKey, byteLimit, {
        ...(policy.contentType === null
          ? {}
          : { contentType: policy.contentType }),
        ...(policy.expectedSize === undefined
          ? {}
          : { contentLength: policy.expectedSize }),
      });
      if (
        policy.expectedSize !== undefined &&
        byteLimit.bytesRead !== policy.expectedSize
      ) {
        throw uploadFailed('The streamed byte count does not match size.');
      }
      const result = await this.#kernel.completeUpload({
        fileId: pending.fileId,
        candidateKey: pending.candidateKey,
        validateMetadata: (metadata) =>
          validateStreamStorageMetadata(metadata, policy),
      });
      await Promise.all(
        result.cleanupStorageKeys.map((storageKey) =>
          this.#deleteBestEffort(storageKey),
        ),
      );
      if (result.outcome === 'completed' || result.outcome === 'ready') {
        return result.file;
      }
      if (result.outcome === 'missing') {
        throw fileNotFound();
      }
      if (result.outcome === 'failed') {
        throw fileNotReady();
      }
      throw uploadFailed('The streamed file could not be committed.');
    } catch (error) {
      try {
        await this.#kernel.cancelUpload(pending.fileId);
      } catch {
        // Preserve the stable upload error after best-effort cancellation.
      }
      if (error instanceof FilesDataPlaneError) {
        throw error;
      }
      throw storageUnavailable();
    } finally {
      source.destroy();
    }
  }

  async openFile(fileId: string): Promise<OpenedFile> {
    const record = await this.#requireReadyFile(fileId);
    if (record.storageKey === null) {
      throw fileNotReady();
    }
    try {
      const stream = await this.#storage.openRead(record.storageKey);
      return {
        file: toStoredFile(record),
        stream: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      };
    } catch {
      throw storageUnavailable();
    }
  }

  async createUploadAttempt(
    input: CreateFileUploadPlanInput,
    target?: CreateUploadAttemptTarget,
  ): Promise<CreatedFileUploadAttempt> {
    const name = normalizeFileName(input.name);
    const policy = normalizeUploadPolicy(input, this.#config.upload.maxBytes);
    assertUploadPolicy(name, policy);
    await this.cleanupExpiredPending();
    const pending = await this.#kernel.createPending({ name });
    const expiresAt = new Date(pending.expiresAt).getTime();
    const transfer: FileTransferDescriptor = {
      fileId: pending.fileId,
      expiresAt,
      candidateKey: pending.candidateKey,
      ...policy,
    };

    try {
      const actionUrl = (action: 'upload' | 'cancel' | 'complete'): string => {
        const access = target
          ? target.issueCapability(action, transfer)
          : this.#capabilityCodec.issue({ ...transfer, action });
        const basePath = normalizeBasePath(target?.basePath ?? this.#basePath);
        const suffix = action === 'cancel' ? 'upload' : action;
        return `${basePath}/${encodeURIComponent(pending.fileId)}/${suffix}?access=${encodeURIComponent(access)}`;
      };
      const upload =
        this.#storage.driver === 'local'
          ? {
              method: 'PUT' as const,
              url: actionUrl('upload'),
              ...(policy.contentType === null
                ? {}
                : { headers: { 'content-type': policy.contentType } }),
            }
          : await this.#storage.createCandidateUpload(pending.candidateKey, {
              expiresInSeconds: secondsUntil(expiresAt, this.#now()),
              contentLength: policy.expectedSize,
              ...(policy.contentType === null
                ? {}
                : { contentType: policy.contentType }),
            });
      const plan: FileUploadPlan = {
        fileId: pending.fileId,
        expiresAt: pending.expiresAt,
        upload,
        complete: {
          method: 'POST',
          url: actionUrl('complete'),
        },
        cancel: {
          method: 'DELETE',
          url: actionUrl('cancel'),
        },
      };
      return {
        plan,
        file: pending.file,
        transfer,
      };
    } catch (error) {
      await this.#kernel.cancelUpload(pending.fileId);
      if (error instanceof FilesDataPlaneError) {
        throw error;
      }
      throw storageUnavailable();
    }
  }

  async createReadAccess(
    fileId: string,
    disposition: PublicDisposition = 'attachment',
    expiresInSeconds: number = this.#config.access.temporaryExpiresInSeconds,
  ): Promise<FileReadAccess> {
    const record = await this.#requireReadyFile(fileId);
    assertInlineAllowed(record.contentType, disposition);
    const expiresAt =
      this.#now() +
      normalizeTemporaryExpiry(
        expiresInSeconds,
        this.#config.access.temporaryExpiresInSeconds,
      ) *
        1_000;
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

  async receiveLocalUpload(
    context: Context,
    transfer: FileTransferDescriptor,
  ): Promise<StoredFile> {
    if (this.#storage.driver !== 'local') {
      throw invalidAccess();
    }
    const record = await this.#requirePendingUpload(transfer.fileId);
    assertBeforeUploadDeadline(record, this.#now());
    assertUploadPolicy(record.name, transfer);
    const contentType = normalizeOptionalContentType(
      context.req.header('content-type'),
    );
    validateContentType(contentType, transfer);
    validateContentLength(context.req.header('content-length'), transfer);
    const body = context.req.raw.body;
    if (!body) {
      throw uploadFailed('The upload request body is required.');
    }

    const source = Readable.fromWeb(
      body as import('node:stream/web').ReadableStream<Uint8Array>,
    );
    const byteLimit = new ByteLimitTransform(transfer.maxBytes);
    byteLimit.on('error', () => undefined);
    source.once('error', (error) => byteLimit.destroy(error));
    source.pipe(byteLimit);
    let candidateWritten = false;
    try {
      await this.#storage.putCandidate(transfer.candidateKey, byteLimit, {
        ...(contentType === null ? {} : { contentType }),
      });
      candidateWritten = true;
      if (byteLimit.bytesRead !== transfer.expectedSize) {
        throw uploadFailed('The uploaded byte count does not match the plan.');
      }
      const current = await this.#kernel.getFile(transfer.fileId);
      if (!current) {
        throw fileNotFound();
      }
      if (current.status !== 'pending') {
        throw uploadFailed('The pending upload was cancelled.');
      }
      return current;
    } catch (error) {
      if (candidateWritten) {
        await this.#deleteBestEffort(transfer.candidateKey);
      }
      if (error instanceof FilesDataPlaneError) {
        throw error;
      }
      throw uploadFailed('The file upload could not be received.');
    } finally {
      source.destroy();
    }
  }

  async completeUpload<TBinding = undefined>(
    transfer: FileTransferDescriptor,
    binding?: CompleteUploadBinding<TBinding>,
  ): Promise<CompletedFileUpload<TBinding>> {
    const record = await this.#kernel.getRecord(transfer.fileId);
    if (!record) {
      await this.#deleteBestEffort(transfer.candidateKey);
      throw fileNotFound();
    }
    if (record.status === 'pending') {
      assertBeforeUploadDeadline(record, this.#now());
      assertUploadPolicy(record.name, transfer);
    }
    if (record.status === 'failed') {
      await this.#deleteBestEffort(transfer.candidateKey);
      throw fileNotReady();
    }

    let result: CompleteFileResult<TBinding>;
    try {
      result = await this.#kernel.completeUpload({
        fileId: transfer.fileId,
        candidateKey: transfer.candidateKey,
        validateMetadata: (metadata) =>
          validateStorageMetadata(metadata, transfer),
        ...(binding === undefined
          ? {}
          : {
              commitBinding: (
                connection: DatabaseConnection,
                file: StoredFile,
              ): Promise<TBinding> => binding.commit(connection, file),
            }),
      });
    } catch (error) {
      if (error instanceof FilesDataPlaneError) {
        await this.#deleteBestEffort(transfer.candidateKey);
        throw error;
      }
      if (isMissingStorageObject(error)) {
        throw uploadFailed('The uploaded object could not be found.');
      }
      throw storageUnavailable();
    }

    await Promise.all(
      result.cleanupStorageKeys.map((storageKey) =>
        this.#deleteBestEffort(storageKey),
      ),
    );
    switch (result.outcome) {
      case 'completed':
      case 'ready':
        return {
          file: result.file,
          ...(!('binding' in result) || result.binding === undefined
            ? {}
            : { binding: result.binding }),
        };
      case 'missing':
        throw fileNotFound();
      case 'failed':
        throw uploadFailed('The pending upload was cancelled.');
      case 'persistence-failed':
        throw uploadFailed('The uploaded file could not be committed.');
    }
  }

  async cancelUpload<TBinding = undefined>(
    transfer: FileTransferDescriptor,
    binding?: CancelUploadBinding<TBinding>,
  ): Promise<CancelledFileUpload<TBinding>> {
    const result = await this.#kernel.cancelUpload(
      transfer.fileId,
      binding === undefined
        ? undefined
        : (input: CancelFileBindingInput): Promise<TBinding> =>
            binding.cancel(input),
    );
    if (result.outcome === 'ready') {
      throw fileNotReady();
    }
    if (result.outcome === 'missing') {
      throw fileNotFound();
    }
    return {
      ...(!('binding' in result) || result.binding === undefined
        ? {}
        : { binding: result.binding }),
    };
  }

  async createScopedContentResponse(
    fileId: string,
    head: boolean,
    disposition?: PublicDisposition,
  ): Promise<Response> {
    const record = await this.#requireReadyFile(fileId);
    const resolvedDisposition = resolveContentDisposition(record, disposition);
    assertInlineAllowed(record.contentType, resolvedDisposition);
    return this.#deliverContent(record, head, resolvedDisposition);
  }

  async #handleLocalUpload(context: Context): Promise<Response> {
    const fileId = readFileIdParam(context);
    const capability = this.#verifyUploadCapability(
      fileId,
      'upload',
      readAccess(context),
    );
    const file = await this.receiveLocalUpload(context, capability);
    return context.json<FileResponseBody>({ file });
  }

  async #handleCancel(context: Context): Promise<Response> {
    const fileId = readFileIdParam(context);
    const capability = this.#verifyUploadCapability(
      fileId,
      'cancel',
      readAccess(context),
    );
    await this.cancelUpload(capability);
    return context.json({ success: true });
  }

  async #handleComplete(context: Context): Promise<Response> {
    const fileId = readFileIdParam(context);
    const capability = this.#verifyUploadCapability(
      fileId,
      'complete',
      readAccess(context),
    );
    const result = await this.completeUpload(capability);
    return context.json<FileResponseBody>({ file: result.file });
  }

  async #handleContent(context: Context, head: boolean): Promise<Response> {
    const fileId = readFileIdParam(context);
    const access = readAccess(context);
    const capabilityDisposition = isPublicToken(access)
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
        : { disposition: capabilityDisposition };
    assertInlineAllowed(record.contentType, authorized.disposition);
    return this.#deliverContent(record, head, authorized.disposition);
  }

  async #deliverContent(
    record: FileRecord,
    head: boolean,
    disposition: PublicDisposition,
  ): Promise<Response> {
    if (record.storageKey === null || record.size === null) {
      throw fileNotReady();
    }

    const contentDisposition = createContentDisposition(
      disposition,
      record.name,
    );
    const headers = createContentHeaders(record, contentDisposition);
    try {
      if (head) {
        return new Response(null, { status: 200, headers });
      }
      if (this.#storage.driver === 's3') {
        const location = await this.#storage.createReadUrl(record.storageKey, {
          expiresInSeconds: this.#config.access.providerUrlExpiresInSeconds,
          contentDisposition,
          cacheControl: 'private, no-store',
        });
        headers.delete('content-length');
        headers.set('location', location);
        return new Response(null, { status: 302, headers });
      }

      const stream = await this.#storage.openRead(record.storageKey);
      const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
      return new Response(body, { status: 200, headers });
    } catch {
      throw storageUnavailable();
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
    action: 'upload' | 'cancel' | 'complete',
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
      // The file state is authoritative; object deletion is best-effort.
    }
  }

  #errorResponse(error: Error, context: Context): Response {
    const mapped =
      error instanceof FilesDataPlaneError ? error : storageUnavailable();
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

function secondsUntil(expiresAt: number, now: number): number {
  return Math.max(1, Math.ceil((expiresAt - now) / 1_000));
}

function normalizeTemporaryExpiry(value: number, configured: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidAccess();
  }
  return Math.min(value, configured);
}

function uploadFailed(message: string): FilesDataPlaneError {
  return new FilesDataPlaneError('UPLOAD_FAILED', 409, message);
}

function mapPublicAccessKernelError(error: unknown): FilesDataPlaneError {
  if (!(error instanceof PublicAccessKernelError)) {
    return storageUnavailable();
  }
  if (error.reason === 'file-not-ready') {
    return fileNotReady();
  }
  return new FilesDataPlaneError('INVALID_ACCESS', 409, error.message);
}

function isMissingStorageObject(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  const code = String(error.code);
  return code === 'ENOENT' || code === 'NoSuchKey' || code === 'NotFound';
}

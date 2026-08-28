import { randomUUID } from 'node:crypto';

import type { Context } from 'hono';
import { Hono } from 'hono';

import {
  ExpiredFileTokenError,
  FileLimitReachedError,
  FileObjectNotFoundError,
  FileUnavailableError,
  InvalidFileInputError,
  InvalidFileTokenError,
} from './errors.js';
import {
  issueFileAccessUrl,
  type FileAccessUrl,
  verifyFileAccessToken,
} from './file-access.js';
import {
  openFileObject,
  putFileObject,
  removeFileObject,
  type StoredFileObject,
} from './file-storage.js';
import { createDatabaseFileStore } from './database-file-store.js';
import { normalizeFileName } from './filename.js';
import {
  DEFAULT_FILE_ROUTE_VISIBILITY,
  type CreateFileRouteOptions,
  type FileRecord,
  type FileRouteAction,
  type FileRouteVisibilityOptions,
  type FileStore,
  type NewFileRecord,
} from './types.js';

interface ClientFileRecord {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly contentUrl: string;
}

interface FileErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

const MIN_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_MULTIPART_OVERHEAD = 1024 * 1024;

class FileRouteError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 404 | 413;

  constructor(code: string, message: string, status: 400 | 403 | 404 | 413) {
    super(message);
    this.name = 'FileRouteError';
    this.code = code;
    this.status = status;
  }
}

export function createFileRoute(options: CreateFileRouteOptions): Hono {
  const store = resolveFileStore(options);
  assertMaxFiles(options.limits?.maxFiles);
  const routes = new Hono();
  const visibility = options.visibility ?? DEFAULT_FILE_ROUTE_VISIBILITY;

  routes.onError((error, context) => mapKnownError(error, context));

  routes.get('/', options.auth, async (context) => {
    const denied = await authorize(options, context, 'list');
    if (denied) return denied;

    const records = await store.list(context);
    return context.json({
      data: records.map((record) =>
        toClientRecord(record, rootContentPath(context, record.id)),
      ),
    });
  });

  routes.post('/', options.auth, async (context) => {
    const denied = await authorize(options, context, 'upload');
    if (denied) return denied;

    const form = await parseUploadForm(context, options.limits?.maxSize);
    const file = resolveUploadFile(form);
    const isPublic = resolveVisibility(form, visibility);
    const mimeType = file.type.trim() || 'application/octet-stream';
    validateUpload(file, mimeType, options);
    await enforceFileLimit(context, store, options.limits?.maxFiles);
    const record = await persistUpload(
      context,
      options,
      store,
      file,
      mimeType,
      isPublic,
    );

    return context.json(
      { data: toClientRecord(record, rootContentPath(context, record.id)) },
      201,
    );
  });

  routes.get('/:id', options.auth, async (context) => {
    const record = await findRecord(context, store);
    const denied = await authorize(options, context, 'read', record);
    if (denied) return denied;

    return context.json({
      data: toClientRecord(record, siblingContentPath(context, record.id)),
    });
  });

  routes.post('/:id/token', options.auth, async (context) => {
    const record = await findRecord(context, store);
    const denied = await authorize(options, context, 'issue-token', record);
    if (denied) return denied;

    const contentPath = tokenContentPath(context, record.id);
    let access: FileAccessUrl;
    if (record.public) {
      access = { url: contentPath, expiresAt: null };
    } else {
      access = issueFileAccessUrl({
        tokenSecret: options.tokenSecret,
        publicBasePath: options.publicBasePath,
        audience: options.audience,
        fileId: record.id,
        contentPath,
        expiresIn: await parseExpiresIn(context),
      });
    }
    return context.json({ data: access });
  });

  routes.get('/:id/content', async (context) => {
    const record = await findRecord(context, store);
    const token = context.req.query('token');
    if (!record.public) {
      if (!token) {
        throw new FileRouteError(
          'FILE_TOKEN_REQUIRED',
          'A file access token is required.',
          403,
        );
      }
      verifyFileAccessToken({
        tokenSecret: options.tokenSecret,
        audience: options.audience,
        fileId: record.id,
        token,
      });
    }

    const stream = await openFileObject(options.drive, record);
    const activeContent = isActiveContent(record);
    const headers = new Headers({
      'Content-Type': safeContentType(record.mimeType),
      'Content-Disposition': contentDisposition(
        record.filename,
        activeContent || context.req.query('download') === '1',
      ),
      'X-Content-Type-Options': 'nosniff',
    });
    if (activeContent) {
      headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    }
    if (token) {
      headers.set('Cache-Control', 'private, no-store, max-age=0');
      headers.set('Pragma', 'no-cache');
    }
    return new Response(stream, { headers });
  });

  routes.delete('/:id', options.auth, async (context) => {
    const id = context.req.param('id');
    if (!id) return context.body(null, 204);
    const record = await store.find(id, context);
    if (!record) return context.body(null, 204);
    const denied = await authorize(options, context, 'delete', record);
    if (denied) return denied;

    const removed = await store.remove(record.id, context);
    if (!removed) return context.body(null, 204);
    await removeFileObject(options.drive, removed);
    return context.body(null, 204);
  });

  return routes;
}

async function persistUpload(
  context: Context,
  options: CreateFileRouteOptions,
  store: FileStore,
  file: File,
  mimeType: string,
  isPublic: boolean,
): Promise<FileRecord> {
  const stored = await putFileObject(
    { drive: options.drive, defaultDisk: options.defaultDisk },
    {
      filename: file.name,
      mimeType,
      size: file.size,
      content: file,
      disk: options.disk,
    },
  );
  const input: NewFileRecord = {
    id: randomUUID(),
    disk: stored.disk,
    key: stored.key,
    filename: stored.filename,
    mimeType: stored.mimeType,
    size: stored.size,
    public: isPublic,
  };
  try {
    return await store.create(input, context);
  } catch (error) {
    await compensateUpload(options, stored);
    throw error;
  }
}

function resolveFileStore(options: CreateFileRouteOptions): FileStore {
  if (options.store) return options.store;
  return createDatabaseFileStore(options.database, {
    table: options.table,
    scope: options.scope,
    order: options.order,
  });
}

function assertMaxFiles(maxFiles: number | undefined): void {
  if (
    maxFiles !== undefined &&
    (!Number.isSafeInteger(maxFiles) || maxFiles <= 0)
  ) {
    throw new TypeError('File route maxFiles must be a positive safe integer.');
  }
}

async function enforceFileLimit(
  context: Context,
  store: FileStore,
  maxFiles: number | undefined,
): Promise<void> {
  if (maxFiles === undefined) return;
  const records = await store.list(context);
  if (records.length >= maxFiles) throw new FileLimitReachedError();
}

async function authorize(
  options: CreateFileRouteOptions,
  context: Context,
  action: FileRouteAction,
  record?: FileRecord,
): Promise<Response | undefined> {
  try {
    const result = await options.authorize?.(context, action, record);
    return result instanceof Response ? result : undefined;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

async function parseUploadForm(
  context: Context,
  maxFileSize: number | undefined,
): Promise<FormData> {
  const contentType = context.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new FileRouteError(
      'FILE_REQUIRED',
      'A multipart file field is required.',
      400,
    );
  }
  try {
    const request =
      maxFileSize === undefined
        ? context.req.raw
        : await readBoundedMultipartRequest(context.req.raw, maxFileSize);
    return await request.formData();
  } catch (error) {
    if (error instanceof FileRouteError) throw error;
    throw new FileRouteError(
      'FILE_REQUIRED',
      'A valid multipart file field is required.',
      400,
    );
  }
}

async function readBoundedMultipartRequest(
  request: Request,
  maxFileSize: number,
): Promise<Request> {
  const bodyLimit = multipartBodyLimit(maxFileSize);
  const declaredLength = parseContentLength(
    request.headers.get('content-length'),
  );
  if (declaredLength !== undefined && declaredLength > bodyLimit) {
    throw fileTooLarge();
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > bodyLimit) {
        try {
          await reader.cancel();
        } catch {
          // The size error remains authoritative after the limit is crossed.
        }
        throw fileTooLarge();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  });
}

function multipartBodyLimit(maxFileSize: number): number {
  const proportionalOverhead = Math.ceil(maxFileSize / 100);
  const overhead = Math.min(
    MAX_MULTIPART_OVERHEAD,
    Math.max(MIN_MULTIPART_OVERHEAD, proportionalOverhead),
  );
  return Math.min(Number.MAX_SAFE_INTEGER, maxFileSize + overhead);
}

function parseContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function fileTooLarge(): FileRouteError {
  return new FileRouteError(
    'FILE_TOO_LARGE',
    'The uploaded file exceeds the configured size limit.',
    413,
  );
}

function resolveUploadFile(form: FormData): File {
  const files = form.getAll('file');
  const file = files[0];
  if (files.length !== 1 || !file || !isFileCompatible(file)) {
    throw new FileRouteError(
      'FILE_REQUIRED',
      'Exactly one File-compatible file field is required.',
      400,
    );
  }
  return file;
}

function isFileCompatible(value: string | File): value is File {
  return (
    typeof value !== 'string' &&
    typeof value.name === 'string' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    typeof value.arrayBuffer === 'function'
  );
}

function resolveVisibility(
  form: FormData,
  visibility: FileRouteVisibilityOptions,
): boolean {
  const values = form.getAll('public');
  if (values.length === 0) return visibility.default === 'public';
  if (!visibility.allowClientOverride) {
    throw new FileRouteError(
      'FILE_INPUT_INVALID',
      'Client file visibility override is not allowed.',
      400,
    );
  }
  if (values.length !== 1 || (values[0] !== 'true' && values[0] !== 'false')) {
    throw new FileRouteError(
      'FILE_INPUT_INVALID',
      'File visibility must be either true or false.',
      400,
    );
  }
  return values[0] === 'true';
}

function validateUpload(
  file: File,
  mimeType: string,
  options: CreateFileRouteOptions,
): void {
  const maxSize = options.limits?.maxSize;
  if (maxSize !== undefined && file.size > maxSize) {
    throw fileTooLarge();
  }
  const mimeTypes = options.limits?.mimeTypes;
  if (mimeTypes && !mimeTypes.includes(mimeType)) {
    throw new FileRouteError(
      'FILE_TYPE_NOT_ALLOWED',
      'The uploaded file type is not allowed.',
      400,
    );
  }
}

async function compensateUpload(
  options: CreateFileRouteOptions,
  stored: StoredFileObject,
): Promise<void> {
  try {
    await removeFileObject(options.drive, {
      disk: stored.disk,
      key: stored.key,
    });
  } catch {
    console.error(
      'File upload compensation failed after the record could not be created.',
    );
  }
}

async function findRecord(
  context: Context,
  store: FileStore,
): Promise<FileRecord> {
  const id = context.req.param('id');
  if (!id) throw fileNotFound();
  const record = await store.find(id, context);
  if (!record) throw fileNotFound();
  return record;
}

function fileNotFound(): FileRouteError {
  return new FileRouteError('FILE_NOT_FOUND', 'File was not found.', 404);
}

async function parseExpiresIn(context: Context): Promise<number | undefined> {
  const text = await context.req.text();
  if (!text.trim()) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new FileRouteError(
      'FILE_INPUT_INVALID',
      'Token request body must be valid JSON.',
      400,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FileRouteError(
      'FILE_INPUT_INVALID',
      'Token request body must be an object.',
      400,
    );
  }
  const expiresIn = Reflect.get(value as Record<string, unknown>, 'expiresIn');
  if (expiresIn === undefined) return undefined;
  if (typeof expiresIn !== 'number') {
    throw new FileRouteError(
      'FILE_INPUT_INVALID',
      'Token expiration must be a number of seconds.',
      400,
    );
  }
  return expiresIn;
}

function toClientRecord(
  record: FileRecord,
  contentUrl: string,
): ClientFileRecord {
  return {
    id: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    public: record.public,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    contentUrl,
  };
}

function rootContentPath(context: Context, id: string): string {
  return joinPath(context.req.path, encodeURIComponent(id), 'content');
}

function siblingContentPath(context: Context, id: string): string {
  return joinPath(
    parentPath(context.req.path),
    encodeURIComponent(id),
    'content',
  );
}

function tokenContentPath(context: Context, id: string): string {
  return joinPath(
    parentPath(parentPath(context.req.path)),
    encodeURIComponent(id),
    'content',
  );
}

function parentPath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized.slice(0, Math.max(0, normalized.lastIndexOf('/'))) || '/';
}

function joinPath(base: string, ...parts: readonly string[]): string {
  const prefix = base === '/' ? '' : base.replace(/\/+$/, '');
  return `${prefix}/${parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .join('/')}`;
}

function safeContentType(value: string): string {
  const mimeType = value.trim();
  return /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mimeType)
    ? mimeType
    : 'application/octet-stream';
}

function contentDisposition(filename: string, download: boolean): string {
  const normalized = normalizeFileName(filename);
  const fallback = asciiFileNameFallback(normalized);
  const encoded = encodeURIComponent(normalized).replace(
    /[!'()*]/gu,
    (value) => `%${value.codePointAt(0)?.toString(16).toUpperCase()}`,
  );
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function asciiFileNameFallback(filename: string): string {
  const extension = filename.match(/\.[A-Za-z0-9]{1,16}$/u)?.[0] ?? '';
  const stem = (extension ? filename.slice(0, -extension.length) : filename)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[._-]+|[._-]+$/gu, '');
  return `${stem || 'upload'}${extension || (stem ? '' : '.bin')}`;
}

const ACTIVE_CONTENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/xml',
]);

const ACTIVE_CONTENT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.htm',
  '.html',
  '.svg',
  '.xhtml',
  '.xml',
]);

function isActiveContent(record: FileRecord): boolean {
  const mimeType = record.mimeType.split(';', 1)[0]?.trim().toLowerCase();
  if (
    mimeType &&
    (ACTIVE_CONTENT_MIME_TYPES.has(mimeType) || mimeType.endsWith('+xml'))
  )
    return true;
  const extension = record.filename.toLowerCase().match(/\.[^.]+$/u)?.[0];
  return extension ? ACTIVE_CONTENT_EXTENSIONS.has(extension) : false;
}

function mapKnownError(error: Error, context: Context): Response {
  if (error instanceof FileRouteError) {
    return errorResponse(context, error.code, error.message, error.status);
  }
  if (error instanceof FileLimitReachedError) {
    return errorResponse(context, error.code, error.message, 400);
  }
  if (error instanceof FileUnavailableError) {
    return errorResponse(context, error.code, error.message, 503);
  }
  if (error instanceof InvalidFileTokenError) {
    return errorResponse(context, error.code, error.message, 403);
  }
  if (error instanceof ExpiredFileTokenError) {
    return errorResponse(context, error.code, error.message, 403);
  }
  if (error instanceof InvalidFileInputError) {
    return errorResponse(context, error.code, error.message, 400);
  }
  if (error instanceof FileObjectNotFoundError) {
    return errorResponse(context, 'FILE_NOT_FOUND', 'File was not found.', 404);
  }
  throw error;
}

function errorResponse(
  context: Context,
  code: string,
  message: string,
  status: 400 | 403 | 404 | 413 | 503,
): Response {
  const body: FileErrorBody = { error: { code, message } };
  return context.json(body, status);
}

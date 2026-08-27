import { randomUUID } from 'node:crypto';

import type { Context } from 'hono';
import { Hono } from 'hono';

import {
  ExpiredFileTokenError,
  FileObjectNotFoundError,
  FilesUnavailableError,
  InvalidFileInputError,
  InvalidFileTokenError,
} from './errors.js';
import { normalizeFileName } from './filename.js';
import {
  DEFAULT_FILE_ROUTE_VISIBILITY,
  type CreateFileRouteOptions,
  type FileAccessUrl,
  type FileRecord,
  type FileRouteAction,
  type FileRouteVisibilityOptions,
  type NewFileRecord,
  type StoredFileObject,
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
  const routes = new Hono();
  const visibility = options.visibility ?? DEFAULT_FILE_ROUTE_VISIBILITY;

  routes.onError((error, context) => mapKnownError(error, context));

  routes.get('/', options.auth, async (context) => {
    const denied = await authorize(options, context, 'list');
    if (denied) return denied;

    const records = await options.store.list(context);
    return context.json({
      data: records.map((record) =>
        toClientRecord(record, rootContentPath(context, record.id)),
      ),
    });
  });

  routes.post('/', options.auth, async (context) => {
    const denied = await authorize(options, context, 'upload');
    if (denied) return denied;

    const form = await parseUploadForm(context);
    const file = resolveUploadFile(form);
    const isPublic = resolveVisibility(form, visibility);
    const mimeType = file.type.trim() || 'application/octet-stream';
    validateUpload(file, mimeType, options);
    await validateFileLimit(context, options);

    const stored = await options.files.put({
      filename: file.name,
      mimeType,
      size: file.size,
      content: file,
      disk: options.disk,
    });
    const input: NewFileRecord = {
      id: randomUUID(),
      disk: stored.disk,
      key: stored.key,
      filename: stored.filename,
      mimeType: stored.mimeType,
      size: stored.size,
      public: isPublic,
    };

    let record: FileRecord;
    try {
      record = await options.store.create(input, context);
    } catch (error) {
      await compensateUpload(options, stored, input);
      throw error;
    }

    return context.json(
      { data: toClientRecord(record, rootContentPath(context, record.id)) },
      201,
    );
  });

  routes.get('/:id', options.auth, async (context) => {
    const record = await findRecord(context, options);
    const denied = await authorize(options, context, 'read', record);
    if (denied) return denied;

    return context.json({
      data: toClientRecord(record, siblingContentPath(context, record.id)),
    });
  });

  routes.post('/:id/token', options.auth, async (context) => {
    const record = await findRecord(context, options);
    const denied = await authorize(options, context, 'issue-token', record);
    if (denied) return denied;

    const contentPath = tokenContentPath(context, record.id);
    let access: FileAccessUrl;
    if (record.public) {
      access = { url: contentPath, expiresAt: null };
    } else {
      access = await options.files.issueAccessUrl({
        audience: options.audience,
        fileId: record.id,
        contentPath,
        expiresIn: await parseExpiresIn(context),
      });
    }
    return context.json({ data: access });
  });

  routes.get('/:id/content', async (context) => {
    const record = await findRecord(context, options);
    const token = context.req.query('token');
    if (!record.public) {
      if (!token) {
        throw new FileRouteError(
          'FILE_TOKEN_REQUIRED',
          'A file access token is required.',
          403,
        );
      }
      await options.files.verifyAccessToken({
        audience: options.audience,
        fileId: record.id,
        token,
      });
    }

    const stream = await options.files.open(record);
    const headers = new Headers({
      'Content-Type': safeContentType(record.mimeType),
      'Content-Disposition': contentDisposition(
        record.filename,
        context.req.query('download') === '1',
      ),
      'X-Content-Type-Options': 'nosniff',
    });
    if (token) {
      headers.set('Cache-Control', 'private, no-store, max-age=0');
      headers.set('Pragma', 'no-cache');
    }
    return new Response(stream, { headers });
  });

  routes.delete('/:id', options.auth, async (context) => {
    const record = await findRecord(context, options);
    const denied = await authorize(options, context, 'delete', record);
    if (denied) return denied;

    await options.files.removeObject(record);
    const removed = await options.store.remove(record.id, context);
    if (!removed) throw fileNotFound();
    return context.body(null, 204);
  });

  return routes;
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

async function parseUploadForm(context: Context): Promise<FormData> {
  const contentType = context.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new FileRouteError(
      'FILE_REQUIRED',
      'A multipart file field is required.',
      400,
    );
  }
  try {
    return await context.req.raw.formData();
  } catch {
    throw new FileRouteError(
      'FILE_REQUIRED',
      'A valid multipart file field is required.',
      400,
    );
  }
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

function isFileCompatible(value: FormDataEntryValue): value is File {
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
    throw new FileRouteError(
      'FILE_TOO_LARGE',
      'The uploaded file exceeds the configured size limit.',
      413,
    );
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

async function validateFileLimit(
  context: Context,
  options: CreateFileRouteOptions,
): Promise<void> {
  const maxFiles = options.limits?.maxFiles;
  if (maxFiles === undefined) return;
  const records = await options.store.list(context);
  if (records.length >= maxFiles) {
    throw new FileRouteError(
      'FILE_LIMIT_REACHED',
      'The configured file count limit has been reached.',
      400,
    );
  }
}

async function compensateUpload(
  options: CreateFileRouteOptions,
  stored: StoredFileObject,
  input: NewFileRecord,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await options.files.removeObject({
      ...input,
      disk: stored.disk,
      key: stored.key,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    console.error(
      'File upload compensation failed after the record could not be created.',
    );
  }
}

async function findRecord(
  context: Context,
  options: CreateFileRouteOptions,
): Promise<FileRecord> {
  const id = context.req.param('id');
  if (!id) throw fileNotFound();
  const record = await options.store.find(id, context);
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
  return `${download ? 'attachment' : 'inline'}; filename="${normalizeFileName(filename)}"`;
}

function mapKnownError(error: Error, context: Context): Response {
  if (error instanceof FileRouteError) {
    return errorResponse(context, error.code, error.message, error.status);
  }
  if (error instanceof FilesUnavailableError) {
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

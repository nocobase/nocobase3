import { Hono, type Context } from 'hono';

import type { FileErrorResponse } from '../../protocol.js';
import type { CreateFileRouteOptions } from '../types.js';
import { FilesDataPlaneError } from './errors.js';
import {
  expiredScopedCapability,
  FileRouteError,
  invalidFileRequest,
  invalidFileRoute,
  invalidScopedCapability,
} from './route-errors.js';
import {
  ExpiredScopedFileCapabilityError,
  InvalidScopedFileCapabilityError,
  type ScopedFileCapability,
  type ScopedFileCapabilityAction,
  type ScopedFileCapabilityCodec,
} from './scoped-capability.js';
import type { FileRouteSchemaValidation } from './route-schema.js';
import {
  createScopedCapabilityScope,
  readScopedRoutePath,
} from './scoped-route.js';

export type FileRouteHandler = (context: Context) => Promise<Response>;

export interface ScopedFileRouteHandlers {
  list: FileRouteHandler;
  create: FileRouteHandler;
  upload: FileRouteHandler;
  cancel: FileRouteHandler;
  complete: FileRouteHandler;
  content: FileRouteHandler;
  remove: FileRouteHandler;
  enablePublicAccess?: FileRouteHandler;
  resetPublicAccess?: FileRouteHandler;
  disablePublicAccess?: FileRouteHandler;
}

export function mountScopedFileRoutes(
  handlers: ScopedFileRouteHandlers,
  schemaValidation?: FileRouteSchemaValidation,
): Hono {
  const routes = new Hono();
  const protect = (handler: FileRouteHandler): FileRouteHandler =>
    withFileRouteErrors(handler, schemaValidation);

  routes.get('/', protect(handlers.list));
  routes.post('/', protect(handlers.create));
  routes.put('/:fileId/upload', protect(handlers.upload));
  routes.delete('/:fileId/upload', protect(handlers.cancel));
  routes.post('/:fileId/complete', protect(handlers.complete));
  routes.on(['GET', 'HEAD'], '/:fileId/content', protect(handlers.content));
  routes.delete('/:fileId', protect(handlers.remove));

  if (
    handlers.enablePublicAccess &&
    handlers.resetPublicAccess &&
    handlers.disablePublicAccess
  ) {
    routes.post('/:fileId/public-access', protect(handlers.enablePublicAccess));
    routes.post(
      '/:fileId/public-access/reset',
      protect(handlers.resetPublicAccess),
    );
    routes.delete(
      '/:fileId/public-access',
      protect(handlers.disablePublicAccess),
    );
  }

  return routes;
}

export function validateOptions(options: CreateFileRouteOptions): void {
  if (typeof options.authorize !== 'function') {
    throw invalidFileRoute('File route authorize must be a function.');
  }
  const constraints = options.constraints;
  if (!constraints) {
    return;
  }
  if (
    constraints.maxBytes !== undefined &&
    (!Number.isSafeInteger(constraints.maxBytes) || constraints.maxBytes <= 0)
  ) {
    throw invalidFileRoute('File route maxBytes must be a positive integer.');
  }
  for (const extension of constraints.allowedExtensions ?? []) {
    if (
      typeof extension !== 'string' ||
      !/^\.[a-z0-9][a-z0-9._+-]{0,31}$/i.test(extension.trim())
    ) {
      throw invalidFileRoute(
        'File route contains an invalid allowed extension.',
      );
    }
  }
  for (const contentType of constraints.allowedContentTypes ?? []) {
    if (
      typeof contentType !== 'string' ||
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType.trim())
    ) {
      throw invalidFileRoute(
        'File route contains an invalid allowed content type.',
      );
    }
  }
}

export function readRouteFileId(context: Context, parameter: string): string {
  const value = context.req.param(parameter);
  if (!value || value.length > 64) {
    throw invalidFileRequest(`Route parameter "${parameter}" is invalid.`);
  }
  return value;
}

export function readOptionalFileId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw invalidFileRequest('replaceFileId is invalid.');
  }
  return value;
}

export function readConfigName(value: string, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw invalidFileRoute(`File route ${field} is invalid.`);
  }
  return normalized;
}

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidFileRequest(`Request field "${field}" is required.`);
  }
  return value;
}

export function readFileSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw invalidFileRequest('Request field "size" is invalid.');
  }
  return Number(value);
}

export function readDisposition(value: unknown): 'inline' | 'attachment' {
  if (value === undefined) {
    return 'attachment';
  }
  if (value === 'inline' || value === 'attachment') {
    return value;
  }
  throw invalidFileRequest('Request field "disposition" is invalid.');
}

export function readOptionalDisposition(
  value: string | undefined,
): 'inline' | 'attachment' | undefined {
  return value === undefined ? undefined : readDisposition(value);
}

export function readMountedBasePath(context: Context): string {
  try {
    return readScopedRoutePath(context);
  } catch (error) {
    throw invalidFileRoute(
      error instanceof Error ? error.message : 'Mounted file route is invalid.',
    );
  }
}

export function readCapabilityScope(scope: string, context: Context): string {
  try {
    return createScopedCapabilityScope(scope, context);
  } catch (error) {
    throw invalidFileRoute(
      error instanceof Error ? error.message : 'Mounted file route is invalid.',
    );
  }
}

export function verifyCapability(
  codec: ScopedFileCapabilityCodec,
  scope: string,
  context: Context,
  recordId: string,
  fileId: string,
  action: ScopedFileCapabilityAction,
): ScopedFileCapability {
  const value = context.req.query('access');
  if (!value || value.length > 4096) {
    throw invalidScopedCapability();
  }
  try {
    return codec.verify(
      {
        scope: readCapabilityScope(scope, context),
        recordId,
        fileId,
        action,
      },
      value,
    );
  } catch (error) {
    if (error instanceof ExpiredScopedFileCapabilityError) {
      throw expiredScopedCapability();
    }
    if (error instanceof InvalidScopedFileCapabilityError) {
      throw invalidScopedCapability();
    }
    throw error;
  }
}

export async function readJson<T>(context: Context): Promise<T> {
  try {
    return await context.req.json<T>();
  } catch {
    throw invalidFileRequest('The request body must be valid JSON.');
  }
}

export async function readOptionalJson<T>(
  context: Context,
): Promise<T | undefined> {
  const contentType = context.req.header('content-type');
  if (!contentType?.toLowerCase().includes('application/json')) {
    return undefined;
  }
  return readJson<T>(context);
}

export function withFileRouteErrors(
  handler: FileRouteHandler,
  schemaValidation?: FileRouteSchemaValidation,
): FileRouteHandler {
  return async (context) => {
    try {
      const schemaError = await schemaValidation;
      if (schemaError) {
        throw schemaError;
      }
      return await handler(context);
    } catch (error) {
      if (error instanceof Error) {
        const response = mapKnownError(error, context);
        if (response) {
          return response;
        }
      }
      throw error;
    }
  };
}

function mapKnownError(error: Error, context: Context): Response | undefined {
  if (error instanceof FileRouteError || error instanceof FilesDataPlaneError) {
    return context.json<FileErrorResponse>(
      { error: error.message, code: error.code },
      error.status,
    );
  }
  return undefined;
}

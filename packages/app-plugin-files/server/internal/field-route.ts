import { Hono, type Context } from 'hono';

import type {
  CreateBusinessFileRequest,
  CreateBusinessFileResponse,
  FileOperationResponse,
  PublicFileAccessRequest,
  PublicFileAccessResponse,
  StoredFile,
} from '../../protocol.js';
import type { CreateFileRouteOptions, FileFieldBinding } from '../types.js';
import type { FilesDataPlane } from './data-plane.js';
import {
  createFieldBindingRepository,
  type FieldBindingRepository,
} from './field-repository.js';
import {
  readCapabilityScope,
  readConfigName,
  readDisposition,
  readFileSize,
  readJson,
  readMountedBasePath,
  readOptionalDisposition,
  readOptionalFileId,
  readOptionalJson,
  readRequiredString,
  readRouteFileId,
  validateOptions,
  verifyCapability,
  withFileRouteErrors,
} from './file-route-support.js';
import type { FileKernel } from './kernel.js';
import {
  businessRecordNotFound,
  fileBindingConflict,
  fileReferenceNotFound,
  invalidFileRoute,
} from './route-errors.js';
import type { FilesRuntimeServiceState } from './runtime.js';
import {
  createScopedRouteIdentity,
  resolvePublicFileRoutePath,
} from './scoped-route.js';
import type { ScopedFileCapabilityCodec } from './scoped-capability.js';

export interface CreateFieldFileRouteInput {
  options: CreateFileRouteOptions;
  binding: FileFieldBinding;
  state: FilesRuntimeServiceState;
  publicBasePath: string;
}

interface NormalizedFieldBinding {
  collection: string;
  recordField: string;
  recordParam: string;
  fileField: string;
}

interface FieldRouteState {
  scope: string;
  binding: NormalizedFieldBinding;
  repository: FieldBindingRepository;
  options: CreateFileRouteOptions;
  dataPlane: FilesDataPlane;
  kernel: FileKernel;
  capabilityCodec: ScopedFileCapabilityCodec;
  publicBasePath: string;
}

export function createFieldFileRoute(input: CreateFieldFileRouteInput): Hono {
  const binding = validateFieldBinding(input.binding);
  validateOptions(input.options);
  const state: FieldRouteState = {
    scope: createScopedRouteIdentity(input.state.audience, 'field', {
      collection: binding.collection,
      recordField: binding.recordField,
      recordParam: binding.recordParam,
      fileField: binding.fileField,
    }),
    binding,
    repository: createFieldBindingRepository({
      database: input.state.database,
      ...(input.state.connection === undefined
        ? {}
        : { connection: input.state.connection }),
      collection: binding.collection,
      recordField: binding.recordField,
      fileField: binding.fileField,
    }),
    options: input.options,
    dataPlane: input.state.dataPlane,
    kernel: input.state.kernel,
    capabilityCodec: input.state.scopedCapabilityCodec,
    publicBasePath: input.publicBasePath,
  };
  const routes = new Hono();

  routes.get(
    '/',
    withFileRouteErrors((context) => handleList(state, context)),
  );
  routes.post(
    '/',
    withFileRouteErrors((context) => handleCreateUpload(state, context)),
  );
  routes.put(
    '/:fileId/upload',
    withFileRouteErrors((context) => handleUpload(state, context)),
  );
  routes.delete(
    '/:fileId/upload',
    withFileRouteErrors((context) => handleCancel(state, context)),
  );
  routes.post(
    '/:fileId/complete',
    withFileRouteErrors((context) => handleComplete(state, context)),
  );
  routes.on(
    ['GET', 'HEAD'],
    '/:fileId/content',
    withFileRouteErrors((context) =>
      handleContent(state, context, context.req.method === 'HEAD'),
    ),
  );
  routes.delete(
    '/:fileId',
    withFileRouteErrors((context) => handleDelete(state, context)),
  );

  if (input.options.publicAccess) {
    routes.post(
      '/:fileId/public-access',
      withFileRouteErrors((context) =>
        handleEnablePublicAccess(state, context),
      ),
    );
    routes.post(
      '/:fileId/public-access/reset',
      withFileRouteErrors((context) => handleResetPublicAccess(state, context)),
    );
    routes.delete(
      '/:fileId/public-access',
      withFileRouteErrors((context) =>
        handleDisablePublicAccess(state, context),
      ),
    );
  }

  return routes;
}

async function handleList(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'read', recordId });
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  if (snapshot.fileId === null) {
    return context.json<StoredFile[]>([]);
  }
  const file = await getReadyFile(state, snapshot.fileId, false);
  return context.json<StoredFile[]>(file ? [file] : []);
}

async function handleCreateUpload(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  const body = await readJson<CreateBusinessFileRequest>(context);
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  const replaceFileId = readOptionalFileId(body.replaceFileId);
  if (replaceFileId !== snapshot.fileId) {
    throw fileBindingConflict();
  }
  const attempt = await state.dataPlane.createUploadAttempt(
    {
      name: readRequiredString(body.name, 'name'),
      size: readFileSize(body.size),
      ...(body.contentType === undefined
        ? {}
        : { contentType: readRequiredString(body.contentType, 'contentType') }),
      ...(state.options.constraints === undefined
        ? {}
        : { constraints: state.options.constraints }),
    },
    {
      basePath: resolvePublicFileRoutePath(
        state.publicBasePath,
        readMountedBasePath(context),
      ),
      issueCapability: (action, transfer) =>
        state.capabilityCodec.issue({
          ...transfer,
          scope: readCapabilityScope(state.scope, context),
          recordId,
          replaceFileId,
          action,
        }),
    },
  );
  return context.json<CreateBusinessFileResponse>(
    {
      file: attempt.file,
      plan: attempt.plan,
    },
    201,
  );
}

async function handleUpload(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'write',
    recordId,
    fileId,
  });
  const capability = verifyCapability(
    state.capabilityCodec,
    state.scope,
    context,
    recordId,
    fileId,
    'upload',
  );
  const file = await state.dataPlane.receiveLocalUpload(context, capability);
  return context.json({ file });
}

async function handleCancel(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'write',
    recordId,
    fileId,
  });
  const capability = verifyCapability(
    state.capabilityCodec,
    state.scope,
    context,
    recordId,
    fileId,
    'cancel',
  );
  await state.dataPlane.cancelUpload(capability);
  return context.json<FileOperationResponse>({ success: true });
}

async function handleComplete(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'write',
    recordId,
    fileId,
  });
  const capability = verifyCapability(
    state.capabilityCodec,
    state.scope,
    context,
    recordId,
    fileId,
    'complete',
  );
  const completed = await state.dataPlane.completeUpload(capability, {
    commit: async (connection, file) => {
      const snapshot = await state.repository.get(recordId, connection);
      if (!snapshot.recordExists) {
        return { outcome: 'record-missing' as const };
      }
      if (snapshot.fileId === file.id) {
        return { outcome: 'committed' as const };
      }
      if (snapshot.fileId !== capability.replaceFileId) {
        return { outcome: 'conflict' as const };
      }
      const updated = await state.repository.compareAndSet(
        recordId,
        capability.replaceFileId,
        file.id,
        connection,
      );
      if (updated) {
        return { outcome: 'committed' as const };
      }
      const winner = await state.repository.get(recordId, connection);
      if (!winner.recordExists) {
        return { outcome: 'record-missing' as const };
      }
      return {
        outcome:
          winner.fileId === file.id
            ? ('committed' as const)
            : ('conflict' as const),
      };
    },
  });
  if (completed.binding?.outcome === 'record-missing') {
    throw businessRecordNotFound();
  }
  if (completed.binding?.outcome !== 'committed') {
    throw fileBindingConflict();
  }
  return context.json({ file: completed.file });
}

async function handleContent(
  state: FieldRouteState,
  context: Context,
  head: boolean,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'read',
    recordId,
    fileId,
  });
  await requireCurrentFile(state, recordId, fileId);
  return state.dataPlane.createScopedContentResponse(
    fileId,
    head,
    readOptionalDisposition(context.req.query('disposition')),
  );
}

async function handleDelete(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'write',
    recordId,
    fileId,
  });
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  const file = await state.kernel.getFile(fileId);

  if (snapshot.fileId === fileId) {
    if (!file || file.status !== 'ready') {
      throw fileReferenceNotFound();
    }
    if (!(await state.repository.compareAndSet(recordId, fileId, null))) {
      throw fileBindingConflict();
    }
    return context.json<FileOperationResponse>({ success: true });
  }

  if (snapshot.fileId === null && file?.status === 'ready') {
    return context.json<FileOperationResponse>({ success: true });
  }
  throw fileBindingConflict();
}

async function requireCurrentFile(
  state: FieldRouteState,
  recordId: string,
  fileId: string,
): Promise<StoredFile> {
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  if (snapshot.fileId !== fileId) {
    throw fileReferenceNotFound();
  }
  const file = await getReadyFile(state, fileId, true);
  if (!file) {
    throw fileReferenceNotFound();
  }
  return file;
}

async function getReadyFile(
  state: FieldRouteState,
  fileId: string,
  required: boolean,
): Promise<StoredFile | undefined> {
  const file = await state.kernel.getFile(fileId);
  if (!file || file.status !== 'ready') {
    if (required) {
      throw fileReferenceNotFound();
    }
    return undefined;
  }
  return file;
}

async function handleEnablePublicAccess(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  return handlePublicAccess(state, context, 'enable');
}

async function handleResetPublicAccess(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  return handlePublicAccess(state, context, 'reset');
}

async function handleDisablePublicAccess(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'share',
    recordId,
    fileId,
  });
  await requireCurrentFile(state, recordId, fileId);
  const file = await state.dataPlane.disablePublicAccess(fileId);
  return context.json({ file });
}

async function handlePublicAccess(
  state: FieldRouteState,
  context: Context,
  operation: 'enable' | 'reset',
): Promise<Response> {
  const recordId = readRecordId(state, context);
  const fileId = readRouteFileId(context, 'fileId');
  await state.options.authorize({
    context,
    action: 'share',
    recordId,
    fileId,
  });
  await requireCurrentFile(state, recordId, fileId);
  const body = await readOptionalJson<PublicFileAccessRequest>(context);
  const disposition = readDisposition(body?.disposition);
  const result =
    operation === 'enable'
      ? await state.dataPlane.enablePublicAccess(fileId, disposition)
      : await state.dataPlane.resetPublicAccess(fileId, disposition);
  return context.json<PublicFileAccessResponse>({
    file: result.file,
    access: {
      url: result.url,
      token: result.token,
      disposition: result.disposition,
    },
  });
}

function validateFieldBinding(
  binding: FileFieldBinding,
): NormalizedFieldBinding {
  const collection = readConfigName(binding.collection, 'collection');
  const recordParam = readConfigName(binding.recordParam, 'recordParam');
  const fileField = readConfigName(binding.fileField, 'fileField');
  const recordField = readConfigName(binding.recordKey ?? 'id', 'recordKey');
  return {
    collection,
    recordField,
    recordParam,
    fileField,
  };
}

function readRecordId(state: FieldRouteState, context: Context): string {
  const value = context.req.param(state.binding.recordParam);
  if (!value) {
    throw invalidFileRoute(
      `Mounted file route is missing record parameter ":${state.binding.recordParam}" for collection "${state.binding.collection}".`,
    );
  }
  return value;
}

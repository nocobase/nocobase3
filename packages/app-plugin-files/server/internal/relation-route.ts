import { randomBytes } from 'node:crypto';

import { Hono, type Context } from 'hono';

import type {
  CreateBusinessFileRequest,
  CreateBusinessFileResponse,
  FileOperationResponse,
  PublicFileAccessRequest,
  PublicFileAccessResponse,
  StoredFile,
} from '../../protocol.js';
import type { CreateFileRouteOptions, FileRelationBinding } from '../types.js';
import type { FilesDataPlane } from './data-plane.js';
import { storageUnavailable } from './errors.js';
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
  fileBindingConflict,
  fileLimitExceeded,
  fileReferenceNotFound,
  FileRouteError,
  invalidFileRoute,
} from './route-errors.js';
import {
  createRelationBindingRepository,
  type RelationBindingRepository,
  type RelationBindingRow,
} from './relation-repository.js';
import type { FilesRuntimeServiceState } from './runtime.js';
import {
  createScopedRouteIdentity,
  resolvePublicFileRoutePath,
} from './scoped-route.js';
import type { ScopedFileCapabilityCodec } from './scoped-capability.js';

export interface CreateRelationFileRouteInput {
  options: CreateFileRouteOptions;
  binding: FileRelationBinding;
  state: FilesRuntimeServiceState;
  publicBasePath: string;
}

interface NormalizedRelationBinding {
  collection: string;
  recordField: string;
  recordParam: string;
  maxFiles: number;
}

interface RelationRouteState {
  scope: string;
  binding: NormalizedRelationBinding;
  repository: RelationBindingRepository;
  options: CreateFileRouteOptions;
  dataPlane: FilesDataPlane;
  kernel: FileKernel;
  capabilityCodec: ScopedFileCapabilityCodec;
  clock: () => Date;
  publicBasePath: string;
}

export function createRelationFileRoute(
  input: CreateRelationFileRouteInput,
): Hono {
  const binding = validateRelationBinding(input.binding);
  validateOptions(input.options);
  const state: RelationRouteState = {
    scope: createScopedRouteIdentity(input.state.audience, 'relation', {
      collection: binding.collection,
      recordField: binding.recordField,
      recordParam: binding.recordParam,
      maxFiles: binding.maxFiles,
    }),
    binding,
    repository: createRelationBindingRepository({
      database: input.state.database,
      ...(input.state.connection === undefined
        ? {}
        : { connection: input.state.connection }),
      collection: binding.collection,
      recordField: binding.recordField,
    }),
    options: input.options,
    dataPlane: input.state.dataPlane,
    kernel: input.state.kernel,
    capabilityCodec: input.state.scopedCapabilityCodec,
    clock: input.state.clock,
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
        handlePublicAccess(state, context, 'enable'),
      ),
    );
    routes.post(
      '/:fileId/public-access/reset',
      withFileRouteErrors((context) =>
        handlePublicAccess(state, context, 'reset'),
      ),
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
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'read', recordId });
  await cleanupExpired(state, recordId);
  const rows = await state.repository.list(recordId);
  const files = await state.kernel.getFiles(rows.map((row) => row.fileId));
  const filesById = new Map(
    files.flatMap((file) => (file ? [[file.id, file] as const] : [])),
  );
  return context.json<StoredFile[]>(
    rows.flatMap((row) => {
      const file = filesById.get(row.fileId);
      return file?.status === 'ready' ? [file] : [];
    }),
  );
}

async function handleCreateUpload(
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  await cleanupExpiredReservations(state, recordId);
  const body = await readJson<CreateBusinessFileRequest>(context);
  const replaceFileId = readOptionalFileId(body.replaceFileId);
  if (
    replaceFileId !== null &&
    !(await getReadyRow(state, recordId, replaceFileId))
  ) {
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

  try {
    if (replaceFileId === null) {
      const reservation = await state.repository.reserve(
        {
          id: randomBytes(32).toString('hex'),
          recordId,
          fileId: attempt.file.id,
          reservationExpiresAt: new Date(attempt.plan.expiresAt),
          now: now(state),
        },
        state.binding.maxFiles,
      );
      if (reservation.outcome === 'full') {
        throw fileLimitExceeded();
      }
    }
  } catch (error) {
    await bestEffortCancel(state, attempt.transfer);
    throw error instanceof FileRouteError ? error : storageUnavailable();
  }

  return context.json<CreateBusinessFileResponse>(
    { file: attempt.file, plan: attempt.plan },
    201,
  );
}

async function handleUpload(
  state: RelationRouteState,
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
  state: RelationRouteState,
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
  await cleanupExpired(state, recordId);
  const capability = verifyCapability(
    state.capabilityCodec,
    state.scope,
    context,
    recordId,
    fileId,
    'cancel',
  );
  await state.dataPlane.cancelUpload(capability, {
    cancel: async ({ connection }) => {
      await state.repository.cancelPending(
        recordId,
        fileId,
        capability.replaceFileId,
        connection,
      );
      return { released: true as const };
    },
  });
  return context.json<FileOperationResponse>({ success: true });
}

async function handleComplete(
  state: RelationRouteState,
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
  await cleanupExpired(state, recordId);
  const capability = verifyCapability(
    state.capabilityCodec,
    state.scope,
    context,
    recordId,
    fileId,
    'complete',
  );
  const completed = await state.dataPlane.completeUpload(capability, {
    commit: (connection) =>
      state.repository.commit(
        recordId,
        fileId,
        capability.replaceFileId,
        now(state),
        connection,
      ),
  });
  if (completed.binding?.outcome !== 'committed') {
    throw fileBindingConflict();
  }
  return context.json({ file: completed.file });
}

async function handleContent(
  state: RelationRouteState,
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
  await requireReadyFile(state, recordId, fileId);
  return state.dataPlane.createScopedContentResponse(
    fileId,
    head,
    readOptionalDisposition(context.req.query('disposition')),
  );
}

async function handleDelete(
  state: RelationRouteState,
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
  const row = await state.repository.get(recordId, fileId);
  const file = await state.kernel.getFile(fileId);
  if (
    row?.reservationExpiresAt === null &&
    file?.status === 'ready' &&
    (await state.repository.delete(recordId, fileId, false))
  ) {
    return context.json<FileOperationResponse>({ success: true });
  }
  if (row) {
    throw fileBindingConflict();
  }
  if (file?.status === 'ready') {
    if (await state.repository.hasForOtherRecord(recordId, fileId)) {
      throw fileReferenceNotFound();
    }
    return context.json<FileOperationResponse>({ success: true });
  }
  throw fileReferenceNotFound();
}

async function handlePublicAccess(
  state: RelationRouteState,
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
  await requireReadyFile(state, recordId, fileId);
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
      disposition: result.disposition,
    },
  });
}

async function handleDisablePublicAccess(
  state: RelationRouteState,
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
  await requireReadyFile(state, recordId, fileId);
  const file = await state.dataPlane.disablePublicAccess(fileId);
  return context.json({ file });
}

async function cleanupExpired(
  state: RelationRouteState,
  recordId: string,
): Promise<void> {
  await cleanupExpiredReservations(state, recordId);
}

async function cleanupExpiredReservations(
  state: RelationRouteState,
  recordId: string,
): Promise<void> {
  const expiredFileIds = await state.repository.listExpiredFileIds(
    recordId,
    now(state),
  );
  for (const fileId of expiredFileIds) {
    await state.kernel.cancelUpload(fileId, async ({ connection }) => {
      await state.repository.cancelPending(recordId, fileId, null, connection);
    });
  }
}

async function getReadyRow(
  state: RelationRouteState,
  recordId: string,
  fileId: string,
): Promise<RelationBindingRow | undefined> {
  const row = await state.repository.get(recordId, fileId);
  if (!row || row.reservationExpiresAt !== null) {
    return undefined;
  }
  const file = await state.kernel.getFile(fileId);
  return file?.status === 'ready' ? row : undefined;
}

async function requireReadyFile(
  state: RelationRouteState,
  recordId: string,
  fileId: string,
): Promise<StoredFile> {
  if (!(await getReadyRow(state, recordId, fileId))) {
    throw fileReferenceNotFound();
  }
  const file = await state.kernel.getFile(fileId);
  if (!file || file.status !== 'ready') {
    throw fileReferenceNotFound();
  }
  return file;
}

async function bestEffortCancel(
  state: RelationRouteState,
  transfer: Parameters<FilesDataPlane['cancelUpload']>[0],
): Promise<void> {
  try {
    await state.dataPlane.cancelUpload(transfer);
  } catch {
    // The failed create response does not expose the orphaned attempt.
  }
}

function validateRelationBinding(
  binding: FileRelationBinding,
): NormalizedRelationBinding {
  const collection = readConfigName(binding.collection, 'collection');
  const recordParam = readConfigName(binding.recordParam, 'recordParam');
  const recordField = readConfigName(binding.recordField, 'recordField');
  if (!Number.isSafeInteger(binding.maxFiles) || binding.maxFiles <= 0) {
    throw invalidFileRoute('File route maxFiles must be a positive integer.');
  }
  return {
    collection,
    recordField,
    recordParam,
    maxFiles: binding.maxFiles,
  };
}

function readRecordId(state: RelationRouteState, context: Context): string {
  const value = context.req.param(state.binding.recordParam);
  if (!value) {
    throw invalidFileRoute(
      `Mounted file route is missing record parameter ":${state.binding.recordParam}" for collection "${state.binding.collection}".`,
    );
  }
  return value;
}

function now(state: RelationRouteState): Date {
  const value = state.clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Files relation route clock returned an invalid date.');
  }
  return value;
}

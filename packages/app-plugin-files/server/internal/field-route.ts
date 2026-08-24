import { randomBytes } from 'node:crypto';

import type {
  ConstraintDefinition,
  InspectedCollection,
} from '@nocobase/database';
import { Hono, type Context } from 'hono';

import type {
  CancelFileUploadRequest,
  CommitFileUploadRequest,
  CreateFileUploadRequest,
  CreateFileUploadResponse,
  FileAccessRequest,
  FileAccessResponse,
  FileErrorResponse,
  FileOperationResponse,
  FileReference,
  FileReferenceResponse,
  ListFileReferencesResponse,
  PublicFileAccessRequest,
  PublicFileAccessResponse,
  StoredFile,
} from '../../protocol.js';
import type { CreateFileRouteOptions, FileFieldBinding } from '../types.js';
import {
  ExpiredFileBindingCredentialError,
  FileBindingCredentialCodec,
  InvalidFileBindingCredentialError,
} from './binding-credential.js';
import type { FilesDataPlane } from './data-plane.js';
import { FilesDataPlaneError } from './errors.js';
import {
  createFieldBindingRepository,
  type FieldBindingRepository,
} from './field-repository.js';
import type { FileKernel } from './kernel.js';
import {
  businessFileNotReady,
  businessRecordNotFound,
  expiredBindingCredential,
  fileBindingConflict,
  fileReferenceNotFound,
  FileRouteError,
  invalidBindingCredential,
  invalidFileRequest,
  invalidFileRoute,
} from './route-errors.js';
import type { FilesRuntimeServiceState } from './runtime.js';

export interface CreateFieldFileRouteInput {
  options: CreateFileRouteOptions;
  binding: FileFieldBinding;
  state: FilesRuntimeServiceState;
}

interface NormalizedFieldBinding {
  collection: InspectedCollection;
  recordField: string;
  recordParam: string;
  fileField: string;
}

interface FieldRouteState {
  routeId: string;
  binding: NormalizedFieldBinding;
  repository: FieldBindingRepository;
  options: CreateFileRouteOptions;
  dataPlane: FilesDataPlane;
  kernel: FileKernel;
  credentialCodec: FileBindingCredentialCodec;
}

type FileRouteHandler = (context: Context) => Promise<Response>;

export function createFieldFileRoute(input: CreateFieldFileRouteInput): Hono {
  const binding = validateFieldBinding(input.binding, input.state);
  validateOptions(input.options);
  const state: FieldRouteState = {
    routeId: randomBytes(16).toString('hex'),
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
    credentialCodec: input.state.bindingCredentialCodec,
  };
  const routes = new Hono();

  routes.get(
    '/',
    withFileRouteErrors((context) => handleList(state, context)),
  );
  routes.post(
    '/uploads',
    withFileRouteErrors((context) => handleCreateUpload(state, context)),
  );
  routes.post(
    '/uploads/:fileId/commit',
    withFileRouteErrors((context) => handleCommit(state, context)),
  );
  routes.delete(
    '/uploads/:fileId',
    withFileRouteErrors((context) => handleCancel(state, context)),
  );
  routes.post(
    '/:referenceId/access',
    withFileRouteErrors((context) => handleAccess(state, context)),
  );
  routes.delete(
    '/:referenceId',
    withFileRouteErrors((context) => handleDetach(state, context)),
  );

  if (input.options.publicAccess && input.state.publicAccessEnabled) {
    routes.post(
      '/:referenceId/public-access',
      withFileRouteErrors((context) =>
        handleEnablePublicAccess(state, context),
      ),
    );
    routes.post(
      '/:referenceId/public-access/reset',
      withFileRouteErrors((context) => handleResetPublicAccess(state, context)),
    );
    routes.delete(
      '/:referenceId/public-access',
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
    return context.json<ListFileReferencesResponse>({ references: [] });
  }
  const reference = await getReadyReference(state, snapshot.fileId, false);
  return context.json<ListFileReferencesResponse>({
    references: reference ? [reference] : [],
  });
}

async function handleCreateUpload(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  const body = await readJson<CreateFileUploadRequest>(context);
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  const replaceReferenceId = readOptionalFileId(body.replaceReferenceId);
  if (replaceReferenceId !== snapshot.fileId) {
    throw fileBindingConflict();
  }
  const attempt = await state.dataPlane.createUploadAttempt({
    name: readRequiredString(body.name, 'name'),
    size: readFileSize(body.size),
    ...(body.contentType === undefined
      ? {}
      : { contentType: readRequiredString(body.contentType, 'contentType') }),
    ...(state.options.constraints === undefined
      ? {}
      : { constraints: state.options.constraints }),
  });
  const bindingCredential = state.credentialCodec.issue({
    routeId: state.routeId,
    recordId,
    fileId: attempt.plan.fileId,
    replaceReferenceId,
    candidateKey: attempt.candidateKey,
    expiresAt: new Date(attempt.plan.expiresAt).getTime(),
  });
  return context.json<CreateFileUploadResponse>(
    {
      upload: {
        file: attempt.file,
        plan: attempt.plan,
        bindingCredential,
      },
    },
    201,
  );
}

async function handleCommit(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  const fileId = readRouteFileId(context, 'fileId');
  const body = await readJson<CommitFileUploadRequest>(context);
  const credential = verifyCredential(
    state,
    recordId,
    fileId,
    body.bindingCredential,
  );
  const file = await state.kernel.getFile(fileId);
  if (!file) {
    throw fileReferenceNotFound();
  }
  if (file.status !== 'ready') {
    throw businessFileNotReady();
  }

  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  if (snapshot.fileId !== fileId) {
    const updated = await state.repository.compareAndSet(
      recordId,
      credential.replaceReferenceId,
      fileId,
    );
    if (!updated) {
      const winner = await state.repository.get(recordId);
      if (!winner.recordExists) {
        throw businessRecordNotFound();
      }
      if (winner.fileId !== fileId) {
        throw fileBindingConflict();
      }
    }
  }
  return context.json<FileReferenceResponse>({
    reference: toReference(file),
  });
}

async function handleCancel(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  const fileId = readRouteFileId(context, 'fileId');
  const body = await readJson<CancelFileUploadRequest>(context);
  const credential = verifyCredential(
    state,
    recordId,
    fileId,
    body.bindingCredential,
  );
  await state.kernel.cancelUpload(fileId, credential.candidateKey);
  return context.json<FileOperationResponse>({ success: true });
}

async function handleAccess(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'read', recordId });
  const referenceId = readRouteFileId(context, 'referenceId');
  await requireCurrentReference(state, recordId, referenceId);
  const body = await readOptionalJson<FileAccessRequest>(context);
  const disposition = readDisposition(body?.disposition);
  const access = await state.dataPlane.createReadAccess(
    referenceId,
    disposition,
  );
  return context.json<FileAccessResponse>({
    access: { ...access, disposition },
  });
}

async function handleDetach(
  state: FieldRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  const referenceId = readRouteFileId(context, 'referenceId');
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  if (snapshot.fileId !== referenceId) {
    throw fileBindingConflict();
  }
  if (!(await state.repository.compareAndSet(recordId, referenceId, null))) {
    throw fileBindingConflict();
  }
  return context.json<FileOperationResponse>({ success: true });
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
  await state.options.authorize({ context, action: 'share', recordId });
  const referenceId = readRouteFileId(context, 'referenceId');
  await requireCurrentReference(state, recordId, referenceId);
  const file = await state.dataPlane.disablePublicAccess(referenceId);
  return context.json<FileReferenceResponse>({
    reference: toReference(file),
  });
}

async function handlePublicAccess(
  state: FieldRouteState,
  context: Context,
  operation: 'enable' | 'reset',
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'share', recordId });
  const referenceId = readRouteFileId(context, 'referenceId');
  await requireCurrentReference(state, recordId, referenceId);
  const body = await readOptionalJson<PublicFileAccessRequest>(context);
  const disposition = readDisposition(body?.disposition);
  const result =
    operation === 'enable'
      ? await state.dataPlane.enablePublicAccess(referenceId, disposition)
      : await state.dataPlane.resetPublicAccess(referenceId, disposition);
  return context.json<PublicFileAccessResponse>({
    reference: toReference(result.file),
    access: {
      url: result.url,
      token: result.token,
      disposition: result.disposition,
    },
  });
}

async function requireCurrentReference(
  state: FieldRouteState,
  recordId: string,
  referenceId: string,
): Promise<FileReference> {
  const snapshot = await state.repository.get(recordId);
  if (!snapshot.recordExists) {
    throw businessRecordNotFound();
  }
  if (snapshot.fileId !== referenceId) {
    throw fileReferenceNotFound();
  }
  const reference = await getReadyReference(state, referenceId, true);
  if (!reference) {
    throw fileReferenceNotFound();
  }
  return reference;
}

async function getReadyReference(
  state: FieldRouteState,
  fileId: string,
  required: boolean,
): Promise<FileReference | undefined> {
  const file = await state.kernel.getFile(fileId);
  if (!file || file.status !== 'ready') {
    if (required) {
      throw fileReferenceNotFound();
    }
    return undefined;
  }
  return toReference(file);
}

function toReference(file: StoredFile): FileReference {
  return { referenceId: file.id, file };
}

function verifyCredential(
  state: FieldRouteState,
  recordId: string,
  fileId: string,
  value: unknown,
): ReturnType<FileBindingCredentialCodec['verify']> {
  if (typeof value !== 'string' || !value) {
    throw invalidBindingCredential();
  }
  try {
    return state.credentialCodec.verify(
      { routeId: state.routeId, recordId, fileId },
      value,
    );
  } catch (error) {
    if (error instanceof ExpiredFileBindingCredentialError) {
      throw expiredBindingCredential();
    }
    if (error instanceof InvalidFileBindingCredentialError) {
      throw invalidBindingCredential();
    }
    throw error;
  }
}

function validateFieldBinding(
  binding: FileFieldBinding,
  state: FilesRuntimeServiceState,
): NormalizedFieldBinding {
  const collectionName = readConfigName(binding.collection, 'collection');
  const recordParam = readConfigName(binding.recordParam, 'recordParam');
  const fileField = readConfigName(binding.fileField, 'fileField');
  let collection: InspectedCollection | undefined;
  let files: InspectedCollection | undefined;
  try {
    collection = state.database
      .builder(state.connection)
      .inspectCollection(collectionName);
    files = state.database.builder(state.connection).inspectCollection('files');
  } catch (_error) {
    throw invalidFileRoute(
      `Collection "${collectionName}" cannot be inspected for a file route.`,
    );
  }
  if (!collection) {
    throw invalidFileRoute(`Collection "${collectionName}" does not exist.`);
  }
  if (!files) {
    throw invalidFileRoute('Collection "files" does not exist.');
  }
  const field = findField(collection, fileField);
  const filesId = findField(files, 'id');
  if (!field) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${fileField}" does not exist.`,
    );
  }
  if (
    field.definition.type !== 'string' ||
    field.definition.length !== 64 ||
    field.definition.nullable === false
  ) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${fileField}" must be nullable string(64).`,
    );
  }
  if (
    !filesId ||
    filesId.definition.type !== 'string' ||
    filesId.definition.length !== 64
  ) {
    throw invalidFileRoute('Collection "files" field "id" must be string(64).');
  }
  if (!hasRestrictFilesForeignKey(collection, fileField)) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${fileField}" must reference files.id with ON DELETE RESTRICT.`,
    );
  }
  const recordField = findPrimaryField(collection);
  if (!recordField) {
    throw invalidFileRoute(
      `Collection "${collectionName}" must have one primary key field for recordParam "${recordParam}".`,
    );
  }
  return {
    collection,
    recordField,
    recordParam,
    fileField,
  };
}

function validateOptions(options: CreateFileRouteOptions): void {
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

function findField(collection: InspectedCollection, name: string) {
  return collection.fields.find((field) => field.definition.name === name);
}

function findPrimaryField(collection: InspectedCollection): string | undefined {
  const direct = collection.fields.filter(
    (field) => field.definition.primaryKey === true,
  );
  const constraints = (collection.definition.constraints ?? []).filter(
    (
      constraint,
    ): constraint is Extract<ConstraintDefinition, { type: 'primary' }> =>
      constraint.type === 'primary',
  );
  const names = new Set([
    ...direct.map((field) => field.definition.name),
    ...constraints.flatMap((constraint) => constraint.fields),
  ]);
  return names.size === 1 ? [...names][0] : undefined;
}

function hasRestrictFilesForeignKey(
  collection: InspectedCollection,
  fileField: string,
): boolean {
  return (collection.definition.constraints ?? []).some(
    (constraint) =>
      constraint.type === 'foreignKey' &&
      constraint.fields.length === 1 &&
      constraint.fields[0] === fileField &&
      constraint.references.collection === 'files' &&
      (constraint.references.fields ?? ['id']).length === 1 &&
      (constraint.references.fields ?? ['id'])[0] === 'id' &&
      constraint.onDelete === 'restrict',
  );
}

function readRecordId(state: FieldRouteState, context: Context): string {
  const value = context.req.param(state.binding.recordParam);
  if (!value) {
    throw invalidFileRoute(
      `Mounted file route is missing record parameter ":${state.binding.recordParam}" for collection "${state.binding.collection.definition.name}".`,
    );
  }
  return value;
}

function readRouteFileId(context: Context, parameter: string): string {
  const value = context.req.param(parameter);
  if (!value || value.length > 64) {
    throw invalidFileRequest(`Route parameter "${parameter}" is invalid.`);
  }
  return value;
}

function readOptionalFileId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw invalidFileRequest('replaceReferenceId is invalid.');
  }
  return value;
}

function readConfigName(value: string, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw invalidFileRoute(`File route ${field} is invalid.`);
  }
  return normalized;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidFileRequest(`Request field "${field}" is required.`);
  }
  return value;
}

function readFileSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw invalidFileRequest('Request field "size" is invalid.');
  }
  return Number(value);
}

function readDisposition(value: unknown): 'inline' | 'attachment' {
  if (value === undefined) {
    return 'attachment';
  }
  if (value === 'inline' || value === 'attachment') {
    return value;
  }
  throw invalidFileRequest('Request field "disposition" is invalid.');
}

async function readJson<T>(context: Context): Promise<T> {
  try {
    return await context.req.json<T>();
  } catch (_error) {
    throw invalidFileRequest('The request body must be valid JSON.');
  }
}

async function readOptionalJson<T>(context: Context): Promise<T | undefined> {
  const contentType = context.req.header('content-type');
  if (!contentType?.toLowerCase().includes('application/json')) {
    return undefined;
  }
  return readJson<T>(context);
}

function withFileRouteErrors(handler: FileRouteHandler): FileRouteHandler {
  return async (context) => {
    try {
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

import { randomBytes } from 'node:crypto';

import type {
  ConstraintDefinition,
  InspectedCollection,
} from '@nocobase/database';
import { Hono, type Context } from 'hono';

import type {
  CommitBusinessFileRequest,
  CreateBusinessFileRequest,
  CreateBusinessFileResponse,
  DeleteBusinessFileRequest,
  FileAccessRequest,
  FileAccessResponse,
  FileErrorResponse,
  FileOperationResponse,
  FileReference,
  ListFileReferencesResponse,
  PublicFileAccessRequest,
  PublicFileAccessResponse,
  StoredFile,
} from '../../protocol.js';
import type { CreateFileRouteOptions, FileRelationBinding } from '../types.js';
import {
  ExpiredFileBindingCredentialError,
  FileBindingCredentialCodec,
  InvalidFileBindingCredentialError,
} from './binding-credential.js';
import type { FilesDataPlane } from './data-plane.js';
import { FilesDataPlaneError } from './errors.js';
import type { FileKernel } from './kernel.js';
import {
  businessFileNotReady,
  businessRecordNotFound,
  expiredBindingCredential,
  fileBindingConflict,
  fileLimitExceeded,
  fileReferenceNotFound,
  FileRouteError,
  invalidBindingCredential,
  invalidFileRequest,
  invalidFileRoute,
} from './route-errors.js';
import {
  createRelationBindingRepository,
  type RelationBindingRepository,
  type RelationBindingRow,
} from './relation-repository.js';
import type { FilesRuntimeServiceState } from './runtime.js';

export interface CreateRelationFileRouteInput {
  options: CreateFileRouteOptions;
  binding: FileRelationBinding;
  state: FilesRuntimeServiceState;
}

interface NormalizedRelationBinding {
  collection: InspectedCollection;
  parentCollection: InspectedCollection;
  parentField: string;
  recordField: string;
  recordParam: string;
  maxFiles: number;
}

interface RelationRouteState {
  routeId: string;
  binding: NormalizedRelationBinding;
  repository: RelationBindingRepository;
  options: CreateFileRouteOptions;
  dataPlane: FilesDataPlane;
  kernel: FileKernel;
  credentialCodec: FileBindingCredentialCodec;
  clock: () => Date;
}

type FileRouteHandler = (context: Context) => Promise<Response>;

export function createRelationFileRoute(
  input: CreateRelationFileRouteInput,
): Hono {
  const binding = validateRelationBinding(input.binding, input.state);
  validateOptions(input.options);
  const state: RelationRouteState = {
    routeId: randomBytes(16).toString('hex'),
    binding,
    repository: createRelationBindingRepository({
      database: input.state.database,
      ...(input.state.connection === undefined
        ? {}
        : { connection: input.state.connection }),
      collection: binding.collection,
      parentCollection: binding.parentCollection,
      parentField: binding.parentField,
      recordField: binding.recordField,
    }),
    options: input.options,
    dataPlane: input.state.dataPlane,
    kernel: input.state.kernel,
    credentialCodec: input.state.bindingCredentialCodec,
    clock: input.state.clock,
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
  routes.post(
    '/:fileId/commit',
    withFileRouteErrors((context) => handleCommit(state, context)),
  );
  routes.delete(
    '/:fileId',
    withFileRouteErrors((context) => handleDelete(state, context)),
  );
  routes.post(
    '/:fileId/access',
    withFileRouteErrors((context) => handleAccess(state, context)),
  );

  if (input.options.publicAccess && input.state.publicAccessEnabled) {
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
  if (!(await state.repository.parentExists(recordId))) {
    throw businessRecordNotFound();
  }
  const rows = await state.repository.list(recordId);
  const files = await state.kernel.getFiles(rows.map((row) => row.fileId));
  const filesById = new Map(files.map((file) => [file.id, file]));
  const references = rows.flatMap((row) => {
    const file = filesById.get(row.fileId);
    return file?.status === 'ready' ? [toReference(file, row.slot)] : [];
  });
  return context.json<ListFileReferencesResponse>({ references });
}

async function handleCreateUpload(
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  await cleanupExpired(state, recordId);
  const body = await readJson<CreateBusinessFileRequest>(context);
  const replaceFileId = readOptionalFileId(body.replaceFileId);
  if (!(await state.repository.parentExists(recordId))) {
    throw businessRecordNotFound();
  }
  if (replaceFileId !== null) {
    const current = await getReadyRow(state, recordId, replaceFileId);
    if (!current) {
      throw fileBindingConflict();
    }
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
  const expiresAt = new Date(attempt.plan.expiresAt);
  try {
    if (replaceFileId === null) {
      const reservation = await state.repository.reserve(
        {
          id: randomBytes(32).toString('hex'),
          recordId,
          fileId: attempt.plan.fileId,
          reservationExpiresAt: expiresAt,
          now: now(state),
        },
        state.binding.maxFiles,
      );
      if (reservation.outcome === 'record-missing') {
        throw businessRecordNotFound();
      }
      if (reservation.outcome === 'full') {
        throw fileLimitExceeded();
      }
    }
  } catch (error) {
    await bestEffortCancel(state, attempt.plan.fileId, attempt.candidateKey);
    throw error;
  }
  const bindingCredential = state.credentialCodec.issue({
    routeId: state.routeId,
    recordId,
    fileId: attempt.plan.fileId,
    replaceFileId,
    candidateKey: attempt.candidateKey,
    expiresAt: expiresAt.getTime(),
  });
  return context.json<CreateBusinessFileResponse>(
    {
      file: attempt.file,
      uploadPlan: attempt.plan,
      bindingCredential,
    },
    201,
  );
}

async function handleCommit(
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  await cleanupExpired(state, recordId);
  const fileId = readRouteFileId(context, 'fileId');
  const body = await readJson<CommitBusinessFileRequest>(context);
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
  const result = await state.repository.commit(
    recordId,
    fileId,
    credential.replaceFileId,
    now(state),
  );
  if (result.outcome === 'record-missing') {
    throw businessRecordNotFound();
  }
  if (result.outcome === 'conflict') {
    throw fileBindingConflict();
  }
  return context.json<FileReference>(toReference(file, result.row.slot));
}

async function handleDelete(
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'write', recordId });
  await cleanupExpired(state, recordId);
  if (!(await state.repository.parentExists(recordId))) {
    throw businessRecordNotFound();
  }
  const fileId = readRouteFileId(context, 'fileId');
  const body = await readOptionalJson<DeleteBusinessFileRequest>(context);
  const row = await state.repository.get(recordId, fileId);
  const file = await state.kernel.getFile(fileId);
  if (
    row?.reservationExpiresAt === null &&
    file?.status === 'ready' &&
    (await state.repository.delete(recordId, fileId, false))
  ) {
    return context.json<FileOperationResponse>({ success: true });
  }
  if (body?.bindingCredential !== undefined) {
    const credential = verifyCredential(
      state,
      recordId,
      fileId,
      body.bindingCredential,
    );
    await state.repository.cancelPending(
      recordId,
      fileId,
      credential.replaceFileId,
    );
    await bestEffortCancel(state, fileId, credential.candidateKey);
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
  throw fileBindingConflict();
}

async function handleAccess(
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'read', recordId });
  const fileId = readRouteFileId(context, 'fileId');
  await requireReadyReference(state, recordId, fileId);
  const body = await readOptionalJson<FileAccessRequest>(context);
  const disposition = readDisposition(body?.disposition);
  const access = await state.dataPlane.createReadAccess(fileId, disposition);
  return context.json<FileAccessResponse>({
    access: { ...access, disposition },
  });
}

async function handlePublicAccess(
  state: RelationRouteState,
  context: Context,
  operation: 'enable' | 'reset',
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'share', recordId });
  const fileId = readRouteFileId(context, 'fileId');
  const reference = await requireReadyReference(state, recordId, fileId);
  const body = await readOptionalJson<PublicFileAccessRequest>(context);
  const disposition = readDisposition(body?.disposition);
  const result =
    operation === 'enable'
      ? await state.dataPlane.enablePublicAccess(fileId, disposition)
      : await state.dataPlane.resetPublicAccess(fileId, disposition);
  return context.json<PublicFileAccessResponse>({
    reference: toReference(result.file, readReferenceSlot(reference)),
    access: {
      url: result.url,
      token: result.token,
      disposition: result.disposition,
    },
  });
}

async function handleDisablePublicAccess(
  state: RelationRouteState,
  context: Context,
): Promise<Response> {
  const recordId = readRecordId(state, context);
  await state.options.authorize({ context, action: 'share', recordId });
  const fileId = readRouteFileId(context, 'fileId');
  const reference = await requireReadyReference(state, recordId, fileId);
  const file = await state.dataPlane.disablePublicAccess(fileId);
  return context.json<FileReference>(
    toReference(file, readReferenceSlot(reference)),
  );
}

async function cleanupExpired(
  state: RelationRouteState,
  recordId: string,
): Promise<void> {
  await state.repository.cleanupExpired(recordId, now(state));
}

async function getReadyRow(
  state: RelationRouteState,
  recordId: string,
  fileId: string,
): Promise<RelationBindingRow | undefined> {
  const row = await state.repository.get(recordId, fileId);
  if (!row) {
    return undefined;
  }
  if (row.reservationExpiresAt !== null) {
    return undefined;
  }
  const file = await state.kernel.getFile(fileId);
  return file?.status === 'ready' ? row : undefined;
}

async function requireReadyReference(
  state: RelationRouteState,
  recordId: string,
  fileId: string,
): Promise<FileReference> {
  const row = await getReadyRow(state, recordId, fileId);
  if (!row) {
    throw fileReferenceNotFound();
  }
  const file = await state.kernel.getFile(fileId);
  if (!file || file.status !== 'ready') {
    throw fileReferenceNotFound();
  }
  return toReference(file, row.slot);
}

async function bestEffortCancel(
  state: RelationRouteState,
  fileId: string,
  candidateKey: string,
): Promise<void> {
  try {
    await state.kernel.cancelUpload(fileId, candidateKey);
  } catch {
    // The business reservation has already been released.
  }
}

function toReference(file: StoredFile, slot: number): FileReference {
  return { file, slot };
}

function verifyCredential(
  state: RelationRouteState,
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

function validateRelationBinding(
  binding: FileRelationBinding,
  state: FilesRuntimeServiceState,
): NormalizedRelationBinding {
  const collectionName = readConfigName(binding.collection, 'collection');
  const recordParam = readConfigName(binding.recordParam, 'recordParam');
  const recordField = readConfigName(binding.recordField, 'recordField');
  if (!Number.isSafeInteger(binding.maxFiles) || binding.maxFiles <= 0) {
    throw invalidFileRoute('File route maxFiles must be a positive integer.');
  }
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
  requireField(collection, 'id', 'string', false, 64);
  requireField(collection, 'fileId', 'string', false, 64);
  requireField(collection, 'slot', 'integer', false);
  requireField(collection, 'reservationExpiresAt', 'datetime', true);
  requireField(collection, 'createdAt', 'datetime', false);
  requireField(collection, 'updatedAt', 'datetime', false);
  if (!hasSinglePrimaryKey(collection, 'id')) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "id" must be the sole primary key.`,
    );
  }
  const filesId = findField(files, 'id');
  if (
    !filesId ||
    isRelationField(filesId.definition) ||
    filesId.definition.type !== 'string' ||
    filesId.definition.length !== 64
  ) {
    throw invalidFileRoute('Collection "files" field "id" must be string(64).');
  }
  const record = findField(collection, recordField);
  if (!record || isRelationField(record.definition)) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${recordField}" does not exist or is not scalar.`,
    );
  }
  if (record.definition.nullable !== false) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${recordField}" must be non-nullable.`,
    );
  }
  if (!hasRestrictFilesForeignKey(collection)) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "fileId" must reference files.id with ON DELETE RESTRICT.`,
    );
  }
  if (!hasRecordSlotUnique(collection, recordField)) {
    throw invalidFileRoute(
      `Collection "${collectionName}" must have a unique constraint on (${recordField}, slot).`,
    );
  }
  const parentReference = findRecordForeignKey(collection, recordField);
  if (!parentReference) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${recordField}" must reference a parent record.`,
    );
  }
  const parentCollection = state.database
    .builder(state.connection)
    .inspectCollection(parentReference.collection);
  if (!parentCollection) {
    throw invalidFileRoute(
      `Relation parent collection "${parentReference.collection}" does not exist.`,
    );
  }
  const parentField = findField(parentCollection, parentReference.field);
  if (
    !parentField ||
    isRelationField(parentField.definition) ||
    !hasSinglePrimaryKey(parentCollection, parentReference.field) ||
    parentField.definition.type !== record.definition.type ||
    parentField.definition.length !== record.definition.length
  ) {
    throw invalidFileRoute(
      `Collection "${collectionName}" field "${recordField}" must match its parent record ID type.`,
    );
  }
  return {
    collection,
    parentCollection,
    parentField: parentReference.field,
    recordField,
    recordParam,
    maxFiles: binding.maxFiles,
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

function requireField(
  collection: InspectedCollection,
  name: string,
  type: string,
  nullable: boolean,
  length?: number,
): void {
  const field = findField(collection, name);
  if (
    !field ||
    isRelationField(field.definition) ||
    field.definition.type !== type ||
    field.definition.nullable !== nullable ||
    (length !== undefined && field.definition.length !== length)
  ) {
    throw invalidFileRoute(
      `Collection "${collection.definition.name ?? collection.tableName}" field "${name}" has an invalid relation binding type.`,
    );
  }
}

function findField(collection: InspectedCollection, name: string) {
  return collection.fields.find((field) => field.definition.name === name);
}

function isRelationField(
  definition: InspectedCollection['fields'][number]['definition'],
): boolean {
  return ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(
    definition.type,
  );
}

function hasRestrictFilesForeignKey(collection: InspectedCollection): boolean {
  return (collection.definition.constraints ?? []).some(
    (constraint) =>
      constraint.type === 'foreignKey' &&
      constraint.fields.length === 1 &&
      constraint.fields[0] === 'fileId' &&
      constraint.references.collection === 'files' &&
      (constraint.references.fields ?? ['id']).length === 1 &&
      (constraint.references.fields ?? ['id'])[0] === 'id' &&
      constraint.onDelete === 'restrict',
  );
}

function hasSinglePrimaryKey(
  collection: InspectedCollection,
  fieldName: string,
): boolean {
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
  return names.size === 1 && names.has(fieldName);
}

function hasRecordSlotUnique(
  collection: InspectedCollection,
  recordField: string,
): boolean {
  return (collection.definition.constraints ?? []).some(
    (constraint) =>
      constraint.type === 'unique' &&
      constraint.fields.length === 2 &&
      constraint.fields[0] === recordField &&
      constraint.fields[1] === 'slot',
  );
}

function findRecordForeignKey(
  collection: InspectedCollection,
  recordField: string,
): { collection: string; field: string } | undefined {
  const constraint = (collection.definition.constraints ?? []).find(
    (
      candidate,
    ): candidate is Extract<ConstraintDefinition, { type: 'foreignKey' }> =>
      candidate.type === 'foreignKey' &&
      candidate.fields.length === 1 &&
      candidate.fields[0] === recordField &&
      (candidate.references.fields ?? ['id']).length === 1,
  );
  return constraint
    ? {
        collection: constraint.references.collection,
        field: (constraint.references.fields ?? ['id'])[0] ?? 'id',
      }
    : undefined;
}

function readRecordId(state: RelationRouteState, context: Context): string {
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
    throw invalidFileRequest('replaceFileId is invalid.');
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

function readReferenceSlot(reference: FileReference): number {
  if (!Number.isSafeInteger(reference.slot) || Number(reference.slot) <= 0) {
    throw new Error('A relation file reference is missing its slot.');
  }
  return Number(reference.slot);
}

function now(state: RelationRouteState): Date {
  const value = state.clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Files relation route clock returned an invalid date.');
  }
  return value;
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

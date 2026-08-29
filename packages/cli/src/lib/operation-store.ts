import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SECRET_KEY_PATTERN = /token|secret|password|authorization|credential/i;
const COMPLETED_OPERATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const ABANDONED_OPERATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type OperationKind = 'app-deploy' | 'app-publish';

export interface OperationArtifact {
  readonly path: string;
  readonly checksum: string;
}

export interface OperationRelease {
  readonly version: string;
  readonly checksum: string;
  readonly sizeBytes: number;
  readonly archiveChecksum: string;
  readonly archiveSizeBytes: number;
  readonly manifest: Readonly<Record<string, unknown>>;
}

export interface OperationDeployment {
  readonly id: string;
  readonly applicationId: string;
  readonly targetReleaseId: string;
  readonly type: string;
  readonly status: string;
}

/**
 * Non-secret command parameters that define the meaning of a resumable
 * operation. Values are intentionally strings so the journal stays a small,
 * deterministic JSON record and never persists credentials or source data.
 */
export type OperationParameters = Readonly<Record<string, string>>;

export interface OperationJournal {
  readonly kind: OperationKind;
  readonly operationId: string;
  readonly hubUrl: string;
  readonly idempotencyKey: string;
  readonly step: string;
  readonly parameters?: OperationParameters;
  readonly resourceIds?: Readonly<Record<string, string>>;
  readonly artifact?: OperationArtifact;
  readonly release?: OperationRelease;
  readonly deployment?: OperationDeployment;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateOperationInput {
  readonly kind: OperationKind;
  readonly operationId: string;
  readonly hubUrl: string;
  readonly idempotencyKey: string;
  readonly step: string;
  readonly parameters?: OperationParameters;
  readonly resourceIds?: Readonly<Record<string, string>>;
  readonly artifact?: OperationArtifact;
  readonly release?: OperationRelease;
  readonly deployment?: OperationDeployment;
}

export interface OperationStoreOptions {
  readonly root?: string;
  readonly now?: () => Date;
}

export interface PruneExpiredOperationsResult {
  readonly pruned: number;
}

export type LocalOperationErrorCode =
  | 'LOCAL_OPERATION_ARTIFACT_CHANGED'
  | 'LOCAL_OPERATION_ARTIFACT_MISSING'
  | 'LOCAL_OPERATION_ARTIFACT_UNSAFE'
  | 'LOCAL_OPERATION_INVALID'
  | 'LOCAL_OPERATION_NOT_FOUND'
  | 'LOCAL_OPERATION_SECRET_REJECTED';

export class LocalOperationError extends Error {
  readonly code: LocalOperationErrorCode;

  constructor(code: LocalOperationErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'LocalOperationError';
    this.code = code;
  }
}

export function resolveCliRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.NOCOBASE_CLI_ROOT?.trim() || env.NB3_CLI_ROOT?.trim();
  return path.resolve(override || path.join(os.homedir(), '.nocobase'));
}

export async function createOperation(
  input: CreateOperationInput,
  options: OperationStoreOptions = {},
): Promise<OperationJournal> {
  assertNoSecretFields(input);
  const existing = await loadOperation(input.operationId, options);
  if (existing) {
    if (
      existing.kind !== input.kind ||
      existing.hubUrl !== input.hubUrl ||
      existing.idempotencyKey !== input.idempotencyKey
    ) {
      throw new LocalOperationError(
        'LOCAL_OPERATION_INVALID',
        `Operation "${input.operationId}" belongs to a different Hub request. Use a new operation ID.`,
      );
    }
    if (!sameParameters(existing.parameters, input.parameters)) {
      throw new LocalOperationError(
        'LOCAL_OPERATION_INVALID',
        `Operation "${input.operationId}" belongs to different command parameters. Use a new operation ID.`,
      );
    }
    return existing;
  }
  await pruneExpiredOperations(options).catch(() => undefined);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const journal: OperationJournal = validateJournal({
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await writeJournal(journal, options);
  return journal;
}

function sameParameters(
  left: OperationParameters | undefined,
  right: OperationParameters | undefined,
): boolean {
  if (!left || !right) return left === right;
  const leftEntries = Object.entries(left).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const rightEntries = Object.entries(right).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([key, value], index) =>
        key === rightEntries[index]?.[0] && value === rightEntries[index]?.[1],
    )
  );
}

export async function pruneExpiredOperations(
  options: OperationStoreOptions = {},
): Promise<PruneExpiredOperationsResult> {
  const operationsDirectory = path.join(storeRoot(options), 'operations');
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(operationsDirectory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return { pruned: 0 };
    throw error;
  }
  const now = (options.now ?? (() => new Date()))().getTime();
  let pruned = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const operationId = entry.name.slice(0, -'.json'.length);
    if (!OPERATION_ID_PATTERN.test(operationId)) continue;
    let journal: OperationJournal;
    try {
      journal = validateJournal(
        JSON.parse(
          await readFile(path.join(operationsDirectory, entry.name), 'utf8'),
        ),
      );
    } catch {
      continue;
    }
    const retention =
      journal.step === 'completed'
        ? COMPLETED_OPERATION_RETENTION_MS
        : ABANDONED_OPERATION_RETENTION_MS;
    if (new Date(journal.updatedAt).getTime() > now - retention) {
      continue;
    }
    await rm(path.join(operationsDirectory, entry.name), { force: true });
    await rm(path.dirname(controlledArtifactPath(operationId, options)), {
      force: true,
      recursive: true,
    });
    pruned += 1;
  }
  return { pruned };
}

export async function loadOperation(
  operationId: string,
  options: OperationStoreOptions = {},
): Promise<OperationJournal | undefined> {
  const journalPath = operationJournalPath(operationId, options);
  let raw: string;
  try {
    raw = await readFile(journalPath, 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new LocalOperationError(
      'LOCAL_OPERATION_INVALID',
      `Operation journal "${operationId}" could not be read.`,
      error,
    );
  }

  try {
    return validateJournal(JSON.parse(raw));
  } catch (error) {
    if (error instanceof LocalOperationError) throw error;
    throw new LocalOperationError(
      'LOCAL_OPERATION_INVALID',
      `Operation journal "${operationId}" is invalid.`,
      error,
    );
  }
}

export async function updateOperation(
  operationId: string,
  updater: (operation: OperationJournal) => OperationJournal,
  options: OperationStoreOptions = {},
): Promise<OperationJournal> {
  const current = await loadOperation(operationId, options);
  if (!current) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_NOT_FOUND',
      `Operation journal "${operationId}" was not found.`,
    );
  }
  const updated = validateJournal({
    ...updater(current),
    operationId: current.operationId,
    hubUrl: current.hubUrl,
    idempotencyKey: current.idempotencyKey,
    createdAt: current.createdAt,
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
  });
  await writeJournal(updated, options);
  return updated;
}

export async function cacheOperationArtifact(
  operationId: string,
  sourcePath: string,
  checksum: string,
  options: OperationStoreOptions = {},
): Promise<OperationArtifact> {
  const current = await loadOperation(operationId, options);
  if (!current) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_NOT_FOUND',
      `Operation journal "${operationId}" was not found.`,
    );
  }
  requireChecksum(checksum);
  await assertRegularFile(sourcePath, 'LOCAL_OPERATION_ARTIFACT_MISSING');
  const actual = await sha256File(sourcePath);
  if (actual !== checksum) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_ARTIFACT_CHANGED',
      'The release archive changed before it could be cached. Start a new operation and publish again.',
    );
  }

  const destination = controlledArtifactPath(operationId, options);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(destination), 0o700);
  const temporaryPath = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await pipeline(
      createReadStream(sourcePath),
      createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
    );
    if ((await sha256File(temporaryPath)) !== checksum) {
      throw new LocalOperationError(
        'LOCAL_OPERATION_ARTIFACT_CHANGED',
        'The release archive changed while it was cached. Start a new operation and publish again.',
      );
    }
    await rename(temporaryPath, destination);
    await chmod(destination, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  const artifact: OperationArtifact = { path: destination, checksum };
  await updateOperation(
    operationId,
    (operation) => ({ ...operation, artifact }),
    options,
  );
  return artifact;
}

export async function verifyCachedOperationArtifact(
  operationId: string,
  options: OperationStoreOptions = {},
): Promise<OperationArtifact> {
  const operation = await loadOperation(operationId, options);
  if (!operation) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_NOT_FOUND',
      `Operation journal "${operationId}" was not found.`,
    );
  }
  if (!operation.artifact) {
    throw artifactMissing();
  }
  const expectedPath = controlledArtifactPath(operationId, options);
  if (path.resolve(operation.artifact.path) !== expectedPath) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_ARTIFACT_UNSAFE',
      'The operation journal references an artifact outside the controlled cache. Start a new operation and publish again.',
    );
  }
  await assertRegularFile(expectedPath, 'LOCAL_OPERATION_ARTIFACT_MISSING');
  if ((await sha256File(expectedPath)) !== operation.artifact.checksum) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_ARTIFACT_CHANGED',
      'The cached release archive no longer matches this operation. Start a new operation and publish again.',
    );
  }
  return operation.artifact;
}

function operationJournalPath(
  operationId: string,
  options: OperationStoreOptions,
): string {
  assertOperationId(operationId);
  return path.join(storeRoot(options), 'operations', `${operationId}.json`);
}

function controlledArtifactPath(
  operationId: string,
  options: OperationStoreOptions,
): string {
  assertOperationId(operationId);
  return path.join(
    storeRoot(options),
    'operation-cache',
    operationId,
    'release.tar.gz',
  );
}

function storeRoot(options: OperationStoreOptions): string {
  return path.resolve(options.root ?? resolveCliRoot());
}

async function writeJournal(
  journal: OperationJournal,
  options: OperationStoreOptions,
): Promise<void> {
  assertNoSecretFields(journal);
  if (
    journal.artifact &&
    path.resolve(journal.artifact.path) !==
      controlledArtifactPath(journal.operationId, options)
  ) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_ARTIFACT_UNSAFE',
      'Operation artifacts must stay inside the controlled cache.',
    );
  }
  const target = operationJournalPath(journal.operationId, options);
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporaryPath = `${target}.tmp-${process.pid}-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, target);
    await chmod(target, 0o600);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
  }
}

function validateJournal(value: unknown): OperationJournal {
  assertNoSecretFields(value);
  if (!isRecord(value)) throw invalidJournal();
  const operationId = requireText(value.operationId, 'operationId');
  assertOperationId(operationId);
  const resourceIds = validateResourceIds(value.resourceIds);
  const parameters = validateParameters(value.parameters);
  const artifact = validateArtifact(value.artifact);
  const release = validateRelease(value.release);
  const deployment = validateDeployment(value.deployment);
  return {
    kind: requireOperationKind(value.kind),
    operationId,
    hubUrl: requireText(value.hubUrl, 'hubUrl'),
    idempotencyKey: requireText(value.idempotencyKey, 'idempotencyKey'),
    step: requireText(value.step, 'step'),
    ...(parameters ? { parameters } : {}),
    ...(resourceIds ? { resourceIds } : {}),
    ...(artifact ? { artifact } : {}),
    ...(release ? { release } : {}),
    ...(deployment ? { deployment } : {}),
    createdAt: requireIsoDate(value.createdAt, 'createdAt'),
    updatedAt: requireIsoDate(value.updatedAt, 'updatedAt'),
  };
}

function validateParameters(value: unknown): OperationParameters | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalidJournal();
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) throw invalidJournal();
    result[key] = requireText(item, `parameters.${key}`);
  }
  return result;
}

function validateDeployment(value: unknown): OperationDeployment | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalidJournal();
  return {
    id: requireText(value.id, 'deployment.id'),
    applicationId: requireText(value.applicationId, 'deployment.applicationId'),
    targetReleaseId: requireText(
      value.targetReleaseId,
      'deployment.targetReleaseId',
    ),
    type: requireText(value.type, 'deployment.type'),
    status: requireText(value.status, 'deployment.status'),
  };
}

function requireOperationKind(value: unknown): OperationKind {
  if (value !== 'app-deploy' && value !== 'app-publish') {
    throw invalidJournal();
  }
  return value;
}

function validateRelease(value: unknown): OperationRelease | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.manifest)) throw invalidJournal();
  const checksum = requireText(value.checksum, 'release.checksum');
  const archiveChecksum = requireText(
    value.archiveChecksum,
    'release.archiveChecksum',
  );
  requireChecksum(checksum);
  requireChecksum(archiveChecksum);
  return {
    version: requireText(value.version, 'release.version'),
    checksum,
    sizeBytes: requireNonNegativeInteger(value.sizeBytes),
    archiveChecksum,
    archiveSizeBytes: requireNonNegativeInteger(value.archiveSizeBytes),
    manifest: structuredClone(value.manifest),
  };
}

function validateResourceIds(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalidJournal();
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) throw invalidJournal();
    result[key] = requireText(item, `resourceIds.${key}`);
  }
  return result;
}

function validateArtifact(value: unknown): OperationArtifact | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalidJournal();
  const checksum = requireText(value.checksum, 'artifact.checksum');
  requireChecksum(checksum);
  return { path: requireText(value.path, 'artifact.path'), checksum };
}

function assertNoSecretFields(value: unknown, pathPrefix = ''): void {
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new LocalOperationError(
        'LOCAL_OPERATION_SECRET_REJECTED',
        `Operation journal field "${fieldPath}" may contain a secret and cannot be persisted.`,
      );
    }
    if (isRecord(child)) assertNoSecretFields(child, fieldPath);
  }
}

async function assertRegularFile(
  filePath: string,
  missingCode: LocalOperationErrorCode,
): Promise<void> {
  try {
    const file = await lstat(filePath);
    if (file.isFile() && !file.isSymbolicLink()) return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (missingCode === 'LOCAL_OPERATION_ARTIFACT_MISSING') {
    throw artifactMissing();
  }
  throw new LocalOperationError(missingCode, `File "${filePath}" is invalid.`);
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    digest.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return `sha256:${digest.digest('hex')}`;
}

function requireChecksum(value: string): void {
  if (!CHECKSUM_PATTERN.test(value)) throw invalidJournal();
}

function assertOperationId(value: string): void {
  if (!OPERATION_ID_PATTERN.test(value)) throw invalidJournal();
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LocalOperationError(
      'LOCAL_OPERATION_INVALID',
      `Operation journal field "${field}" must be a non-empty string.`,
    );
  }
  return value;
}

function requireNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidJournal();
  }
  return value;
}

function requireIsoDate(value: unknown, field: string): string {
  const text = requireText(value, field);
  if (Number.isNaN(Date.parse(text))) throw invalidJournal();
  return text;
}

function invalidJournal(): LocalOperationError {
  return new LocalOperationError(
    'LOCAL_OPERATION_INVALID',
    'The local operation journal is invalid.',
  );
}

function artifactMissing(): LocalOperationError {
  return new LocalOperationError(
    'LOCAL_OPERATION_ARTIFACT_MISSING',
    'The cached release archive is missing. Start a new operation and publish again.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

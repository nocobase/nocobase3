import { createHash } from 'node:crypto';

import { ReleaseManagementError } from './errors.js';
import {
  JsonDeploymentStore,
  type DeploymentStore,
} from './deployment-store.js';
import type {
  DeploymentKind,
  DeploymentRecord,
  DeploymentStatus,
  ReleaseActor,
} from './types.js';

const DEFAULT_COLLECTION_NAME = 'hubReleaseDeployments';
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_TIMEOUT_MS = 10_000;

type AuditValue = string | boolean | null;
type AuditPayload = Record<string, AuditValue>;
type AuditRow = Record<string, unknown>;

interface NocoBaseListPayload {
  data: AuditRow[];
  totalPages?: number;
}

export interface NocoBaseDeploymentStoreOptions {
  apiUrl: string | URL;
  accessToken: string;
  role?: string;
  collectionName?: string;
  legacyFilePath?: string;
  pageSize?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class NocoBaseDeploymentStore implements DeploymentStore {
  private readonly apiUrl: URL;
  private readonly accessToken: string;
  private readonly role?: string;
  private readonly collectionName: string;
  private readonly legacyFilePath?: string;
  private readonly pageSize: number;
  private readonly timeoutMs: number;
  private readonly request: typeof fetch;
  private legacyMigration?: Promise<void>;

  constructor(options: NocoBaseDeploymentStoreOptions) {
    this.apiUrl = ensureTrailingSlash(new URL(options.apiUrl));
    this.accessToken = requireNonEmpty(
      options.accessToken,
      'NocoBase release audit access token',
    );
    this.role = options.role?.trim() || undefined;
    this.collectionName =
      options.collectionName?.trim() || DEFAULT_COLLECTION_NAME;
    this.legacyFilePath = options.legacyFilePath;
    this.pageSize = normalizePageSize(options.pageSize);
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
    this.request = options.fetch ?? fetch;
  }

  async list(appId?: string): Promise<DeploymentRecord[]> {
    await this.ensureLegacyMigration();
    const rows: AuditRow[] = [];
    let page = 1;

    while (true) {
      const payload = await this.listPage({
        filter: appId ? { appId } : undefined,
        page,
        pageSize: this.pageSize,
        sort: '-requestedAt',
      });
      rows.push(...payload.data);

      if (
        payload.totalPages !== undefined
          ? page >= payload.totalPages
          : payload.data.length < this.pageSize
      ) {
        break;
      }
      page += 1;
    }

    return rows
      .map(deploymentRecordFromRow)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  async findByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<DeploymentRecord | null> {
    await this.ensureLegacyMigration();
    const row = await this.findRow({
      operationKey: createDeploymentOperationKey(appId, kind, idempotencyKey),
    });
    return row ? deploymentRecordFromRow(row) : null;
  }

  async save(record: DeploymentRecord): Promise<void> {
    await this.ensureLegacyMigration();
    await this.saveWithoutMigration(record);
  }

  private ensureLegacyMigration(): Promise<void> {
    if (!this.legacyFilePath) {
      return Promise.resolve();
    }

    this.legacyMigration ??= this.migrateLegacyRecords();
    return this.legacyMigration;
  }

  private async migrateLegacyRecords(): Promise<void> {
    const legacyFilePath = this.legacyFilePath;
    if (!legacyFilePath) {
      return;
    }
    const records = await new JsonDeploymentStore(legacyFilePath).list();
    for (const record of records) {
      await this.saveWithoutMigration(record);
    }
  }

  private async saveWithoutMigration(record: DeploymentRecord): Promise<void> {
    const existing = await this.findRow({ deploymentId: record.id });
    if (existing) {
      await this.updateRow(existing, record);
      return;
    }

    try {
      await this.send('create', {
        method: 'POST',
        body: deploymentRecordToPayload(record),
      });
    } catch (error) {
      if (!(error instanceof ReleaseManagementError)) {
        throw error;
      }

      const concurrentlyCreated = await this.findRow({
        deploymentId: record.id,
      });
      if (!concurrentlyCreated) {
        throw error;
      }
      await this.updateRow(concurrentlyCreated, record);
    }
  }

  private async updateRow(
    row: AuditRow,
    record: DeploymentRecord,
  ): Promise<void> {
    const rowId = requiredIdentifier(row.id, 'NocoBase release audit row id');
    await this.send('update', {
      method: 'POST',
      query: { filterByTk: rowId },
      body: deploymentRecordToPayload(record),
    });
  }

  private async findRow(
    filter: Record<string, string>,
  ): Promise<AuditRow | null> {
    const payload = await this.listPage({ filter, page: 1, pageSize: 1 });
    return payload.data[0] ?? null;
  }

  private async listPage(options: {
    filter?: Record<string, string>;
    page: number;
    pageSize: number;
    sort?: string;
  }): Promise<NocoBaseListPayload> {
    const payload = await this.send('list', {
      method: 'GET',
      query: {
        filter: options.filter ? JSON.stringify(options.filter) : undefined,
        page: String(options.page),
        pageSize: String(options.pageSize),
        sort: options.sort,
      },
    });
    const response = asRecord(payload);
    if (!response || !Array.isArray(response.data)) {
      throw invalidResponse(
        'NocoBase release audit list response does not contain a data array',
      );
    }

    const meta = asRecord(response.meta);
    const totalPages = optionalPositiveInteger(
      meta?.totalPage ?? meta?.totalPages,
    );
    return {
      data: response.data.map((value) => {
        const row = asRecord(value);
        if (!row) {
          throw invalidResponse(
            'NocoBase release audit list contains a non-object row',
          );
        }
        return row;
      }),
      totalPages,
    };
  }

  private async send(
    action: 'create' | 'list' | 'update',
    options: {
      method: 'GET' | 'POST';
      query?: Record<string, string | undefined>;
      body?: AuditPayload;
    },
  ): Promise<unknown> {
    const url = new URL(`./${this.collectionName}:${action}`, this.apiUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const headers = new Headers({
      accept: 'application/json',
      authorization: `Bearer ${this.accessToken}`,
    });
    if (this.role) {
      headers.set('x-role', this.role);
    }
    if (options.body) {
      headers.set('content-type', 'application/json');
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    try {
      response = await this.request(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (error) {
      throw unavailable('NocoBase release audit API is unavailable', error);
    } finally {
      clearTimeout(timeout);
    }

    const payload = await readJson(response);
    if (!response.ok) {
      const error = asRecord(payload);
      const message =
        readErrorMessage(error) ??
        `NocoBase release audit request failed (${response.status})`;
      throw unavailable(message);
    }
    return payload;
  }
}

export function createDeploymentOperationKey(
  appId: string,
  kind: DeploymentKind,
  idempotencyKey: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([appId, kind, idempotencyKey]))
    .digest('hex');
}

function deploymentRecordToPayload(record: DeploymentRecord): AuditPayload {
  return {
    deploymentId: record.id,
    operationKey: createDeploymentOperationKey(
      record.appId,
      record.kind,
      record.idempotencyKey,
    ),
    idempotencyKey: record.idempotencyKey,
    appId: record.appId,
    releaseId: record.releaseId,
    kind: record.kind,
    status: record.status,
    changed: record.changed,
    previousReleaseId: record.previousReleaseId,
    activeReleaseId: record.activeReleaseId,
    activeVersion: record.activeVersion,
    actorId: record.actor.id,
    actorName: record.actor.name,
    actorRole: record.actor.role,
    requestedAt: record.requestedAt,
    completedAt: record.completedAt,
    errorCode: record.error?.code ?? null,
    errorMessage: record.error?.message ?? null,
  };
}

function deploymentRecordFromRow(row: AuditRow): DeploymentRecord {
  const errorCode = optionalString(row.errorCode, 'errorCode');
  const errorMessage = optionalString(row.errorMessage, 'errorMessage');
  if ((errorCode === null) !== (errorMessage === null)) {
    throw invalidResponse(
      'NocoBase release audit errorCode and errorMessage must both be set or both be null',
    );
  }

  const actor: ReleaseActor = {
    id: requiredString(row.actorId, 'actorId'),
    name: requiredString(row.actorName, 'actorName'),
    role: requiredString(row.actorRole, 'actorRole'),
  };
  return {
    id: requiredString(row.deploymentId, 'deploymentId'),
    idempotencyKey: requiredString(row.idempotencyKey, 'idempotencyKey'),
    appId: requiredString(row.appId, 'appId'),
    releaseId: requiredString(row.releaseId, 'releaseId'),
    kind: deploymentKind(row.kind),
    status: deploymentStatus(row.status),
    changed: optionalBoolean(row.changed, 'changed'),
    previousReleaseId: optionalString(
      row.previousReleaseId,
      'previousReleaseId',
    ),
    activeReleaseId: optionalString(row.activeReleaseId, 'activeReleaseId'),
    activeVersion: optionalString(row.activeVersion, 'activeVersion'),
    actor,
    requestedAt: requiredString(row.requestedAt, 'requestedAt'),
    completedAt: optionalString(row.completedAt, 'completedAt'),
    error:
      errorCode && errorMessage
        ? { code: errorCode, message: errorMessage }
        : null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw invalidResponse(
      'NocoBase release audit API returned a non-JSON response',
      error,
    );
  }
}

function readErrorMessage(payload: AuditRow | null): string | undefined {
  if (typeof payload?.message === 'string') {
    return payload.message;
  }
  if (Array.isArray(payload?.errors)) {
    const first = asRecord(payload.errors[0]);
    return typeof first?.message === 'string' ? first.message : undefined;
  }
  return undefined;
}

function ensureTrailingSlash(url: URL): URL {
  const next = new URL(url);
  if (!next.pathname.endsWith('/')) {
    next.pathname = `${next.pathname}/`;
  }
  return next;
}

function normalizePageSize(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_PAGE_SIZE;
}

function normalizeTimeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_TIMEOUT_MS;
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function requiredIdentifier(value: unknown, label: string): string {
  if (typeof value === 'string' && value) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw invalidResponse(`${label} is missing or invalid`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw invalidResponse(
    `NocoBase release audit field ${field} is missing or invalid`,
  );
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw invalidResponse(
    `NocoBase release audit field ${field} must be a string or null`,
  );
}

function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw invalidResponse(
    `NocoBase release audit field ${field} must be a boolean or null`,
  );
}

function deploymentKind(value: unknown): DeploymentKind {
  if (value === 'deploy' || value === 'rollback') {
    return value;
  }
  throw invalidResponse('NocoBase release audit field kind is invalid');
}

function deploymentStatus(value: unknown): DeploymentStatus {
  if (
    value === 'pending' ||
    value === 'succeeded' ||
    value === 'unchanged' ||
    value === 'failed'
  ) {
    return value;
  }
  throw invalidResponse('NocoBase release audit field status is invalid');
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function asRecord(value: unknown): AuditRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AuditRow)
    : null;
}

function unavailable(message: string, cause?: unknown): ReleaseManagementError {
  return new ReleaseManagementError(message, {
    status: 503,
    code: 'RELEASE_AUDIT_UNAVAILABLE',
    cause,
  });
}

function invalidResponse(
  message: string,
  cause?: unknown,
): ReleaseManagementError {
  return new ReleaseManagementError(message, {
    status: 502,
    code: 'RELEASE_AUDIT_INVALID_RESPONSE',
    cause,
  });
}

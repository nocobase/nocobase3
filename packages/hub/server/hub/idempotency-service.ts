import type { DatabaseConnection, Row } from '@nocobase/database';
import { createHash } from 'node:crypto';

import { HubDomainError } from './store.ts';

export interface IdempotencyRequest {
  readonly actorId?: string | null;
  readonly credentialId?: string | null;
  readonly endpoint: string;
  readonly scopeKey: string;
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly ttlMs?: number;
}

export interface IdempotencyExecutionResult<T> {
  readonly value: T;
  readonly idempotent: boolean;
}

interface IdempotencyRow extends Row {
  id: string;
  identityKey: string;
  actorId: string | null;
  credentialId: string | null;
  endpoint: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  responseResource: string | Record<string, unknown> | null;
  status: string;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export class HubIdempotencyService {
  constructor(private readonly connection: DatabaseConnection) {}

  async recoverRunning(): Promise<void> {
    await this.connection.query
      .deleteFrom('hubIdempotencyRecords')
      .where('status', '=', 'running')
      .execute();
  }

  async execute<T>(
    request: IdempotencyRequest,
    operation: () => Promise<T>,
  ): Promise<IdempotencyExecutionResult<T>> {
    const normalized = normalizeRequest(request);
    const requestHash = hashPayload(request.payload);
    const existing = await this.find(normalized);
    if (existing) {
      return this.replayOrConflict<T>(existing, requestHash);
    }

    const now = new Date();
    const row = {
      id: crypto.randomUUID(),
      identityKey: normalized.identityKey,
      actorId: normalized.actorId,
      credentialId: normalized.credentialId,
      endpoint: normalized.endpoint,
      scopeKey: normalized.scopeKey,
      idempotencyKey: normalized.idempotencyKey,
      requestHash,
      responseResource: null,
      status: 'running',
      expiresAt: new Date(now.getTime() + normalized.ttlMs),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.connection.query
        .insertInto('hubIdempotencyRecords')
        .values(row)
        .execute();
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.find(normalized);
      if (raced) return this.replayOrConflict<T>(raced, requestHash);
      throw error;
    }

    try {
      const value = await operation();
      if (!isJsonValue(value)) {
        throw new HubDomainError(
          'IDEMPOTENCY_RESPONSE_UNSERIALIZABLE',
          'The idempotent response must be JSON serializable.',
          { status: 500 },
        );
      }
      await this.connection.query
        .updateTable('hubIdempotencyRecords')
        .set({
          responseResource: JSON.stringify(value),
          status: 'completed',
          updatedAt: new Date(),
        })
        .where('id', '=', row.id)
        .where('status', '=', 'running')
        .execute();
      return { value, idempotent: false };
    } catch (error) {
      await this.connection.query
        .deleteFrom('hubIdempotencyRecords')
        .where('id', '=', row.id)
        .where('status', '=', 'running')
        .execute()
        .catch(() => undefined);
      throw error;
    }
  }

  private async find(
    request: NormalizedIdempotencyRequest,
  ): Promise<IdempotencyRow | undefined> {
    const row = await this.connection.query
      .selectFrom<IdempotencyRow>('hubIdempotencyRecords')
      .selectAll()
      .where('identityKey', '=', request.identityKey)
      .where('endpoint', '=', request.endpoint)
      .where('scopeKey', '=', request.scopeKey)
      .where('idempotencyKey', '=', request.idempotencyKey)
      .executeTakeFirst<IdempotencyRow>();
    if (!row) return undefined;
    if (
      row.expiresAt &&
      new Date(String(row.expiresAt)).getTime() <= Date.now()
    ) {
      await this.connection.query
        .deleteFrom('hubIdempotencyRecords')
        .where('id', '=', row.id)
        .execute()
        .catch(() => undefined);
      return undefined;
    }
    return row;
  }

  private replayOrConflict<T>(
    row: IdempotencyRow,
    requestHash: string,
  ): IdempotencyExecutionResult<T> {
    if (row.requestHash !== requestHash) {
      throw new HubDomainError(
        'IDEMPOTENCY_KEY_CONFLICT',
        'The idempotency key was already used with a different request.',
        { status: 409 },
      );
    }
    if (row.status === 'running') {
      throw new HubDomainError(
        'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        'The idempotent request is already in progress.',
        { status: 409, retryable: true },
      );
    }
    const value = parseJsonValue(row.responseResource);
    return { value: value as T, idempotent: true };
  }
}

interface NormalizedIdempotencyRequest {
  readonly actorId: string | null;
  readonly credentialId: string | null;
  readonly identityKey: string;
  readonly endpoint: string;
  readonly scopeKey: string;
  readonly idempotencyKey: string;
  readonly ttlMs: number;
}

function normalizeRequest(
  request: IdempotencyRequest,
): NormalizedIdempotencyRequest {
  const endpoint = requiredPart(request.endpoint, 'endpoint');
  const scopeKey = requiredPart(request.scopeKey, 'scopeKey');
  const idempotencyKey = requiredPart(request.idempotencyKey, 'idempotencyKey');
  const actorId = optionalPart(request.actorId);
  const credentialId = optionalPart(request.credentialId);
  const identityKey = credentialId
    ? `credential:${credentialId}`
    : `actor:${actorId ?? 'anonymous'}`;
  const ttlMs = request.ttlMs ?? 24 * 60 * 60 * 1000;
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > 30 * 24 * 60 * 60 * 1000
  ) {
    throw new HubDomainError('VALIDATION_ERROR', 'Invalid idempotency TTL.', {
      status: 422,
    });
  }
  return {
    actorId,
    credentialId,
    identityKey,
    endpoint,
    scopeKey,
    idempotencyKey,
    ttlMs,
  };
}

function requiredPart(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) {
    throw new HubDomainError('VALIDATION_ERROR', `${field} is invalid.`, {
      status: 422,
    });
  }
  return normalized;
}

function optionalPart(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  return requiredPart(value, 'identity');
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function isJsonValue(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return value !== undefined;
  } catch {
    return false;
  }
}

function parseJsonValue(
  value: string | Record<string, unknown> | null,
): unknown {
  if (value === null) {
    throw new HubDomainError(
      'IDEMPOTENCY_RESPONSE_MISSING',
      'The idempotent response is missing.',
      { status: 500 },
    );
  }
  if (typeof value === 'string') return JSON.parse(value) as unknown;
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message);
}

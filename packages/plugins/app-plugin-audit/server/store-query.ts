import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import type {
  AuditEventsPage,
  AuditEventsQuery,
  AuditEventDto,
  TrustedAuditScope,
} from './contracts.js';
import { normalizeResourceRef } from './event-normalizer.js';
import { AuditError } from './errors.js';
import { auditRows, storedText } from './database/sql-client.js';

export function encodeSecurityScope(value: string | undefined): string {
  return JSON.stringify(value === undefined ? ['absent'] : ['value', value]);
}
function fingerprint(
  scope: TrustedAuditScope,
  query: AuditEventsQuery,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        scope.appId,
        encodeSecurityScope(scope.securityScope),
        scope.actor.type,
        scope.actor.id ?? null,
        query.store,
        query.from ?? null,
        query.to ?? null,
        query.action ?? null,
        query.kind ?? null,
        query.outcome ?? null,
        query.actorType ?? null,
        query.actorId ?? null,
        query.target ? normalizeResourceRef(query.target, scope) : null,
        query.operationId ?? null,
        query.requestId ?? null,
        query.runId ?? null,
      ]),
    )
    .digest('hex');
}
/** A cursor is a position, never an authorization credential. */
export function encodeAuditCursor(
  scope: TrustedAuditScope,
  query: AuditEventsQuery,
  position: Pick<AuditEventDto, 'occurredAt' | 'id'>,
): string {
  return Buffer.from(
    JSON.stringify([
      1,
      fingerprint(scope, query),
      position.occurredAt,
      position.id,
    ]),
  ).toString('base64url');
}
function cursor(value: string, filter: string): [string, string] {
  try {
    if (value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error('Invalid cursor.');
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value)
      throw new Error('Invalid cursor.');
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      parsed[0] !== 1 ||
      parsed[1] !== filter ||
      typeof parsed[2] !== 'string' ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(
        parsed[2],
      ) ||
      !Number.isFinite(Date.parse(parsed[2])) ||
      new Date(parsed[2]).toISOString() !== parsed[2] ||
      typeof parsed[3] !== 'string' ||
      parsed[3].length === 0 ||
      parsed[3].length > 512
    )
      throw new Error('Invalid cursor.');
    return [parsed[2], parsed[3]];
  } catch {
    throw new AuditError('AUDIT_INVALID_EVENT');
  }
}

/** Scoped candidates only; the public QueryService must additionally authorize each resource. */
export async function queryAuditStore(
  connection: DatabaseConnection,
  scope: TrustedAuditScope,
  query: AuditEventsQuery,
  eventId?: string,
): Promise<AuditEventsPage> {
  const limit = query.pageSize ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new AuditError('AUDIT_INVALID_EVENT');
  const clauses = [
    '"scopeIndex" = ?',
    '"appId" = ?',
    '"securityScope" = ?',
    '"store" = ?',
  ];
  const values: unknown[] = [
    createHash('sha256')
      .update(
        JSON.stringify([scope.appId, encodeSecurityScope(scope.securityScope)]),
      )
      .digest('hex'),
    scope.appId,
    encodeSecurityScope(scope.securityScope),
    query.store,
  ];
  if (eventId !== undefined) {
    clauses.push('"eventHash" = ?', '"id" = ?');
    values.push(createHash('sha256').update(eventId).digest('hex'), eventId);
  }
  for (const name of [
    'action',
    'kind',
    'outcome',
    'actorType',
    'actorId',
    'operationId',
    'requestId',
    'runId',
  ] as const) {
    if (query[name] !== undefined) {
      clauses.push(`"${name}" = ?`);
      values.push(query[name]);
    }
  }
  for (const name of ['operation', 'request', 'run'] as const) {
    const value =
      query[
        name === 'operation'
          ? 'operationId'
          : name === 'request'
            ? 'requestId'
            : 'runId'
      ];
    if (value !== undefined) {
      clauses.push('"' + name + 'Index" = ?');
      values.push(createHash('sha256').update(value).digest('hex'));
    }
  }
  if (query.actorType !== undefined && query.actorId !== undefined) {
    clauses.push('"actorIndex" = ?');
    values.push(
      createHash('sha256')
        .update(JSON.stringify([scope.appId, query.actorType, query.actorId]))
        .digest('hex'),
    );
  }
  if (query.from !== undefined) {
    clauses.push('"occurredAt" >= ?');
    values.push(query.from);
  }
  if (query.to !== undefined) {
    clauses.push('"occurredAt" <= ?');
    values.push(query.to);
  }
  if (query.target) {
    const target = normalizeResourceRef(query.target, scope);
    clauses.push('"targetResource" = ?');
    values.push(target.resource);
    if (target.dataSource !== undefined) {
      clauses.push('"targetDataSource" = ?');
      values.push(target.dataSource);
    }
    if (target.keyEncoding !== undefined) {
      clauses.push('"targetKeyHash" = ?', '"targetKeyEncoding" = ?');
      values.push(target.keyHash, target.keyEncoding);
    }
  }
  // The cursor comparison and ordering must use the same strict ID order.
  const orderedId =
    connection.dialect === 'mysql' ? 'CAST("id" AS BINARY)' : '"id"';
  const filter = fingerprint(scope, query);
  if (query.cursor !== undefined) {
    const [time, id] = cursor(query.cursor, filter);
    clauses.push(
      '("occurredAt" < ? OR ("occurredAt" = ? AND ' + orderedId + ' < ?))',
    );
    values.push(time, time, id);
  }
  const rows = await auditRows(
    connection,
    `SELECT "id", "occurredAt", "payload" FROM "auditEvents" WHERE ${clauses.join(' AND ')} ORDER BY "occurredAt" DESC, ${orderedId} DESC LIMIT ?`,
    [...values, limit + 1],
  );
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const token =
    rows.length > limit && last
      ? encodeAuditCursor(scope, query, {
          occurredAt: storedText(last, 'occurredAt'),
          id: storedText(last, 'id'),
        })
      : undefined;
  return {
    items: page.map(
      (row) => JSON.parse(storedText(row, 'payload')) as AuditEventDto,
    ),
    ...(token ? { nextCursor: token } : {}),
  };
}

import { types } from 'node:util';
import type {
  AuditEventDto,
  AuditDatabaseSummary,
  AuditHttpSummary,
} from './contracts.js';
import { AuditError } from './errors.js';
import { requirePayload, type PayloadLimits } from './payload-guard.js';

function invalid(): never {
  throw new AuditError('AUDIT_INVALID_EVENT');
}
function fields(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    return invalid();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return invalid();
    copy[key] = descriptor.value;
  }
  return copy;
}

/** Validate top-level descriptors before Store reads any event value. Nested base fields are normalized separately. */
export function snapshotStoredEvent(input: AuditEventDto): AuditEventDto {
  return fields(input, [
    'id',
    'eventVersion',
    'kind',
    'producer',
    'action',
    'outcome',
    'occurredAt',
    'recordedAt',
    'store',
    'policyVersion',
    'appId',
    'securityScope',
    'actor',
    'initiator',
    'roleIds',
    'operationId',
    'requestId',
    'runId',
    'correlationId',
    'target',
    'source',
    'details',
    'http',
    'database',
    'titleKey',
    'reasonCode',
    'captureWarnings',
  ]) as unknown as AuditEventDto;
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Buffer.byteLength(value) > 1024 ||
    /\p{Cc}/u.test(value)
  )
    return invalid();
  return value;
}
function integer(
  value: unknown,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    return invalid();
  return value;
}
export type CollectorMetadata = Pick<
  AuditEventDto,
  'http' | 'database' | 'titleKey' | 'reasonCode' | 'captureWarnings'
>;

/** Trusted collector DTOs are still a strict data boundary; no getters, SQL or unknown metadata survive. */
export function normalizeCollectorMetadata(
  event: AuditEventDto,
  limits: PayloadLimits,
): CollectorMetadata {
  let http: AuditHttpSummary | undefined;
  let database: AuditDatabaseSummary | undefined;
  if (event.http !== undefined) {
    if (event.kind !== 'request') return invalid();
    const value = fields(event.http, [
      'method',
      'routePattern',
      'httpStatus',
      'durationMs',
    ]);
    const status = integer(value.httpStatus, 599);
    if (
      status < 100 ||
      typeof value.durationMs !== 'number' ||
      !Number.isFinite(value.durationMs) ||
      value.durationMs < 0
    )
      return invalid();
    http = {
      method: text(value.method),
      routePattern: text(value.routePattern),
      httpStatus: status,
      durationMs: value.durationMs,
    };
  }
  if (event.database !== undefined) {
    if (event.kind !== 'database') return invalid();
    const value = fields(event.database, [
      'executionId',
      'count',
      'countSemantics',
    ]);
    const semantics = value.countSemantics;
    if (
      semantics !== 'matched' &&
      semantics !== 'changed' &&
      semantics !== 'inserted' &&
      semantics !== 'deleted' &&
      semantics !== 'unknown'
    )
      return invalid();
    database = {
      executionId: text(value.executionId),
      countSemantics: semantics,
      ...(value.count === undefined ? {} : { count: integer(value.count) }),
    };
  }
  let captureWarnings: readonly string[] | undefined;
  if (event.captureWarnings !== undefined) {
    const copy = requirePayload(event.captureWarnings, limits);
    if (!Array.isArray(copy) || copy.length > 128) return invalid();
    captureWarnings = copy.map(text);
  }
  const metadata: CollectorMetadata = {
    ...(http ? { http } : {}),
    ...(database ? { database } : {}),
    ...(event.titleKey === undefined ? {} : { titleKey: text(event.titleKey) }),
    ...(event.reasonCode === undefined
      ? {}
      : { reasonCode: text(event.reasonCode) }),
    ...(captureWarnings === undefined ? {} : { captureWarnings }),
  };
  // Apply a shared payload budget to already copied safe details and collector metadata.
  if (Object.keys(metadata).length)
    requirePayload({ details: event.details ?? null, ...metadata }, limits);
  return metadata;
}

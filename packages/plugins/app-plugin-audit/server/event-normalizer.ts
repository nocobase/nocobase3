import { createHash } from 'node:crypto';
import { types } from 'node:util';
import type {
  AuditEventDto,
  AuditJson,
  AuditKind,
  AuditOutcome,
  NormalizedResourceRef,
  Principal,
  RecordKey,
  ResourceRef,
  TrustedAuditScope,
} from './contracts.js';
import { AuditError } from './errors.js';
import { requirePayload, type PayloadLimits } from './payload-guard.js';

/** Only a trusted bound recorder or collector may construct this context. */
export interface EventNormalizationContext {
  readonly scope: TrustedAuditScope;
  readonly kind: AuditKind;
  readonly producer: string;
  readonly id: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly store: string;
  readonly policyVersion: number;
}
export interface NormalizedAuditEvent {
  readonly event: AuditEventDto;
  readonly target?: NormalizedResourceRef;
  readonly source?: NormalizedResourceRef;
  readonly fingerprint: string;
}

function invalid(): never {
  throw new AuditError('AUDIT_INVALID_EVENT');
}

function record(
  value: unknown,
  allowed?: readonly string[],
  maxKeys: number = 64,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value))
    return invalid();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length > maxKeys) return invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    if (typeof key !== 'string' || (allowed && !allowed.includes(key)))
      return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return invalid();
    copy[key] = descriptor.value;
  }
  return copy;
}

function text(value: unknown, maxBytes: number = 1_024): string {
  if (
    typeof value !== 'string' ||
    value.length > maxBytes ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, 'utf8') > maxBytes ||
    /\p{Cc}/u.test(value)
  )
    return invalid();
  return value;
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value);
}

function principal(value: unknown): Principal {
  if (value === undefined) return { type: 'unknown' };
  const fields = record(value, ['type', 'id', 'label']);
  return {
    type: text(fields.type),
    ...optionalFields(fields, ['id', 'label']),
  };
}

function optionalFields(
  fields: Record<string, unknown>,
  names: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = optionalText(fields[name]);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function scope(input: unknown): TrustedAuditScope {
  const fields = record(input, [
    'appId',
    'securityScope',
    'actor',
    'initiator',
    'roleIds',
    'operationId',
    'requestId',
    'runId',
    'correlationId',
  ]);
  let roleIds: readonly string[] | undefined;
  if (fields.roleIds !== undefined) {
    const roles = requirePayload(fields.roleIds, {
      maxKeys: 128,
      maxBytes: 8_192,
    });
    if (!Array.isArray(roles)) return invalid();
    roleIds = [...new Set(roles.map((role: AuditJson) => text(role)))].sort();
  }
  return {
    appId: text(fields.appId),
    actor: principal(fields.actor),
    ...optionalFields(fields, [
      'securityScope',
      'operationId',
      'requestId',
      'runId',
      'correlationId',
    ]),
    ...(fields.initiator !== undefined
      ? { initiator: principal(fields.initiator) }
      : {}),
    ...(roleIds !== undefined ? { roleIds } : {}),
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface KeyResult {
  readonly key: RecordKey;
  readonly encoding: string;
}
function normalizeKey(value: unknown): KeyResult {
  if (typeof value === 'string') {
    const key = text(value, 65_536);
    const encoding = JSON.stringify(['string', key]);
    if (Buffer.byteLength(encoding) > 65_536) return invalid();
    return { key, encoding };
  }
  const fields = record(value, undefined, 128);
  const names = Object.keys(fields).sort();
  if (names.length === 0) return invalid();
  const key: Record<string, string | number> = Object.create(null) as Record<
    string,
    string | number
  >;
  const entries: [string, 'string' | 'number', string | number][] = [];
  let budget = 0;
  for (const name of names) {
    text(name);
    const part = fields[name];
    if (typeof part !== 'string' && typeof part !== 'number') return invalid();
    if (
      typeof part === 'number' &&
      (!Number.isFinite(part) ||
        (Number.isInteger(part) && !Number.isSafeInteger(part)))
    )
      return invalid();
    if (
      typeof part === 'string' &&
      (part.length > 65_536 || Buffer.byteLength(part) > 65_536)
    )
      return invalid();
    const normalized =
      typeof part === 'number' && Object.is(part, -0) ? 0 : part;
    const entry: [string, 'string' | 'number', string | number] = [
      name,
      typeof normalized === 'string' ? 'string' : 'number',
      normalized,
    ];
    budget += Buffer.byteLength(JSON.stringify(entry));
    if (budget > 65_536) return invalid();
    key[name] = normalized;
    entries.push(entry);
  }
  const encoding = JSON.stringify(['composite', entries]);
  if (Buffer.byteLength(encoding) > 65_536) return invalid();
  return { key, encoding };
}

interface ResourceResult {
  readonly ref: ResourceRef;
  readonly normalized: NormalizedResourceRef;
}
function resource(
  input: unknown,
  trustedScope: TrustedAuditScope,
): ResourceResult {
  const fields = record(input, ['dataSource', 'resource', 'key', 'label']);
  const base = {
    resource: text(fields.resource),
    ...optionalFields(fields, ['dataSource', 'label']),
  };
  const key = fields.key === undefined ? undefined : normalizeKey(fields.key);
  return {
    ref: { ...base, ...(key ? { key: key.key } : {}) },
    normalized: {
      ...base,
      appId: trustedScope.appId,
      ...(trustedScope.securityScope === undefined
        ? {}
        : { securityScope: trustedScope.securityScope }),
      ...(key
        ? { keyEncoding: key.encoding, keyHash: hash(key.encoding) }
        : {}),
    },
  };
}

export function normalizeResourceRef(
  input: ResourceRef,
  trustedScope: TrustedAuditScope,
): NormalizedResourceRef {
  return resource(input, scope(trustedScope)).normalized;
}

function timestamp(value: unknown): string {
  const source = text(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source))
    return invalid();
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== source)
    return invalid();
  return source;
}

/** Input is unknown intentionally: TypeScript exclusions cannot enforce a runtime trust boundary. */
export function normalizeEvent(
  input: unknown,
  context: EventNormalizationContext,
  limits: PayloadLimits = {},
): NormalizedAuditEvent {
  const fields = record(input, [
    'action',
    'outcome',
    'target',
    'source',
    'details',
  ]);
  const trusted = record(context, [
    'scope',
    'kind',
    'producer',
    'id',
    'occurredAt',
    'recordedAt',
    'store',
    'policyVersion',
  ]);
  const trustedScope = scope(trusted.scope);
  const action = text(fields.action);
  const outcome = text(fields.outcome);
  if (!['success', 'failed', 'denied', 'accepted', 'unknown'].includes(outcome))
    return invalid();
  const kind = text(trusted.kind);
  if (!['business', 'request', 'database'].includes(kind)) return invalid();
  const policyVersion = trusted.policyVersion;
  if (
    typeof policyVersion !== 'number' ||
    !Number.isSafeInteger(policyVersion) ||
    policyVersion < 0
  )
    return invalid();
  const target =
    fields.target === undefined
      ? undefined
      : resource(fields.target, trustedScope);
  const source =
    fields.source === undefined
      ? undefined
      : resource(fields.source, trustedScope);
  let details: Readonly<Record<string, AuditJson>> | undefined;
  if (fields.details !== undefined) {
    // Check the root shape without reading any property values through user code.
    if (
      fields.details === null ||
      typeof fields.details !== 'object' ||
      types.isProxy(fields.details) ||
      Array.isArray(fields.details)
    )
      return invalid();
    const safe = requirePayload(fields.details, limits);
    if (safe === null || typeof safe !== 'object' || Array.isArray(safe))
      return invalid();
    details = safe as Readonly<Record<string, AuditJson>>;
  }
  const event: AuditEventDto = {
    ...trustedScope,
    id: text(trusted.id),
    eventVersion: 1,
    kind: kind as AuditKind,
    producer: text(trusted.producer),
    action,
    outcome: outcome as AuditOutcome,
    occurredAt: timestamp(trusted.occurredAt),
    recordedAt: timestamp(trusted.recordedAt),
    store: text(trusted.store),
    policyVersion,
    ...(target ? { target: target.ref } : {}),
    ...(source ? { source: source.ref } : {}),
    ...(details === undefined ? {} : { details }),
  };
  // Serialize validated fields as tuples: arbitrary resource key names must not be redacted.
  const semantic = [
    trustedScope,
    kind,
    event.producer,
    event.store,
    action,
    outcome,
    target?.normalized ?? null,
    source?.normalized ?? null,
    details ?? null,
  ];
  return {
    event,
    ...(target ? { target: target.normalized } : {}),
    ...(source ? { source: source.normalized } : {}),
    fingerprint: hash(JSON.stringify(semantic)),
  };
}

import { AuditError, type AuditErrorCode } from './errors.js';
import type {
  AuditActor,
  AuditContext,
  AuditData,
  AuditInput,
  AuditJson,
  AuditSource,
} from './types.js';

function fail(code: AuditErrorCode): never {
  throw new AuditError(code);
}

function text(value: unknown, code: AuditErrorCode): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(code);
  return value;
}

function copy(
  value: unknown,
  code: AuditErrorCode,
  ancestors: Set<object>,
  depth: number,
): AuditJson {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || depth > 64 || ancestors.has(value))
    fail(code);
  if (Object.getOwnPropertySymbols(value).length) fail(code);
  const array = Array.isArray(value);
  if (
    !array &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    fail(code);
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries: [string, AuditJson][] = [];
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!descriptor.enumerable || !('value' in descriptor)) fail(code);
      entries.push([key, copy(descriptor.value, code, ancestors, depth + 1)]);
    }
    if (array) {
      if (
        entries.length !== value.length ||
        entries.some(([key], index) => key !== String(index))
      )
        fail(code);
      return Object.freeze(entries.map(([, item]) => item));
    }
    return Object.freeze(Object.fromEntries(entries));
  } finally {
    ancestors.delete(value);
  }
}

function object(value: unknown, code: AuditErrorCode): AuditData {
  const result = copy(value, code, new Set(), 0);
  if (!result || typeof result !== 'object' || Array.isArray(result))
    fail(code);
  return result as AuditData;
}

function keys(
  value: AuditData,
  allowed: readonly string[],
  code: AuditErrorCode,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(code);
}

function actor(value: unknown, code: AuditErrorCode): AuditActor {
  const record = object(value, code);
  keys(record, ['type', 'id'], code);
  return Object.freeze({
    type: text(record.type, code),
    id: text(record.id, code),
  });
}

/** Capture trusted context without retaining any caller-owned objects. */
export function snapshotAuditContext(context: AuditContext): AuditContext {
  const code = 'AUDIT_INVALID_CONTEXT';
  const record = object(context, code);
  keys(
    record,
    ['appName', 'actor', 'source', 'tenantId', 'initiator', 'operationId'],
    code,
  );
  const source = object(record.source, code);
  text(source.type, code);
  return Object.freeze({
    appName: text(record.appName, code),
    actor: actor(record.actor, code),
    source: source as AuditSource,
    ...(record.tenantId === undefined
      ? {}
      : { tenantId: text(record.tenantId, code) }),
    ...(record.initiator === undefined
      ? {}
      : { initiator: actor(record.initiator, code) }),
    ...(record.operationId === undefined
      ? {}
      : { operationId: text(record.operationId, code) }),
  });
}

export function snapshotAuditInput(
  input: AuditInput,
): Required<Pick<AuditInput, 'action' | 'result' | 'data'>> &
  Pick<AuditInput, 'target'> {
  const code = 'AUDIT_INVALID_EVENT';
  const record = object(input, code);
  keys(record, ['action', 'target', 'result', 'data'], code);
  if (
    record.result !== 'success' &&
    record.result !== 'denied' &&
    record.result !== 'failure'
  )
    fail(code);
  return Object.freeze({
    action: text(record.action, code),
    result: record.result,
    data:
      record.data === undefined ? Object.freeze({}) : object(record.data, code),
    ...(record.target === undefined
      ? {}
      : { target: actor(record.target, code) }),
  });
}

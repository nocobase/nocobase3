import { types } from 'node:util';
import type { AuditJson } from './contracts.js';
import { AuditError } from './errors.js';

export interface PayloadLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxKeys?: number;
}
export type PayloadIssue =
  | 'invalid-limits'
  | 'depth-limit'
  | 'key-limit'
  | 'byte-limit'
  | 'cycle'
  | 'accessor'
  | 'unsupported-type'
  | 'non-finite-number';
export type PayloadGuardResult =
  | {
      readonly ok: true;
      readonly value: AuditJson;
      readonly json: string;
      readonly bytes: number;
    }
  | {
      readonly ok: false;
      readonly value: null;
      readonly issues: readonly PayloadIssue[];
    };

const sensitiveKeys: ReadonlySet<string> = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'cookie',
  'setcookie',
  'authorization',
  'proxyauthorization',
  'privatekey',
  'secret',
  'clientsecret',
  'apikey',
  'credential',
  'credentials',
  '__proto__',
  'prototype',
  'constructor',
]);

function isSensitive(key: string): boolean {
  return (
    sensitiveKeys.has(key.toLowerCase().replace(/[-_\s]/g, '')) ||
    key === '__proto__'
  );
}

class GuardFailure extends Error {
  constructor(readonly issue: PayloadIssue) {
    super(issue);
  }
}

/** Copies only JSON data descriptors. Decimal instances must be supplied as strings by the producer. */
export function guardPayload(
  input: unknown,
  limits: PayloadLimits = {},
): PayloadGuardResult {
  const maxBytes = limits.maxBytes ?? 65_536;
  const maxDepth = limits.maxDepth ?? 16;
  const maxKeys = limits.maxKeys ?? 1_024;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > 128 ||
    !Number.isSafeInteger(maxKeys) ||
    maxKeys < 1
  ) {
    return { ok: false, value: null, issues: ['invalid-limits'] };
  }
  let bytes = 0;
  let keys = 0;
  const ancestors = new Set<object>();
  const parts: string[] = [];
  function emit(text: string): void {
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) throw new GuardFailure('byte-limit');
    parts.push(text);
  }
  function quote(text: string): void {
    if (text.length > maxBytes) throw new GuardFailure('byte-limit');
    emit(JSON.stringify(text));
  }
  function visit(value: unknown, depth: number): AuditJson {
    if (depth > maxDepth) throw new GuardFailure('depth-limit');
    if (value === null) {
      emit('null');
      return null;
    }
    if (typeof value === 'string') {
      quote(value);
      return value;
    }
    if (typeof value === 'bigint') {
      // Reject enormous integers before allocating their decimal representation.
      const bits = Math.min(maxBytes * 4, Number.MAX_SAFE_INTEGER);
      if (BigInt.asIntN(bits, value) !== value)
        throw new GuardFailure('byte-limit');
      const text = String(value);
      quote(text);
      return text;
    }
    if (typeof value === 'boolean') {
      emit(String(value));
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new GuardFailure('non-finite-number');
      emit(JSON.stringify(value));
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object' || types.isProxy(value))
      throw new GuardFailure('unsupported-type');
    if (ancestors.has(value)) throw new GuardFailure('cycle');
    const array = Array.isArray(value);
    const proto: unknown = Object.getPrototypeOf(value);
    if (
      array
        ? proto !== Array.prototype
        : proto !== Object.prototype && proto !== null
    ) {
      throw new GuardFailure('unsupported-type');
    }
    if (array && value.length > maxKeys) throw new GuardFailure('key-limit');
    const names = Reflect.ownKeys(value);
    keys += names.length - (array ? 1 : 0);
    if (keys > maxKeys) throw new GuardFailure('key-limit');
    if (names.some((name) => typeof name !== 'string'))
      throw new GuardFailure('unsupported-type');
    for (const name of names) {
      if (typeof name === 'string' && name.length > Math.max(maxBytes, 1_024))
        throw new GuardFailure('byte-limit');
    }
    ancestors.add(value);
    if (array) {
      if (names.length !== value.length + 1)
        throw new GuardFailure('unsupported-type');
      const result: AuditJson[] = [];
      emit('[');
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor) throw new GuardFailure('unsupported-type');
        if (!('value' in descriptor)) throw new GuardFailure('accessor');
        if (i > 0) emit(',');
        result.push(visit(descriptor.value, depth + 1));
      }
      emit(']');
      ancestors.delete(value);
      return result;
    }
    const result: Record<string, AuditJson> = Object.create(null) as Record<
      string,
      AuditJson
    >;
    emit('{');
    let first = true;
    for (const name of (names as string[]).sort()) {
      if (isSensitive(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !('value' in descriptor))
        throw new GuardFailure('accessor');
      if (!first) emit(',');
      first = false;
      quote(name);
      emit(':');
      result[name] = visit(descriptor.value, depth + 1);
    }
    emit('}');
    ancestors.delete(value);
    return result;
  }
  try {
    const value = visit(input, 0);
    return { ok: true, value, json: parts.join(''), bytes };
  } catch (error) {
    if (error instanceof GuardFailure)
      return { ok: false, value: null, issues: [error.issue] };
    // Do not retain an unexpected exception that could contain the original payload.
    return { ok: false, value: null, issues: ['unsupported-type'] };
  }
}

export function requirePayload(
  input: unknown,
  limits: PayloadLimits = {},
): AuditJson {
  const result = guardPayload(input, limits);
  if (!result.ok) throw new AuditError('AUDIT_INVALID_EVENT');
  return result.value;
}

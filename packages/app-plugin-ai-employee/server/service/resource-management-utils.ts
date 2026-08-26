import type { RuntimeActor } from '@nocobase/ai-employee';
import type { AIEmployeeAccessPolicy } from '../auth/access-policy.js';

export type ResourceInput = Record<string, any>;

export function assertCanManage(
  accessPolicy: AIEmployeeAccessPolicy,
  actor: RuntimeActor,
): void {
  accessPolicy.assertCanManage(actor);
}

export function unwrapRecord(value: unknown): ResourceInput | undefined {
  const outer = asRecord(value);
  return asRecord(outer?.values ?? outer?.body ?? value);
}

export function asRecord(value: unknown): ResourceInput | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ResourceInput)
    : undefined;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value);
  if (normalized) return normalized;
  throw badRequest(`${name} is required`);
}

export function stringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw badRequest('Expected string array');
  return [...value];
}

export function stringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (value == null) return undefined;
  const record = asRecord(value);
  if (
    !record ||
    Object.values(record).some((item) => typeof item !== 'string')
  ) {
    throw badRequest('Expected string record');
  }
  return { ...record } as Record<string, string>;
}

export function normalizeScope(
  value: unknown,
): 'SPECIFIED' | 'GENERAL' | 'CUSTOM' {
  return value === 'GENERAL' || value === 'CUSTOM' ? value : 'SPECIFIED';
}

export function badRequest(message: string): Error {
  const error: any = new Error(message);
  error.status = 400;
  return error;
}

export function notFound(resource: string, key: string): Error {
  const error: any = new Error(`${resource} not found: ${key}`);
  error.status = 404;
  return error;
}

export function redactSecrets(value: unknown, parentKey = ''): unknown {
  if (isSecretKey(parentKey))
    return value == null || value === '' ? value : '***';
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      redactSecrets(item, key),
    ]),
  );
}

export function isSerializableObject(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSecretKey(key: string): boolean {
  return /api.?key|token|secret|password|authorization|cookie|credential/i.test(
    key,
  );
}

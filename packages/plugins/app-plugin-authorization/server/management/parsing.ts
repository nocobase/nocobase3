import type {
  AccessConstraintValue,
  AuthorizationSubject,
  ResourceRef,
} from '@nocobase/authorization/core';

/**
 * Request parsing shared by the rule plugins that serve a settings page. Each
 * failure is a TypeError, which the routers answer as `400
 * INVALID_AUTHORIZATION_INPUT`.
 */
export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

export function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item) => string(item, label));
}

export function resource(value: unknown): ResourceRef {
  const item = object(value, 'resource');
  return {
    type: string(item.type, 'resource type'),
    id: string(item.id, 'resource id'),
  };
}

export function subjects(value: unknown): readonly AuthorizationSubject[] {
  if (!Array.isArray(value)) throw new TypeError('subjects must be an array');
  return value.map((item) => {
    const subject = object(item, 'subject');
    return {
      type: string(subject.type, 'subject type'),
      id: string(subject.id, 'subject id'),
    };
  });
}

export function scope(value: unknown): AccessConstraintValue {
  const item = object(value, 'scope');
  const type = string(item.type, 'scope type');
  if (type === 'all') return { type };
  if (type === 'ids') return { type, ids: strings(item.ids, 'scope ids') };
  if (type === 'database')
    return {
      type,
      recordAccess:
        typeof item.recordAccess === 'string'
          ? item.recordAccess
          : object(item.recordAccess, 'recordAccess'),
    };
  throw new TypeError(`Unknown scope type: ${type}`);
}

export function actionScopes(
  value: unknown,
): readonly { action: string; scope: AccessConstraintValue }[] {
  if (!Array.isArray(value)) throw new TypeError('actions must be an array');
  return value.map((entry) => {
    const item = object(entry, 'action');
    return { action: string(item.action, 'action'), scope: scope(item.scope) };
  });
}

export interface ParsedRuleBase {
  key: string;
  title?: string;
  resource: ResourceRef;
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}

/** Everything a Sharing Rule and a Restriction Rule describe the same way. */
export function ruleBase(input: Record<string, unknown>): ParsedRuleBase {
  return {
    key: string(input.key, 'key'),
    ...(input.title ? { title: string(input.title, 'title') } : {}),
    resource: resource(input.resource),
    subjects: subjects(input.subjects),
    ...(input.reason ? { reason: string(input.reason, 'reason') } : {}),
  };
}

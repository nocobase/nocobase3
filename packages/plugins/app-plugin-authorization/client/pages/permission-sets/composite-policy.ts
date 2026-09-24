import type { DataScopeOption } from '../../authorization-client.js';

/** The value a composite grant stores for one data scope. */
export type DataScopeValue =
  string | { type: string; key?: string; params?: unknown };

/** `{ type: 'composite', scopes }`, as a grant draft holds it. */
export interface CompositePolicyDraft {
  readonly type: 'composite';
  readonly scopes: Readonly<Record<string, DataScopeValue>>;
  readonly [key: string]: unknown;
}

type PolicyDraft = { type: string; [key: string]: unknown } | undefined;

/** The value one data scope stores, or `undefined` when the policy sets none. */
export function scopeValue(policy: PolicyDraft, key: string): unknown {
  if (policy?.type !== 'composite') return undefined;
  const scopes: unknown = policy.scopes;
  return scopes && typeof scopes === 'object'
    ? Reflect.get(scopes, key)
    : undefined;
}

/** The record access key a value selects, or the scope's default. */
export function scopeKey(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const key: unknown = Reflect.get(value, 'key');
    if (typeof key === 'string') return key;
  }
  return fallback;
}

export function withScopeValue(
  policy: PolicyDraft,
  key: string,
  value: DataScopeValue,
): CompositePolicyDraft {
  const scopes: unknown = policy?.type === 'composite' ? policy.scopes : {};
  return {
    // Keep what this editor does not own, such as keys a newer server added.
    ...(policy?.type === 'composite' ? policy : {}),
    type: 'composite',
    scopes: {
      ...(scopes && typeof scopes === 'object'
        ? (scopes as Record<string, DataScopeValue>)
        : {}),
      [key]: value,
    },
  };
}

/** The policy a newly granted action starts with: every scope at its default. */
export function defaultCompositePolicy(
  scopes: readonly DataScopeOption[],
): CompositePolicyDraft {
  return {
    type: 'composite',
    scopes: Object.fromEntries(
      scopes.map((scope) => [scope.key, scope.defaultValue]),
    ),
  };
}

import type {
  AuthorizationActions,
  AuthorizationResourceReference,
} from '../../core/builders.js';

/** Validate names through the resource reference shared with registration. */
export function appendScopedAction<
  A extends AuthorizationActions,
  N extends keyof A & string,
  T extends { action: string; scopeKey?: string },
>(
  resource: AuthorizationResourceReference<A>,
  actions: readonly T[],
  action: N,
  scopeKey: keyof A[N] & string,
  value: T,
): readonly T[] {
  const target = resource.scope(action, scopeKey);
  if (
    actions.some(
      (entry) => entry.action === action && entry.scopeKey === scopeKey,
    )
  )
    throw new TypeError('Duplicate rule action scope');
  return [...actions, { ...structuredClone(value), ...target }];
}

import type { Context } from 'hono';
import { normalizeRepositoryPolicy, type RepositoryPolicy } from '@nocobase/db';
import type { RepositoryApiAction } from './repository-routes.js';

const constraintsKey = '@nocobase/app-server/repository-constraints';

/** Trusted middleware may only narrow the policy of the matching endpoint. */
export interface RepositoryRequestConstraint {
  readonly repository: string;
  readonly action: RepositoryApiAction;
  readonly collection: string;
  readonly connection?: string;
  readonly policy: RepositoryPolicy;
}

export function addRepositoryRequestConstraint(
  context: Context,
  constraint: RepositoryRequestConstraint,
): void {
  const previous = getRepositoryRequestConstraints(context);
  context.set(constraintsKey, [
    ...previous,
    { ...constraint, policy: normalizeRepositoryPolicy(constraint.policy) },
  ]);
}

/** Server-owned request state, never populated from a request body. */
export function getRepositoryRequestConstraints(
  context: Context,
): readonly RepositoryRequestConstraint[] {
  return (
    (context.get(constraintsKey) as
      readonly RepositoryRequestConstraint[] | undefined) ?? []
  );
}

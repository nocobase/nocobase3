import type {
  AuthorizationGrant,
  AuthorizationGrantService,
  PermissionGrant,
} from '../../src/core/index.js';

const source = { plugin: 'test', id: 'set' };

/** Flattens stored grants into the per-action grants a provider resolves. */
export function flattenGrants(
  grants: readonly PermissionGrant[],
): Omit<AuthorizationGrant, 'source'>[] {
  return grants.flatMap((grant) =>
    grant.actions.map((entry) => ({
      resource: grant.resource,
      action: entry.action,
      ...(entry.policy ? { policy: entry.policy } : {}),
    })),
  );
}

/** A Grant Provider answering from a fixed list; `*` matches any id. */
export function grantProvider(
  grants: readonly Omit<AuthorizationGrant, 'source'>[],
  unrestricted = false,
): AuthorizationGrantService {
  const all = grants.map((grant) => ({ ...grant, source }));
  return {
    resolveAll: () => Promise.resolve(all),
    resolve: (input) =>
      Promise.resolve(
        all.filter(
          (grant) =>
            grant.resource.type === input.resource.type &&
            (grant.resource.id === '*' ||
              grant.resource.id === input.resource.id) &&
            grant.action === input.action,
        ),
      ),
    unrestricted: () => Promise.resolve(unrestricted),
  };
}

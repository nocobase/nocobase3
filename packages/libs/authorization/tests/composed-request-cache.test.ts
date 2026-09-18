import { expect, it, vi } from 'vitest';
import {
  createAuthorization,
  type AccessConstraint,
  type ResolveAccessConstraintsInput,
} from '../src/core/index.js';

it('shares constraint promises between composed branches and checks without crossing request boundaries', async () => {
  let revision = 1;
  const resolve = vi.fn(
    async (
      input: ResolveAccessConstraintsInput,
    ): Promise<readonly AccessConstraint[]> => [
      {
        source: { plugin: 'rules', id: String(revision) },
        effect: 'restrict',
        value: {
          type: 'ids',
          ids: [`${input.principal.id}:${input.scopeKey}:${revision}`],
        },
      },
    ],
  );
  const unscoped = vi.fn((input: ResolveAccessConstraintsInput) =>
    resolve(input),
  );
  const scoped = vi.fn(() => ({ id: 'rules', resolve }));
  const businessGrant = {
    source: { plugin: 'test', id: 'set' },
    resource: { type: 'resource', id: 'reports' },
    action: 'view',
  };
  const authz = createAuthorization({
    plugins: [
      {
        id: 'test',
        grants: {
          resolveAll: async () => [businessGrant],
          resolve: async () => [],
        },
        setup(host) {
          host.constraints.add({
            id: 'rules',
            resolve: unscoped,
            scope: scoped,
          });
          host.resourceTypes.add({
            resourceType: 'database.collection',
            async authorize(request, context) {
              const grants = await context.grants.resolve(request);
              const constraints = await Promise.all(
                grants.map(async (grant) => {
                  const direct = await context.constraints.resolve({
                    ...request,
                    ...grant.origin,
                  });
                  // Ordinary checks and expansion must receive the same cached result.
                  expect(direct).toBe(grant.policy?.branchConstraints);
                  return direct;
                }),
              );
              return {
                effect: 'conditional',
                conditions: { type: 'document', constraints },
                reasons: [],
              };
            },
          });
        },
      },
    ],
  });
  authz.resourceGroups.add({ name: 'reports', title: 'Reports' });
  authz.resources.add({
    name: 'reports',
    title: 'Reports',
    group: 'reports',
    actions: [
      {
        name: 'view',
        title: 'View',
        scopes: Object.fromEntries(
          ['owned', 'shared'].map((key) => [
            key,
            {
              title: key,
              resource: { type: 'database.collection', id: 'report' },
            },
          ]),
        ),
        grants: ['owned', 'shared'].map((scope) => ({
          resource: { type: 'database.collection', id: 'report' },
          actions: [{ action: 'read', policy: { type: 'database', scope } }],
        })),
      },
    ],
  });
  const request = {
    resource: { type: 'database.collection', id: 'report' },
    action: 'read',
  };
  const identity = { principal: { type: 'user', id: 'alice' } };
  const scope = authz.for(identity);
  const results = await Promise.all([
    scope.authorize(request),
    scope.authorize(request),
  ]);
  expect(results[0].effect).toBe('conditional');
  expect(results[1]).toEqual(results[0]);
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(results[0].conditions?.constraints).toEqual([
    [
      expect.objectContaining({
        value: { type: 'ids', ids: ['alice:owned:1'] },
      }),
    ],
    [
      expect.objectContaining({
        value: { type: 'ids', ids: ['alice:shared:1'] },
      }),
    ],
  ]);
  revision = 2;
  expect(await scope.authorize(request)).toEqual(results[0]);
  expect(resolve).toHaveBeenCalledTimes(2);
  const next = await authz.for(identity).authorize(request);
  expect(next.conditions?.constraints).toEqual([
    [
      expect.objectContaining({
        value: { type: 'ids', ids: ['alice:owned:2'] },
      }),
    ],
    [
      expect.objectContaining({
        value: { type: 'ids', ids: ['alice:shared:2'] },
      }),
    ],
  ]);
  const other = await authz
    .for({ principal: { type: 'user', id: 'bob' } })
    .authorize(request);
  expect(other.conditions?.constraints).toEqual([
    [expect.objectContaining({ value: { type: 'ids', ids: ['bob:owned:2'] } })],
    [
      expect.objectContaining({
        value: { type: 'ids', ids: ['bob:shared:2'] },
      }),
    ],
  ]);
  expect(resolve).toHaveBeenCalledTimes(6);
  expect(scoped).toHaveBeenCalledTimes(3);
  expect(unscoped).not.toHaveBeenCalled();
});

import { describe, expect, it, vi } from 'vitest';
import {
  createAuthorization,
  defaultAccess,
  permissionSets,
  restrictionRules,
  sharingRules,
  type AccessConstraint,
  type AuthorizationPlugin,
  type DefaultAccessOptions,
  type DefaultAccessRule,
  type DefaultAccessStore,
  type PermissionSetsOptions,
  type RestrictionRulesOptions,
  type SharingRulesOptions,
  type SharingRule,
  type SharingRuleStore,
  type RestrictionRule,
  type RestrictionRuleStore,
} from '../src/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

class MockDefaultAccessStore implements DefaultAccessStore {
  constructor(private readonly rules: readonly DefaultAccessRule[]) {}
  list(): Promise<readonly DefaultAccessRule[]> {
    return Promise.resolve(this.rules);
  }
  get(type: string, id: string): Promise<DefaultAccessRule | undefined> {
    return Promise.resolve(
      this.rules.find(
        (rule) => rule.resource.type === type && rule.resource.id === id,
      ),
    );
  }
  set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    return Promise.resolve(rule);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  /** In-memory stores have no transactions. */
  withTransaction(): DefaultAccessStore {
    return this;
  }
}

class MockSharingRuleStore implements SharingRuleStore {
  constructor(private readonly rules: readonly SharingRule[]) {}
  create(rule: SharingRule): Promise<SharingRule> {
    return Promise.resolve(rule);
  }
  update(_key: string, rule: SharingRule): Promise<SharingRule> {
    return Promise.resolve(rule);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  get(key: string): Promise<SharingRule | undefined> {
    return Promise.resolve(this.rules.find((rule) => rule.key === key));
  }
  list(): Promise<readonly SharingRule[]> {
    return Promise.resolve(this.rules);
  }
  /** In-memory stores have no transactions. */
  withTransaction(): SharingRuleStore {
    return this;
  }
}

class MockRestrictionRuleStore implements RestrictionRuleStore {
  constructor(private readonly rules: readonly RestrictionRule[]) {}
  create(rule: RestrictionRule): Promise<RestrictionRule> {
    return Promise.resolve(rule);
  }
  update(_key: string, rule: RestrictionRule): Promise<RestrictionRule> {
    return Promise.resolve(rule);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  get(key: string): Promise<RestrictionRule | undefined> {
    return Promise.resolve(this.rules.find((rule) => rule.key === key));
  }
  list(): Promise<readonly RestrictionRule[]> {
    return Promise.resolve(this.rules);
  }
  /** In-memory stores have no transactions. */
  withTransaction(): RestrictionRuleStore {
    return this;
  }
}

const resource = {
  type: 'database.collection',
  id: 'main.orders',
} as const;

/**
 * A stand-in for a resource plugin: the library hands constraints out as
 * opaque scope references and never interprets them, so what a handler
 * received is the whole of what these tests can observe.
 */
function recordingResource(): {
  plugin: AuthorizationPlugin;
  received: AccessConstraint[][];
} {
  const received: AccessConstraint[][] = [];
  return {
    received,
    plugin: {
      id: 'recording',
      requiresGrants: true,
      setup(authz): void {
        authz.resourceTypes.add({
          resourceType: 'database.collection',
          async authorize(request, context) {
            const grants = await context.grants.resolve(request);
            if (grants.length === 0) {
              return { effect: 'deny', reasons: [] };
            }
            const constraints = await context.constraints.resolve(request);
            received.push([...constraints]);
            return {
              effect: 'conditional',
              conditions: { type: 'recording' },
              reasons: [],
            };
          },
          authorizeUnrestricted() {
            return Promise.resolve({ effect: 'permit', reasons: [] });
          },
        });
      },
    },
  };
}

function readerStore(): MockPermissionSetStore {
  return new MockPermissionSetStore({
    permissionSets: [
      {
        key: 'order-reader',
        grants: [{ resource, actions: [{ action: 'read', policy: {} }] }],
      },
    ],
    assignments: [
      {
        id: 'reader-assignment',
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'order-reader',
      },
    ],
  });
}

describe('official authorization plugins', () => {
  // TypeScript requires the store; this is what a JavaScript caller sees.
  it('requires a store', () => {
    expect(() => permissionSets({} as PermissionSetsOptions)).toThrow(
      /Permission Sets requires a store/,
    );
    expect(() => defaultAccess({} as DefaultAccessOptions)).toThrow(
      /Default Access requires a store/,
    );
    expect(() => sharingRules({} as SharingRulesOptions)).toThrow(
      /Sharing Rules requires a store/,
    );
    expect(() => restrictionRules({} as RestrictionRulesOptions)).toThrow(
      /Restriction Rules requires a store/,
    );
  });

  it('manages permission sets and assignments through the plugin API', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSets({ store: readerStore() })],
    });
    await authorization.permissionSets.create({
      key: 'order-creator',
      grants: [{ resource, actions: [{ action: 'create' }] }],
    });
    const assignment = await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'bob' },
      permissionSet: 'order-creator',
    });
    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'bob' },
      }),
    ).resolves.toHaveLength(1);
    await authorization.permissionSets.revoke(assignment.id);
    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'bob' },
      }),
    ).resolves.toHaveLength(0);
  });

  it('replaces only assignments in one managed scope and notifies once', async () => {
    const changed = vi.fn();
    const store = new MockPermissionSetStore({
      permissionSets: [
        { key: 'hub-administrator', grants: [] },
        { key: 'hub-viewer', grants: [] },
        { key: 'other-role', grants: [] },
      ],
      assignments: [
        {
          id: 'hub-admin',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'hub-administrator',
        },
        {
          id: 'other-role',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'other-role',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store })],
    });
    authorization.onGrantsChanged(changed);

    await authorization.permissionSets.replaceSubjectAssignments({
      subject: { type: 'user', id: 'alice' },
      managedPermissionSets: ['hub-administrator', 'hub-viewer'],
      permissionSets: ['hub-viewer'],
    });

    await expect(
      authorization.permissionSets.listAssignments(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ permissionSet: 'hub-viewer' }),
        expect.objectContaining({ permissionSet: 'other-role' }),
      ]),
    );
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith({ type: 'user', id: 'alice' });

    await authorization.permissionSets.replaceSubjectAssignments({
      subject: { type: 'user', id: 'alice' },
      managedPermissionSets: ['hub-administrator', 'hub-viewer'],
      permissionSets: ['hub-viewer'],
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it('notifies assigned subjects when a Permission Set changes or is deleted', async () => {
    const changed = vi.fn();
    const store = new MockPermissionSetStore({
      permissionSets: [{ key: 'operators', grants: [] }],
      assignments: [
        {
          id: 'alice-operator',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'operators',
        },
        {
          id: 'authenticated-operator',
          subject: { type: 'authenticated', id: '*' },
          permissionSet: 'operators',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store })],
    });
    authorization.onGrantsChanged(changed);

    await authorization.permissionSets.update('operators', {
      key: 'renamed-operators',
      grants: [],
    });

    expect(changed.mock.calls).toEqual([
      [{ type: 'user', id: 'alice' }],
      [{ type: 'authenticated', id: '*' }],
    ]);

    changed.mockClear();
    await authorization.permissionSets.delete('renamed-operators');

    expect(changed.mock.calls).toEqual([
      [{ type: 'user', id: 'alice' }],
      [{ type: 'authenticated', id: '*' }],
    ]);
  });

  it('resolves application-owned Role assignments without putting Roles on Principal', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [{ key: 'role-permissions', grants: [] }],
      assignments: [
        {
          id: 'role-assignment',
          subject: { type: 'role', id: 'manager' },
          permissionSet: 'role-permissions',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store })],
    });

    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'alice' },
        subjects: [{ type: 'role', id: 'manager' }],
      }),
    ).resolves.toMatchObject([{ key: 'role-permissions' }]);
  });

  it('only applies authenticated assignments when the application supplies the subject', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [{ key: 'authenticated-user', grants: [] }],
      assignments: [
        {
          id: 'authenticated-assignment',
          subject: { type: 'authenticated', id: '*' },
          permissionSet: 'authenticated-user',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store })],
    });

    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'anonymous', id: 'guest' },
      }),
    ).resolves.toEqual([]);
    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'alice' },
        subjects: [{ type: 'authenticated', id: '*' }],
      }),
    ).resolves.toMatchObject([{ key: 'authenticated-user' }]);
  });

  it('rejects assignments to an unknown Permission Set', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSets({ store: new MockPermissionSetStore() })],
    });
    await expect(
      authorization.permissionSets.assign({
        permissionSet: 'missing',
        subject: { type: 'user', id: 'alice' },
      }),
    ).rejects.toThrow('Unknown Permission Set: missing');
  });

  it('caches effective grants inside one request-level Authorization scope', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'settings',
          grants: [
            {
              resource: { type: 'test-resource', id: '*' },
              actions: [{ action: 'read' }],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'settings-alice',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'settings',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store })],
    });
    authorization.resourceTypes.add({
      resourceType: 'test-resource',
      async authorize(request, context) {
        await context.grants.resolve(request);
        return { effect: 'permit', reasons: [] };
      },
    });
    const authz = authorization.for({
      principal: { type: 'user', id: 'alice' },
    });

    await authz.can({
      resource: { type: 'test-resource', id: 'first' },
      action: 'read',
    });
    await authz.can({
      resource: { type: 'test-resource', id: 'second' },
      action: 'read',
    });
    await authz.permissions();

    expect(store.findAssignmentsCalls).toBe(1);
    expect(store.getPermissionSetCalls).toBe(1);
  });

  it('hands sharing and restriction scopes to the resource handler', async () => {
    const rules = new MockSharingRuleStore([
      {
        key: 'shared-order',
        title: 'Shared orders',
        resource,
        actions: [
          {
            action: 'read',
            selection: { type: 'records', ids: ['order-1', 'order-2'] },
          },
        ],
        subjects: [{ type: 'user', id: 'alice' }],
      },
    ]);
    const restrictions = new MockRestrictionRuleStore([
      {
        key: 'owned-only',
        title: { key: 'owned', ns: 'orders' },
        resource,
        actions: [
          {
            action: 'read',
            scope: { type: 'database', recordAccess: 'recordsIOwn' },
          },
        ],
        subjects: [{ type: 'user', id: 'alice' }],
      },
    ]);
    const handler = recordingResource();
    const authorization = createAuthorization({
      plugins: [
        permissionSets({ store: readerStore() }),
        sharingRules({ store: rules }),
        restrictionRules({ store: restrictions }),
        handler.plugin,
      ],
    });

    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource,
        action: 'read',
      }),
    ).resolves.toMatchObject({ effect: 'conditional' });
    expect(handler.received).toEqual([
      [
        {
          source: {
            plugin: 'sharing-rules',
            id: 'shared-order',
            title: 'Shared orders',
          },
          effect: 'expand',
          value: { type: 'ids', ids: ['order-1', 'order-2'] },
        },
        {
          source: {
            plugin: 'restriction-rules',
            id: 'owned-only',
            title: { key: 'owned', ns: 'orders' },
          },
          effect: 'restrict',
          value: { type: 'database', recordAccess: 'recordsIOwn' },
        },
      ],
    ]);
  });

  it('resolves independent scopes for each configured action', async () => {
    const defaults = new MockDefaultAccessStore([
      {
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: [
          { action: 'read', scope: { type: 'all' } },
          { action: 'update', scope: { type: 'ids', ids: ['order-1'] } },
        ],
      },
    ]);
    const authorization = createAuthorization({
      plugins: [defaultAccess({ store: defaults })],
    });
    const input = {
      principal: { type: 'user', id: 'alice' },
      resource: { type: 'database.collection', id: 'main.orders' },
    } as const;

    await expect(
      authorization.constraints.resolve({ ...input, action: 'read' }),
    ).resolves.toMatchObject([{ value: { type: 'all' } }]);
    await expect(
      authorization.constraints.resolve({ ...input, action: 'update' }),
    ).resolves.toMatchObject([{ value: { type: 'ids', ids: ['order-1'] } }]);
  });

  it('hands an expanding default access scope to the resource handler', async () => {
    const defaults = new MockDefaultAccessStore([
      { resource, actions: [{ action: 'read', scope: { type: 'all' } }] },
    ]);
    const handler = recordingResource();
    const authorization = createAuthorization({
      plugins: [
        permissionSets({ store: readerStore() }),
        defaultAccess({ store: defaults }),
        handler.plugin,
      ],
    });

    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource,
        action: 'read',
      }),
    ).resolves.toMatchObject({ effect: 'conditional' });
    expect(handler.received).toEqual([
      [
        {
          source: {
            plugin: 'default-access',
            id: 'database.collection:main.orders',
          },
          effect: 'expand',
          value: { type: 'all' },
        },
      ],
    ]);
  });

  it('requires exactly one Grant Provider', () => {
    expect(() =>
      createAuthorization({
        plugins: [recordingResource().plugin],
      }),
    ).toThrow(/requires a Grant Provider/);
    const roles: AuthorizationPlugin = {
      id: 'roles',
      grants: { resolve: async () => [], resolveAll: async () => [] },
    };
    expect(() =>
      createAuthorization({
        plugins: [
          permissionSets({ store: new MockPermissionSetStore() }),
          roles,
        ],
      }),
    ).toThrow(/multiple Grant Providers/);
  });

  it('keeps resource policies owned by their plugins', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'file-reader',
          grants: [
            {
              resource: { type: 'file.object', id: '*' },
              actions: [
                {
                  action: 'download',
                  policy: {
                    type: 'file',
                    recordAccess: ['filesIOwn'],
                  },
                },
              ],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'file-assignment',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'file-reader',
        },
      ],
    });
    let resolvedPolicyType: string | undefined;
    const filePlugin: AuthorizationPlugin = {
      id: 'file',
      requiresGrants: true,
      setup(authz): void {
        const grants = authz.grants;
        authz.resourceTypes.add({
          resourceType: 'file.object',
          async authorize(request) {
            const resolved = await grants.resolve(request);
            resolvedPolicyType = resolved[0]?.policy?.type;
            return {
              effect: resolvedPolicyType === 'file' ? 'permit' : 'deny',
              reasons: [],
            };
          },
        });
      },
    };
    const authorization = createAuthorization({
      plugins: [filePlugin, permissionSets({ store })],
    });
    await expect(
      authorization.can({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'file.object', id: 'file-123' },
        action: 'download',
      }),
    ).resolves.toBe(true);
    expect(resolvedPolicyType).toBe('file');
  });
});

it('loads built-in rule lists once per inspection scope and reloads them in the next scope', async () => {
  const defaults = new MockDefaultAccessStore([]);
  const sharing = new MockSharingRuleStore([]);
  const restrictions = new MockRestrictionRuleStore([]);
  const reads = [
    vi.spyOn(defaults, 'list'),
    vi.spyOn(sharing, 'list'),
    vi.spyOn(restrictions, 'list'),
  ];
  const authz = createAuthorization({
    plugins: [
      permissionSets({ store: readerStore() }),
      defaultAccess({ store: defaults }),
      sharingRules({ store: sharing }),
      restrictionRules({ store: restrictions }),
      {
        id: 'batch-test',
        setup(authorization) {
          authorization.resourceTypes.add({
            resourceType: 'batch',
            async authorize(request, context) {
              await context.constraints.resolve(request);
              return { effect: 'permit', reasons: [] };
            },
          });
        },
      },
    ],
  });
  const identity = { principal: { type: 'user', id: 'alice' } };
  const scope = authz.for(identity);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      scope.explain({
        resource: { type: 'batch', id: String(i) },
        action: 'read',
      }),
    ),
  );
  reads.forEach((read) => expect(read).toHaveBeenCalledTimes(1));
  await authz
    .for(identity)
    .explain({ resource: { type: 'batch', id: '0' }, action: 'read' });
  reads.forEach((read) => expect(read).toHaveBeenCalledTimes(2));
});

it('does not install application settings or management routes', () => {
  const authorization = createAuthorization({
    plugins: [permissionSets({ store: new MockPermissionSetStore() })],
  });
  expect(authorization.routes.list()).toEqual([]);
  expect(authorization.resourceTypes.get('settings')).toBeUndefined();
});

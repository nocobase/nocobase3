import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  databaseAuthorization,
  defaultAccess,
  permissionSets,
  restrictionRules,
  sharingRules,
  recordsIOwn,
  type AuthorizationGrantService,
  type AuthorizationPlugin,
  type DefaultAccessRule,
  type DefaultAccessStore,
  type SharingRule,
  type SharingRuleStore,
  type RestrictionRule,
  type RestrictionRuleStore,
  defineRecordAccessPolicy,
  pages,
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
}

const orders = {
  name: 'orders',
  actions: ['read', 'create', 'update', 'delete'],
  fields: ['id', 'ownerId', 'amount', 'regionId'],
  attributes: { owner: 'ownerId' },
};

function setup() {
  const store = new MockPermissionSetStore({
    permissionSets: [
      {
        key: 'order-reader',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.orders' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: { output: ['id', 'amount', 'ownerId'] },
                  recordAccess: ['recordsIOwn'],
                },
              },
            ],
          },
        ],
      },
    ],
    assignments: [
      {
        id: 'assignment-1',
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'order-reader',
      },
    ],
  });
  const database = databaseAuthorization();
  const authorization = createAuthorization({
    plugins: [permissionSets({ store }), database],
  });
  authorization.database.collections.add(orders);
  return { authorization };
}

const request = () => ({
  principal: { type: 'user', id: 'alice' },
  resource: { type: 'database.collection', id: 'main.orders' },
  action: 'read',
  params: {
    fields: { output: ['id', 'amount'] },
  },
});

describe('official authorization plugins', () => {
  it('registers database collections through the authorization API', () => {
    const { authorization } = setup();
    expect(authorization.database.collections.get('orders')?.name).toBe(
      'main.orders',
    );
    expect(authorization.database.collections.list()).toHaveLength(1);
    expect(() => authorization.database.collections.add(orders)).toThrow(
      /already registered/,
    );
  });

  it('requires a connection when Permission Sets uses its default store', () => {
    expect(() => createAuthorization({ plugins: [permissionSets()] })).toThrow(
      /requires createAuthorization\(\{ connection \}\)/,
    );
  });

  it('keeps typed permission and database APIs on their own plugins', async () => {
    const { authorization } = setup();
    expect(authorization.describe()).toMatchObject({
      plugins: ['permission-sets', 'database'],
      resourceTypes: ['authorization.permission-sets', 'database.collection'],
      grantProvider: 'permission-sets',
    });
    expect(
      authorization.database.grant('orders', {
        read: {
          fields: { output: ['id'] },
          recordAccess: ['recordsIOwn'],
        },
      }),
    ).toMatchObject({
      resource: { type: 'database.collection', id: 'main.orders' },
    });
    expect(recordsIOwn()).toMatchObject({ key: 'recordsIOwn' });
    const policy = defineRecordAccessPolicy({
      key: 'regionalRecords',
      resolve: ({ principal }) => ({
        $and: [
          {
            regionId: {
              $eq: String(principal.attributes?.regionId),
            },
          },
        ],
      }),
    });
    authorization.database.recordAccess.add(policy);
    expect(authorization.database.recordAccess.get('regionalRecords')).toBe(
      policy,
    );
    expect(authorization.database.recordAccess.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'allRecords' }),
        expect.objectContaining({ key: 'recordsIOwn' }),
        expect.objectContaining({ key: 'recordsICreated' }),
        policy,
      ]),
    );
    expect(() => authorization.database.recordAccess.add(policy)).toThrow(
      /already registered/,
    );
    await expect(
      authorization.permissionSets.getEffective({
        principal: { type: 'user', id: 'alice' },
      }),
    ).resolves.toHaveLength(1);
  });

  it('returns a conditional Filter AST for collection operations', async () => {
    const { authorization } = setup();
    await expect(authorization.authorize(request())).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        type: 'database',
        collection: 'main.orders',
        action: 'read',
        filter: {
          $and: [
            {
              ownerId: {
                $eq: 'alice',
              },
            },
          ],
        },
      },
    });
    await expect(authorization.can(request())).resolves.toBe(false);
    await expect(
      authorization.authorize({
        ...request(),
        params: {
          fields: { output: ['missing'] },
        },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'UNKNOWN_DATABASE_FIELD' }],
    });
  });

  it('manages permission sets and assignments through the plugin API', async () => {
    const { authorization } = setup();
    await authorization.permissionSets.create({
      key: 'order-creator',
      grants: [
        authorization.database.grant('orders', {
          create: { fields: { input: ['amount'], output: ['id', 'amount'] } },
        }),
      ],
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
          key: 'pages',
          grants: [
            {
              resource: { type: 'page', id: '*' },
              actions: [{ action: 'access' }],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'pages-alice',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'pages',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store }), pages()],
    });
    const authz = authorization.for({
      principal: { type: 'user', id: 'alice' },
    });

    await authz.can({
      resource: { type: 'page', id: 'home' },
      action: 'access',
    });
    await authz.can({
      resource: { type: 'page', id: 'settings' },
      action: 'access',
    });
    await authz.permissions();

    expect(store.findAssignmentsCalls).toBe(1);
    expect(store.getPermissionSetCalls).toBe(1);
  });

  it('registers an application-defined Record Access policy', async () => {
    const regionalRecords = defineRecordAccessPolicy<{ field: string }>({
      key: 'regionalRecords',
      resolve: ({ principal, params }) => ({
        $and: [
          {
            [params.field]: {
              $eq: String(principal.attributes?.regionId),
            },
          },
        ],
      }),
    });
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'regional-reader',
          grants: [
            {
              resource: { type: 'database.collection', id: 'main.orders' },
              actions: [
                {
                  action: 'read',
                  policy: {
                    type: 'database',
                    fields: { output: ['id', 'regionId'] },
                    recordAccess: [
                      {
                        key: 'regionalRecords',
                        params: { field: 'regionId' },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'regional-assignment',
          subject: { type: 'user', id: 'rita' },
          permissionSet: 'regional-reader',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store }), databaseAuthorization()],
    });
    authorization.database.collections.add(orders);
    authorization.database.recordAccess.add(regionalRecords);
    const base = {
      principal: {
        type: 'user',
        id: 'rita',
        attributes: { regionId: 'north' },
      },
      resource: { type: 'database.collection', id: 'main.orders' },
      action: 'read',
    };
    await expect(
      authorization.authorize({
        ...base,
        params: {
          fields: { output: ['id', 'regionId'] },
        },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        type: 'database',
        filter: {
          $and: [{ regionId: { $eq: 'north' } }],
        },
      },
    });
  });

  it('rejects invalid Record Access Filter AST', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'invalid-filter-reader',
          grants: [
            {
              resource: { type: 'database.collection', id: 'main.orders' },
              actions: [
                {
                  action: 'read',
                  policy: {
                    type: 'database',
                    fields: { output: ['id'] },
                    recordAccess: ['invalidFilter'],
                  },
                },
              ],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'invalid-filter-assignment',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'invalid-filter-reader',
        },
      ],
    });
    const authorization = createAuthorization({
      plugins: [permissionSets({ store }), databaseAuthorization()],
    });
    authorization.database.collections.add(orders);
    authorization.database.recordAccess.add({
      key: 'invalidFilter',
      resolve: () => ({ unknownField: { $eq: 'value' } }),
    });

    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'read',
        params: { fields: { output: ['id'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [
        {
          code: 'DATABASE_AUTHORIZATION_FAILED',
          message: 'Database Filter AST must use $and or $or as its root',
        },
      ],
    });
  });

  it('applies generic sharing and restriction scopes to database records', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'order-reader',
          grants: [
            {
              resource: { type: 'database.collection', id: 'main.orders' },
              actions: [
                {
                  action: 'read',
                  policy: {
                    type: 'database',
                    fields: { output: ['id', 'ownerId'] },
                  },
                },
              ],
            },
          ],
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
    const rules = new MockSharingRuleStore([
      {
        key: 'shared-order',
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: ['read'],
        subjects: [{ type: 'user', id: 'alice' }],
        selection: {
          type: 'records',
          recordIds: ['order-1', 'order-2'],
        },
      },
    ]);
    const restrictions = new MockRestrictionRuleStore([
      {
        key: 'owned-only',
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: ['read'],
        subjects: [{ type: 'user', id: 'alice' }],
        scope: {
          type: 'database',
          recordAccess: 'recordsIOwn',
        },
      },
    ]);
    const authorization = createAuthorization({
      plugins: [
        permissionSets({ store }),
        sharingRules({ store: rules }),
        restrictionRules({ store: restrictions }),
        databaseAuthorization(),
      ],
    });
    authorization.database.collections.add(orders);
    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'read',
        params: {
          fields: { output: ['id', 'ownerId'] },
        },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        type: 'database',
        filter: {
          $and: [
            { $and: [{ id: { $in: ['order-1', 'order-2'] } }] },
            { $and: [{ ownerId: { $eq: 'alice' } }] },
          ],
        },
      },
    });
  });

  it('allows generic default access to expand a database grant scope', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'reader',
          grants: [
            {
              resource: { type: 'database.collection', id: 'main.orders' },
              actions: [
                {
                  action: 'read',
                  policy: {
                    type: 'database',
                    fields: { output: ['id'] },
                  },
                },
              ],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'reader',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'reader',
        },
      ],
    });
    const defaults = new MockDefaultAccessStore([
      {
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: ['read'],
        scope: { type: 'all' },
      },
    ]);
    const authorization = createAuthorization({
      plugins: [
        permissionSets({ store }),
        defaultAccess({ store: defaults }),
        databaseAuthorization(),
      ],
    });
    authorization.database.collections.add(orders);
    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'read',
        params: {
          fields: { output: ['id'] },
        },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        type: 'database',
        filter: { $and: [] },
      },
    });
  });

  it('uses a Role grant provider without installing Permission Sets', async () => {
    const roleGrants: AuthorizationGrantService = {
      async resolve(input) {
        if (
          input.principal.id !== 'role-user' ||
          input.resource.type !== 'database.collection' ||
          input.resource.id !== 'main.orders' ||
          input.action !== 'read'
        ) {
          return [];
        }
        return [
          {
            source: { plugin: 'roles', id: 'order-reader' },
            resource: input.resource,
            action: input.action,
            policy: {
              type: 'database',
              fields: { output: ['id', 'amount'] },
              recordAccess: ['allRecords'],
            },
          },
        ];
      },
      async resolveAll() {
        return [];
      },
    };
    const roles: AuthorizationPlugin = {
      id: 'roles',
      grants: roleGrants,
    };
    const authorization = createAuthorization({
      plugins: [databaseAuthorization(), roles],
    });
    authorization.database.collections.add(orders);
    expect(authorization.describe().plugins).toEqual(['roles', 'database']);
    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'role-user' },
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'read',
        params: {
          fields: { output: ['id', 'amount'] },
        },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        type: 'database',
        filter: { $and: [] },
      },
    });
  });

  it('requires exactly one Grant Provider', () => {
    expect(() =>
      createAuthorization({
        plugins: [databaseAuthorization()],
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
        authz.resources.add({
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

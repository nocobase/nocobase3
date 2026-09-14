import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createAuthorization,
  defaultAccess,
  permissionSets,
  restrictionRules,
  sharingRules,
  type AuthorizationGrantService,
  type AuthorizationPlugin,
  type RestrictionRule,
  type RestrictionRuleStore,
  type SharingRule,
  type SharingRuleStore,
  type DefaultAccessRule,
  type DefaultAccessStore,
} from '@nocobase/authorization';
import {
  databaseAuthorization,
  defineRecordAccessPolicy,
  recordsIOwn,
  condition,
} from '../server/database/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';
import { createOrdersDatabase, orderFields } from './orders-database.js';

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

let database: DatabaseManager;
let connection: DatabaseConnection;

beforeAll(async () => {
  database = await createOrdersDatabase();
  connection = database.connection();
});

afterAll(async () => {
  await database.destroy();
});

const resource = { type: 'database.collection', id: 'main.orders' } as const;

const ast = (root: object): object => ({
  kind: 'filter',
  version: 1,
  collection: 'orders',
  root,
});

const and = (items: readonly object[]): object => ({
  kind: 'group',
  logic: 'and',
  items,
});

function readerStore(policy: object): MockPermissionSetStore {
  return new MockPermissionSetStore({
    permissionSets: [
      {
        key: 'order-reader',
        grants: [{ resource, actions: [{ action: 'read', policy }] }],
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

function setup(
  policy: object = {
    type: 'database',
    fields: { output: ['id', 'amount', 'ownerId'] },
    recordAccess: ['recordsIOwn'],
  },
) {
  return createAuthorization({
    connection,
    plugins: [
      permissionSets({ store: readerStore(policy) }),
      databaseAuthorization(),
    ],
  });
}

const request = {
  principal: { type: 'user', id: 'alice' },
  resource,
  action: 'read',
  params: { fields: { output: ['id', 'amount'] } },
};

describe('database resource authorization', () => {
  it('denies every Collection when the plugin was installed without a connection', async () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({ store: readerStore({ type: 'database' }) }),
        databaseAuthorization(),
      ],
    });

    await expect(authorization.authorize(request)).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'DATABASE_UNAVAILABLE' }],
    });
  });

  it('denies a Collection db does not hold', async () => {
    await expect(
      setup().authorize({
        ...request,
        resource: { type: 'database.collection', id: 'main.invoices' },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'UNKNOWN_DATABASE_RESOURCE_OR_ACTION' }],
    });
  });

  it('keeps typed permission and database APIs on their own plugins', async () => {
    const authorization = setup();
    expect(authorization.describe()).toMatchObject({
      plugins: ['permission-sets', 'database'],
      resourceTypes: ['authorization.settings', 'database.collection'],
      grantProvider: 'permission-sets',
    });
    expect(
      authorization.database.grant('orders', {
        read: { fields: { output: ['id'] }, recordAccess: ['recordsIOwn'] },
      }),
    ).toMatchObject({ resource });
    expect(recordsIOwn()).toMatchObject({ key: 'recordsIOwn' });
    const policy = defineRecordAccessPolicy({
      key: 'regionalRecords',
      resolve: ({ principal }) =>
        condition('regionId', '$eq', String(principal.attributes?.regionId)),
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

  it('returns a conditional scope and field list for collection operations', async () => {
    const authorization = setup();
    await expect(authorization.authorize(request)).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        type: 'database',
        collection: 'main.orders',
        action: 'read',
        scope: ast(and([condition('ownerId', '$eq', 'alice')])),
        fields: ['id', 'amount', 'ownerId'],
      },
    });
    await expect(authorization.can(request)).resolves.toBe(false);
    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['missing'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'UNKNOWN_DATABASE_FIELD' }],
    });
  });

  it('expands a wildcard grant to the registered field list', async () => {
    const authorization = setup({
      type: 'database',
      fields: { output: '*' },
      recordAccess: ['allRecords'],
    });
    await expect(
      authorization.authorize({ ...request, params: {} }),
    ).resolves.toMatchObject({
      conditions: { scope: true, fields: orderFields },
    });
  });

  it('omits a generated primary key from what a create accepts', async () => {
    const authorization = createAuthorization({
      connection,
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore({
            permissionSets: [
              {
                key: 'order-creator',
                grants: [
                  {
                    resource,
                    actions: [
                      {
                        action: 'create',
                        policy: { type: 'database', fields: { input: '*' } },
                      },
                    ],
                  },
                ],
              },
            ],
            assignments: [
              {
                id: 'creator-assignment',
                subject: { type: 'user', id: 'alice' },
                permissionSet: 'order-creator',
              },
            ],
          }),
        }),
        databaseAuthorization(),
      ],
    });

    await expect(
      authorization.authorize({ ...request, action: 'create', params: {} }),
    ).resolves.toMatchObject({
      conditions: {
        action: 'create',
        scope: true,
        fields: orderFields.filter((field) => field !== 'id'),
      },
    });
  });

  it('takes the field a Record Access policy compares from its params', async () => {
    const authorization = setup({
      type: 'database',
      fields: { output: ['id'] },
      recordAccess: [{ key: 'recordsICreated', params: { field: 'ownerId' } }],
    });

    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id'] } },
      }),
    ).resolves.toMatchObject({
      conditions: { scope: ast(and([condition('ownerId', '$eq', 'alice')])) },
    });
  });

  it('denies a Record Access policy pointed at a field the Collection has not', async () => {
    const authorization = setup({
      type: 'database',
      fields: { output: ['id'] },
      recordAccess: [{ key: 'recordsIOwn', params: { field: 'missing' } }],
    });

    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [
        {
          code: 'DATABASE_AUTHORIZATION_FAILED',
          message:
            'Collection "orders" has no field "missing" to own records by',
        },
      ],
    });
  });

  it('registers an application-defined Record Access policy', async () => {
    const regionalRecords = defineRecordAccessPolicy<{ field: string }>({
      key: 'regionalRecords',
      resolve: ({ principal, params }) =>
        condition(params.field, '$eq', String(principal.attributes?.regionId)),
    });
    const authorization = setup({
      type: 'database',
      fields: { output: ['id', 'regionId'] },
      recordAccess: [{ key: 'regionalRecords', params: { field: 'regionId' } }],
    });
    authorization.database.recordAccess.add(regionalRecords);

    await expect(
      authorization.authorize({
        principal: {
          type: 'user',
          id: 'alice',
          attributes: { regionId: 'north' },
        },
        resource,
        action: 'read',
        params: { fields: { output: ['id', 'regionId'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        scope: ast(and([condition('regionId', '$eq', 'north')])),
      },
    });
  });

  it('resolves a custom filter Record Access policy from grant params', async () => {
    const authorization = setup({
      type: 'database',
      fields: { output: ['id', 'regionId'] },
      recordAccess: [
        {
          key: 'customFilter',
          params: { filter: condition('regionId', '$eq', 'east') },
        },
      ],
    });
    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id', 'regionId'] } },
      }),
    ).resolves.toMatchObject({
      conditions: { scope: ast(and([condition('regionId', '$eq', 'east')])) },
    });
  });

  it('returns input field constraints and an unrestricted scope for create', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'order-creator',
          grants: [
            {
              resource,
              actions: [
                {
                  action: 'create',
                  policy: {
                    type: 'database',
                    fields: { input: ['amount', 'ownerId'], output: ['id'] },
                  },
                },
              ],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'order-creator-alice',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'order-creator',
        },
      ],
    });
    const authorization = createAuthorization({
      connection,
      plugins: [permissionSets({ store }), databaseAuthorization()],
    });

    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource,
        action: 'create',
        params: { fields: { input: ['amount'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        action: 'create',
        scope: true,
        fields: ['amount', 'ownerId'],
      },
    });
  });

  it('rejects a Record Access policy that returns an invalid scope', async () => {
    const authorization = setup({
      type: 'database',
      fields: { output: ['id'] },
      recordAccess: ['invalidFilter'],
    });
    authorization.database.recordAccess.add({
      key: 'invalidFilter',
      resolve: () => condition('unknownField', '$eq', 'value'),
    });

    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [
        {
          code: 'DATABASE_AUTHORIZATION_FAILED',
          message: 'Unknown Record Access scope field: unknownField',
        },
      ],
    });
  });

  it('ors positive scopes together and ands every restriction', async () => {
    const rules = new MockSharingRuleStore([
      {
        key: 'shared-order',
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
    const authorization = createAuthorization({
      connection,
      plugins: [
        permissionSets({
          store: readerStore({
            type: 'database',
            fields: { output: ['id', 'ownerId'] },
          }),
        }),
        sharingRules({ store: rules }),
        restrictionRules({ store: restrictions }),
        databaseAuthorization(),
      ],
    });

    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id', 'ownerId'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: {
        scope: ast(
          and([
            {
              kind: 'group',
              logic: 'or',
              items: [
                condition('id', '$eq', 'order-1'),
                condition('id', '$eq', 'order-2'),
              ],
            },
            condition('ownerId', '$eq', 'alice'),
          ]),
        ),
      },
    });
  });

  it('denies when no positive scope allows any row', async () => {
    const authorization = setup({
      type: 'database',
      fields: { output: ['id'] },
    });
    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'NO_RECORD_ACCESS' }],
    });
  });

  it('lets a generic default access scope open a grant with no Record Access', async () => {
    const defaults = new MockDefaultAccessStore([
      { resource, actions: [{ action: 'read', scope: { type: 'all' } }] },
    ]);
    const authorization = createAuthorization({
      connection,
      plugins: [
        permissionSets({
          store: readerStore({ type: 'database', fields: { output: ['id'] } }),
        }),
        defaultAccess({ store: defaults }),
        databaseAuthorization(),
      ],
    });

    await expect(
      authorization.authorize({
        ...request,
        params: { fields: { output: ['id'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: { scope: true },
    });
  });

  it('uses a Role grant provider without installing Permission Sets', async () => {
    const roleGrants: AuthorizationGrantService = {
      async resolve(input) {
        if (input.principal.id !== 'role-user') return [];
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
    const roles: AuthorizationPlugin = { id: 'roles', grants: roleGrants };
    const authorization = createAuthorization({
      connection,
      plugins: [databaseAuthorization(), roles],
    });
    expect(authorization.describe().plugins).toEqual(['roles', 'database']);

    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'role-user' },
        resource,
        action: 'read',
        params: { fields: { output: ['id', 'amount'] } },
      }),
    ).resolves.toMatchObject({
      effect: 'conditional',
      conditions: { scope: true },
    });
  });

  it('denies an unknown collection, action or field for an unrestricted identity', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [{ key: 'superuser', grants: [] }],
      assignments: [
        {
          id: 'root-superuser',
          subject: { type: 'user', id: 'root' },
          permissionSet: 'superuser',
        },
      ],
    });
    const authorization = createAuthorization({
      connection,
      plugins: [permissionSets({ store }), databaseAuthorization()],
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      unrestricted: true,
    });
    const principal = { type: 'user', id: 'root' } as const;

    await expect(
      authorization.authorize({
        principal,
        resource: { type: 'database.collection', id: 'main.invoices' },
        action: 'read',
      }),
    ).resolves.toMatchObject({
      reasons: [{ code: 'UNKNOWN_DATABASE_RESOURCE_OR_ACTION' }],
    });
    await expect(
      authorization.authorize({ principal, resource, action: 'archive' }),
    ).resolves.toMatchObject({
      reasons: [{ code: 'UNKNOWN_DATABASE_RESOURCE_OR_ACTION' }],
    });
    await expect(
      authorization.authorize({
        principal,
        resource,
        action: 'read',
        params: { fields: { output: ['secret'] } },
      }),
    ).resolves.toMatchObject({
      reasons: [{ code: 'UNKNOWN_DATABASE_FIELD' }],
    });
    await expect(
      authorization.authorize({ principal, resource, action: 'read' }),
    ).resolves.toEqual({
      effect: 'conditional',
      conditions: {
        type: 'database',
        collection: 'main.orders',
        action: 'read',
        scope: true,
        fields: orderFields,
      },
      reasons: [
        {
          code: 'UNRESTRICTED_ACCESS',
          message: 'Unrestricted access allows main.orders.read',
          plugin: 'database',
        },
      ],
    });
  });
});

describe('policyFor', () => {
  it('folds a request’s decisions into a Repository Policy', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [
        {
          key: 'order-editor',
          grants: [
            {
              resource,
              actions: [
                {
                  action: 'read',
                  policy: {
                    type: 'database',
                    fields: { output: '*' },
                    recordAccess: ['allRecords'],
                  },
                },
                {
                  action: 'create',
                  policy: {
                    type: 'database',
                    fields: { input: ['amount'] },
                  },
                },
                {
                  action: 'update',
                  policy: {
                    type: 'database',
                    fields: { input: ['amount'] },
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
          id: 'editor-assignment',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'order-editor',
        },
      ],
    });
    const authorization = createAuthorization({
      connection,
      plugins: [permissionSets({ store }), databaseAuthorization()],
    });
    const scope = authorization.for({
      principal: { type: 'user', id: 'alice' },
    });

    await expect(
      authorization.database.policyFor('orders', scope),
    ).resolves.toEqual({
      read: { scope: true, fields: orderFields },
      create: { scope: true, fields: ['amount'] },
      update: {
        scope: ast(and([condition('ownerId', '$eq', 'alice')])),
        fields: ['amount'],
      },
      // The grant says nothing about deleting, so the action is denied.
      delete: false,
    });
  });

  it('folds every action to true for an unrestricted identity', async () => {
    const store = new MockPermissionSetStore({
      permissionSets: [{ key: 'superuser', grants: [] }],
      assignments: [
        {
          id: 'root-superuser',
          subject: { type: 'user', id: 'root' },
          permissionSet: 'superuser',
        },
      ],
    });
    const authorization = createAuthorization({
      connection,
      plugins: [permissionSets({ store }), databaseAuthorization()],
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      unrestricted: true,
    });

    await expect(
      authorization.database.policyFor(
        'orders',
        authorization.for({ principal: { type: 'user', id: 'root' } }),
      ),
    ).resolves.toEqual({
      read: true,
      create: true,
      update: true,
      delete: true,
    });
  });

  it('denies every action for an identity with no grants', async () => {
    const authorization = setup();
    await expect(
      authorization.database.policyFor(
        'orders',
        authorization.for({ principal: { type: 'user', id: 'bob' } }),
      ),
    ).resolves.toEqual({
      read: false,
      create: false,
      update: false,
      delete: false,
    });
  });
});

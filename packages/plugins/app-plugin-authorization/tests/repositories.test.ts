import { defineAuthorizationResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '../server/index.js';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import { defineRepositoryApiRoutes } from '@nocobase/app-server/router';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import permissionSetMigration from '../database/migrations/202608210001_create_permission_set_tables.js';
import { createAppAuthorization } from '../server/authorization.js';

let database: DatabaseManager;
let signedInAs = 'alice';

beforeEach(async () => {
  database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = database.connection();
  await permissionSetMigration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  await connection.builder.createCollections([
    {
      name: 'authzCustomers',
      definition: (customers) => {
        customers.string('id', { length: 64 }).primary().notNull();
        customers.string('name', { length: 120 }).notNull();
      },
    },
    {
      name: 'authzOrders',
      definition: (orders) => {
        orders.string('id', { length: 64 }).primary().notNull();
        orders.string('ownerId', { length: 64 }).notNull();
        orders.integer('amount');
        orders.string('customerId', { length: 64 });
        orders
          .belongsTo('customer', 'authzCustomers')
          .targetKey('id')
          .foreignKey('customerId')
          .constraints(false);
      },
    },
  ]);
  await connection.repository('authzCustomers').createOne({
    values: { id: 'acme', name: 'Acme' },
  });
  for (const row of [
    { id: 'order-1', ownerId: 'alice', amount: 10 },
    { id: 'order-2', ownerId: 'bob', amount: 20 },
  ]) {
    await connection.repository('authzOrders').createOne({ values: row });
  }
  signedInAs = 'alice';
});

afterEach(async () => {
  await database.destroy();
});

describe('collection policy enforcement', () => {
  it('does not move a relation capability from an owned-record grant onto all records', async () => {
    const authorization = createAuthorization();
    authorization.db.collections.add('authzOrders');
    await createSet('own-connection', [
      {
        resource: { type: 'database.collection', id: 'authzOrders' },
        actions: [
          {
            action: 'update',
            policy: {
              type: 'database',
              fields: [],
              recordAccess: ['recordsIOwn'],
              relations: { customer: { connect: {} } },
            },
          },
        ],
      },
    ]);
    await createSet('all-amounts', [
      {
        resource: { type: 'database.collection', id: 'authzOrders' },
        actions: [
          {
            action: 'read',
            policy: {
              type: 'database',
              fields: ['id'],
              recordAccess: ['allRecords'],
            },
          },
          {
            action: 'update',
            policy: {
              type: 'database',
              fields: ['amount'],
              recordAccess: ['allRecords'],
            },
          },
        ],
      },
    ]);
    await assign('own-connection', 'alice');
    await assign('all-amounts', 'alice');
    const policy = await authorization.db.policyFor(
      'authzOrders',
      authorization.for({ principal: { type: 'user', id: 'alice' } }),
    );
    const repository = database.repository('authzOrders').withPolicy(policy);
    await expect(
      repository.updateOne({
        filter: { id: 'order-2' },
        values: { customer: { connect: { id: 'acme' } } },
      }),
    ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    await repository.updateOne({
      filter: { id: 'order-1' },
      values: { customer: { connect: { id: 'acme' } } },
    });
    expect(
      await database
        .repository('authzOrders')
        .findOne({ filter: { id: 'order-2' } }),
    ).toMatchObject({ customerId: null });
  });
});

function createAuthorization(): ReturnType<typeof createAppAuthorization> {
  return createAppAuthorization({ connection: database.connection() });
}

function post(
  router: Hono,
  path: string,
  body: object = {},
): Promise<Response> {
  return router.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The grant `DatabaseAuthorizationService.grant()` produces, stored as a set. */
async function grantOrders(config: object): Promise<void> {
  await createSet('order-reader', [
    {
      resource: { type: 'database.collection', id: 'authzOrders' },
      actions: ['read', 'create', 'update', 'delete'].map((action) => ({
        action,
        policy: {
          type: 'database',
          fields: '*',
          ...config,
        },
      })),
    },
  ]);
  await assign('order-reader', signedInAs);
}

async function createSet(
  key: string,
  grants: readonly object[],
): Promise<void> {
  const now = new Date();
  await database
    .connection()
    .query.insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key,
      title: JSON.stringify(key),
      grants: JSON.stringify(grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function assign(key: string, userId: string): Promise<void> {
  const now = new Date();
  await database
    .connection()
    .query.insertInto('authorizationPermissionSetAssignments')
    .values({
      id: `user:${userId}:${key}`,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey: key,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

const quoteAccess = defineDatabasePermission((permission) =>
  permission.collection('authzOrders').read(['id', 'ownerId', 'amount']),
);
const businessOrders = defineAuthorizationResource('sales.orders', (resource) =>
  resource
    .group('sales')
    .title('Orders')
    .action('view', (action) => action.grant('orders', quoteAccess))
    .action('edit', (action) =>
      action.grant('orders', quoteAccess.update(['amount'])),
    ),
);

async function businessRoutes(
  options: { collection?: string; authorize?: boolean } = {},
) {
  const authorization = createAuthorization();
  authorization.resourceGroups.add({ name: 'sales', title: 'Sales' });
  authorization.db.collections.add({ name: 'authzOrders' });
  businessOrders.register(authorization.resources);
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  const router = new Hono();
  router.use('*', async (c, next) => {
    c.set('auth', { user: { id: signedInAs } });
    await next();
  });
  if (options.authorize !== false)
    router.use(
      '*',
      authorization.db.authorizeRepository({
        repository: 'salesOrders',
        resource: businessOrders.reference(),
        actions: { findMany: 'view', count: 'view', updateOne: 'edit' },
      }),
    );
  router.route(
    '/',
    await defineRepositoryApiRoutes({
      repositories: [
        {
          name: 'salesOrders',
          collection: options.collection ?? 'authzOrders',
          policy: { read: true, update: true, create: false, delete: true },
          actions: { findMany: {}, count: {}, updateOne: {}, deleteOne: {} },
        },
      ],
    }).createRouter({ container }),
  );
  return router;
}

async function grantBusinessOrders() {
  await createSet('business', [
    businessOrders.reference().grant({
      view: { orders: 'allRecords' },
      edit: { orders: 'recordsIOwn' },
    }),
  ]);
  await assign('business', signedInAs);
}

describe('business operation Repository middleware', () => {
  it('does not accept collection grants in place of the bound business action', async () => {
    await grantOrders({ recordAccess: ['allRecords'] });
    expect(
      (await post(await businessRoutes(), '/salesOrders:findMany')).status,
    ).toBe(403);
  });

  it('uses the exact operation scope and fields even with broad collection grants', async () => {
    await grantBusinessOrders();
    await grantOrders({ recordAccess: ['allRecords'] });
    const router = await businessRoutes();
    const rows = await post(router, '/salesOrders:findMany');
    expect(rows.status).toBe(200);
    expect((await rows.json()).data).toHaveLength(2);
    expect((await post(router, '/salesOrders:count')).status).toBe(200);
    expect(
      (
        await post(router, '/salesOrders:updateOne', {
          filter: { id: 'order-1' },
          values: { amount: 15 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(router, '/salesOrders:updateOne', {
          filter: { id: 'order-2' },
          values: { amount: 15 },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post(router, '/salesOrders:updateOne', {
          filter: { id: 'order-1' },
          values: { ownerId: 'bob' },
        })
      ).status,
    ).toBe(403);
    signedInAs = 'bob';
    expect((await post(router, '/salesOrders:findMany')).status).toBe(403);
  });

  it('denies unmapped methods and mismatched target collections', async () => {
    await grantBusinessOrders();
    expect(
      (
        await post(await businessRoutes(), '/salesOrders:deleteOne', {
          filter: { id: 'order-1' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          await businessRoutes({ collection: 'authzCustomers' }),
          '/salesOrders:findMany',
        )
      ).status,
    ).toBe(403);
  });

  it('preserves the original Repository policy without the middleware', async () => {
    expect(
      (
        await post(
          await businessRoutes({ authorize: false }),
          '/salesOrders:findMany',
        )
      ).status,
    ).toBe(200);
  });

  it('rejects multi-scope operations, including two scopes of the same collection', () => {
    const authorization = createAuthorization();
    authorization.resourceGroups.add({ name: 'sales', title: 'Sales' });
    for (const target of ['authzOrders', 'authzCustomers']) {
      const complex = defineAuthorizationResource(
        `complex.${target}`,
        (resource) =>
          resource.group('sales').action('submit', (action) =>
            action.grant('orders', quoteAccess.update(['amount'])).grant(
              'parent',
              defineDatabasePermission((p) =>
                p.collection(target).read(['id']),
              ),
            ),
          ),
      );
      complex.register(authorization.resources);
      expect(() =>
        authorization.db.authorizeRepository({
          repository: 'orders',
          resource: complex.reference(),
          actions: { updateOne: 'submit' },
        }),
      ).toThrow('single-scope');
    }
  });

  it('rejects an unknown action or a binding without the required database operation', () => {
    const authorization = createAuthorization();
    authorization.resourceGroups.add({ name: 'sales', title: 'Sales' });
    businessOrders.register(authorization.resources);
    expect(() =>
      authorization.db.authorizeRepository({
        repository: 'orders',
        resource: businessOrders.reference(),
        actions: { updateOne: 'view' },
      }),
    ).toThrow('matching database operation');
  });
});

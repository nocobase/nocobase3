import sqlite from '@nocobase/db-sqlite';
import {
  buildRepositoryPolicy,
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
import type { RepositoryAuthorizationExposure } from '../server/repositories.js';

const ordersPolicy = buildRepositoryPolicy((policy) =>
  policy
    .read((read) => read.scope(true).fields('id', 'ownerId', 'amount'))
    .create((create) =>
      create
        .scope(true)
        .fields('id', 'ownerId', 'amount')
        .relation('customer', (customer) => customer.connect()),
    )
    .update((update) => update.scope(true).fields('amount'))
    .delete(true),
);

const exposures: readonly RepositoryAuthorizationExposure[] = [
  {
    name: 'authzOrders',
    resource: 'authzOrders',
    policy: ordersPolicy,
    actions: { findMany: {}, count: {}, createOne: {} },
  },
  {
    name: 'authzCustomers',
    policy: { read: true, create: false, update: false, delete: false },
    actions: { findMany: {} },
  },
];

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

describe('authorizing repository API routes', () => {
  it('keeps a user to the rows their Record Access selects', async () => {
    await grantOrders({ recordAccess: ['recordsIOwn'] });
    const router = await routes();

    const rows = await post(router, '/authzOrders:findMany');
    const count = await post(router, '/authzOrders:count');

    expect(rows.status).toBe(200);
    await expect(rows.json()).resolves.toEqual({
      data: [{ id: 'order-1', ownerId: 'alice', amount: 10 }],
    });
    await expect(count.json()).resolves.toEqual({ data: 1 });
  });

  it('refuses a caller no grant reaches', async () => {
    await grantOrders({ recordAccess: ['recordsIOwn'] });
    signedInAs = 'carol';
    const router = await routes();

    const response = await post(router, '/authzOrders:findMany');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'READ_FORBIDDEN',
    });
  });

  it('gives an unrestricted identity every row and only the exposed fields', async () => {
    await createSet('root', []);
    await assign('root', 'root');
    signedInAs = 'root';
    const router = await routes();

    const response = await post(router, '/authzOrders:findMany');

    await expect(response.json()).resolves.toEqual({
      data: [
        { id: 'order-1', ownerId: 'alice', amount: 10 },
        { id: 'order-2', ownerId: 'bob', amount: 20 },
      ],
    });
  });

  // The middleware is mounted on findMany alone below, so count resolves no
  // principal. Falling back to the shape would hand out an unauthorized read.
  it('refuses an action the middleware was not mounted on', async () => {
    await grantOrders({ recordAccess: ['allRecords'] });
    const router = await routes({ mount: ['/authzOrders:findMany'] });

    const response = await post(router, '/authzOrders:count');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PRINCIPAL_REQUIRED',
    });
  });

  it('leaves an exposure that names no resource alone', async () => {
    const router = await routes();

    const response = await post(router, '/authzCustomers:findMany');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'acme', name: 'Acme' }],
    });
  });

  // A grant carries no relation rules, and an unmentioned member of a patch
  // stays as it was, so the shape's `connect` survives the narrowing.
  it('keeps the relation rules the shape declares and the fields the grant allows', async () => {
    await grantOrders({
      recordAccess: ['allRecords'],
      fields: { input: ['id', 'ownerId'], output: '*' },
    });
    const router = await routes();

    const created = await post(router, '/authzOrders:createOne', {
      values: {
        id: 'order-3',
        ownerId: 'alice',
        customer: { connect: { id: 'acme' } },
      },
    });
    const refused = await post(router, '/authzOrders:createOne', {
      values: { id: 'order-4', ownerId: 'alice', amount: 30 },
    });

    expect(created.status).toBe(200);
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
    });
  });

  it('registers nothing: an exposure names a resource, it does not declare one', () => {
    const authorization = createAuthorization();

    authorization.db.repositories(exposures);

    expect(authorization.db.collections.list()).toEqual([]);
  });

  it('denies an exposure whose Collection was never registered', async () => {
    await grantOrders({ recordAccess: ['allRecords'] });
    const router = await routes({ register: false });

    const response = await post(router, '/authzOrders:findMany');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'READ_FORBIDDEN',
    });
  });

  it('refuses a policy function on an exposure that names a resource', async () => {
    const authorization = createAuthorization();

    expect(() =>
      authorization.db.repositories([
        {
          name: 'authzOrders',
          resource: 'authzOrders',
          policy: () => ordersPolicy,
          actions: { findMany: {} },
        },
      ]),
    ).toThrow(TypeError);
  });
});

function createAuthorization(): ReturnType<typeof createAppAuthorization> {
  return createAppAuthorization({ connection: database.connection() });
}

/** The router an application assembles, exactly as the usage documents it. */
async function routes(
  options: { mount?: readonly string[]; register?: boolean } = {},
): Promise<Hono> {
  const authorization = createAuthorization();
  if (options.register !== false)
    authorization.db.collections.add({ name: 'authzOrders', title: 'Orders' });
  const authorize = authorization.db.repositories(exposures);
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  const router = new Hono();
  router.use('*', async (context, next) => {
    context.set('auth', { user: { id: signedInAs } });
    await next();
  });
  for (const path of options.mount ?? ['*']) router.use(path, authorize);
  router.route(
    '/',
    await defineRepositoryApiRoutes({
      principal: authorize.principal,
      repositories: authorize.repositories,
    }).createRouter({ container }),
  );
  return router;
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
          fields: { input: '*', output: '*' },
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
      title: key,
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

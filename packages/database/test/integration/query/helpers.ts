import type { IntegrationTestContext } from '../helpers.js';

export async function createQueryOrdersCollection(
  context: IntegrationTestContext,
  collectionName = 'queryOrders',
): Promise<void> {
  await context.builder.createCollection(collectionName, (collection) => {
    collection.increments('id');
    collection.string('orderNo');
    collection.string('status');
    collection.integer('amount');
    collection.integer('sort');
    collection.datetime('paidAt').nullable();
  });
}

export async function seedQueryOrders(
  context: IntegrationTestContext,
  tableName: string,
): Promise<void> {
  await context.database.query()
    .insertInto(tableName)
    .values([
      { orderNo: 'SO-001', status: 'draft', amount: 50, sort: 1, paidAt: null },
      { orderNo: 'SO-002', status: 'paid', amount: 120, sort: 2, paidAt: '2026-08-14 10:00:00' },
      { orderNo: 'SO-003', status: 'paid', amount: 240, sort: 3, paidAt: '2026-08-14 11:00:00' },
    ])
    .execute();
}

export async function createWhereOrdersCollection(
  context: IntegrationTestContext,
  collectionName = 'whereOrders',
): Promise<void> {
  await context.builder.createCollection(collectionName, (collection) => {
    collection.increments('id');
    collection.string('tenantId');
    collection.string('orderNo');
    collection.string('status');
    collection.string('type');
    collection.integer('amount');
    collection.datetime('paidAt').nullable();
    collection.datetime('archivedAt').nullable();
  });
}

export async function seedWhereOrders(
  context: IntegrationTestContext,
  tableName: string,
): Promise<void> {
  await context.database.query()
    .insertInto(tableName)
    .values([
      {
        tenantId: 'tenant-a',
        orderNo: 'SO-001',
        status: 'paid',
        type: 'normal',
        amount: 120,
        paidAt: '2026-08-14 10:00:00',
        archivedAt: null,
      },
      {
        tenantId: 'tenant-a',
        orderNo: 'SO-002',
        status: 'completed',
        type: 'vip',
        amount: 240,
        paidAt: '2026-08-14 11:00:00',
        archivedAt: null,
      },
      {
        tenantId: 'tenant-a',
        orderNo: 'SO-003',
        status: 'draft',
        type: 'normal',
        amount: 360,
        paidAt: null,
        archivedAt: null,
      },
      {
        tenantId: 'tenant-a',
        orderNo: 'SO-004',
        status: 'cancelled',
        type: 'internal',
        amount: 480,
        paidAt: null,
        archivedAt: '2026-08-14 12:00:00',
      },
      {
        tenantId: 'tenant-a',
        orderNo: 'SO-005',
        status: 'paid',
        type: 'vip',
        amount: 600,
        paidAt: '2026-08-14 13:00:00',
        archivedAt: null,
      },
      {
        tenantId: 'tenant-b',
        orderNo: 'PX-001',
        status: 'paid',
        type: 'normal',
        amount: 180,
        paidAt: '2026-08-14 14:00:00',
        archivedAt: null,
      },
    ])
    .execute();
}

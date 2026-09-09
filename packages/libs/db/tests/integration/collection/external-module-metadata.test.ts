import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  type DatabaseManager,
  ModuleCollectionMetadataStore,
} from '../../../src/index.js';
import {
  externalCrmMetadataDocuments,
  externalCrmMetadataSource,
} from '../../fixtures/metadata/external-crm.js';

describe('external Collection resolution with Module Metadata', () => {
  let directory: string;
  let database: DatabaseManager | undefined;
  let setupClient: Knex | undefined;

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'nocobase-db-external-'));
    const filename = path.join(directory, 'crm.sqlite');
    setupClient = knex({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true,
    });
    await setupClient.raw('PRAGMA foreign_keys = ON');
    await setupClient.schema.createTable('crm_customers', (table) => {
      table.increments('id');
      table.string('email', 255).notNullable().unique();
      table.string('display_name', 128).notNullable();
    });
    await setupClient.schema.createTable('crm_orders', (table) => {
      table.increments('id');
      table.integer('customer_id').notNullable();
      table.string('order_no', 64).notNullable().unique();
      table.decimal('total_amount', 12, 2).notNullable().defaultTo(0);
      table.string('status', 32).notNullable().defaultTo('draft');
      table.foreign('customer_id').references('id').inTable('crm_customers');
    });
    await setupClient.destroy();
    setupClient = undefined;

    database = createDatabaseManager({
      default: 'externalCrm',
      connections: {
        externalCrm: {
          dialect: 'sqlite',
          filename,
          schemaManagement: 'external',
          naming: { underscored: true, tablePrefix: 'crm_' },
          metadataStore: new ModuleCollectionMetadataStore({
            documents: externalCrmMetadataDocuments,
            source: externalCrmMetadataSource,
          }),
        },
      },
    });
    await database.connect();
  });

  afterEach(async () => {
    await setupClient?.destroy();
    await database?.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  it('resolves external physical Schema with supplemental Module Metadata', async () => {
    const connection = database!.connection();
    const orders = await connection.collections.get('orders');

    expect(orders).toMatchObject({
      name: 'orders',
      kind: 'table',
      title: 'CRM orders',
      description: 'Orders synchronized by an external CRM database.',
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: 'orderNo',
          type: 'string',
          length: 64,
          title: 'Order number',
        }),
        expect.objectContaining({
          name: 'customer',
          type: 'belongsTo',
          target: 'customers',
          foreignKey: 'customerId',
          targetKey: 'id',
          title: 'Customer',
        }),
      ]),
    });
    await expect(
      connection.collections.validateRelations('orders'),
    ).resolves.toBeUndefined();
    await expect(connection.collections.list()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'customers', title: 'CRM customers' }),
        expect.objectContaining({ name: 'orders', title: 'CRM orders' }),
      ]),
    });
  });

  it('rejects DDL while allowing record reads and writes', async () => {
    const connection = database!.connection();

    await expect(
      connection.builder.createCollection('forbidden', {
        fields: [{ name: 'id', type: 'increments', primaryKey: true }],
      }),
    ).rejects.toMatchObject({
      code: 'SCHEMA_MANAGEMENT_NOT_ALLOWED',
      connection: 'externalCrm',
    });

    await connection.query
      .insertInto('customers')
      .values({ email: 'ada@example.com', displayName: 'Ada Lovelace' })
      .execute();
    await connection.query
      .insertInto('orders')
      .values({
        customerId: 1,
        orderNo: 'CRM-1001',
        totalAmount: 125.5,
        status: 'paid',
      })
      .execute();

    await expect(
      connection.query
        .selectFrom('orders')
        .select(['orderNo', 'totalAmount', 'status'])
        .execute(),
    ).resolves.toEqual([
      { orderNo: 'CRM-1001', totalAmount: 125.5, status: 'paid' },
    ]);
  });

  it('exposes Module Metadata as read-only', async () => {
    const connection = database!.connection();

    expect(connection.collectionMetadata.capabilities).toEqual({
      writable: false,
      optimisticConcurrency: false,
    });
    await expect(
      connection.collectionMetadata.updateCollection('orders', {
        title: 'Changed title',
      }),
    ).rejects.toMatchObject({
      code: 'METADATA_STORE_READ_ONLY',
      operation: 'put',
      source: externalCrmMetadataSource,
    });
    expect((await connection.collections.get('orders'))?.title).toBe(
      'CRM orders',
    );
  });
});

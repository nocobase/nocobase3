import path from 'node:path';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORDERS, MEMBERS, PROJECTS, QUOTES } from '../catalog.js';
import { createFixture } from './helpers.js';
import migration from '../database/migrations/202609220001_sales_permissions.js';

it('creates the final sales schema and metadata in one reversible migration', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = database.connection();
  const context = {
    connection,
    builder: connection.builder,
    query: connection.query,
  };
  const collections = [
    'authorizationExampleCarriers',
    'authorizationExampleSalesMembers',
    'authorizationExampleProjects',
    'authorizationExampleQuotes',
    'authorizationExampleOrders',
  ];
  try {
    await migration.up(context);
    for (const name of collections) {
      expect(await connection.collections.get(name)).toBeDefined();
      expect(await connection.collections.getPhysical(name)).toBeDefined();
    }
    const quotes = await connection.collections.get(
      'authorizationExampleQuotes',
    );
    expect(quotes?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(['preparedById', 'preparedByName']),
    );
    const physical = await connection.collections.getPhysical(
      'authorizationExampleQuotes',
    );
    expect(physical?.columns.map((column) => column.columnName)).toEqual(
      expect.arrayContaining(['prepared_by_id', 'prepared_by_name']),
    );
    await migration.down!(context);
    for (const name of collections) {
      expect(await connection.collections.get(name)).toBeUndefined();
      expect(await connection.collections.getPhysical(name)).toBeUndefined();
    }
  } finally {
    await database.destroy();
  }
});

it('upgrades delivery references without losing orders and safely restores the constraint', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = database.connection();
  const orders = 'authorizationExampleOrders';
  const migrator = database.createMigrator({
    directory: path.resolve(import.meta.dirname, '../database/migrations'),
    packageName: '@nocobase/app-plugin-authorization-example',
  });
  const assertNullable = async (nullable: boolean) => {
    expect((await connection.collections.get(orders))?.fields).toContainEqual(
      expect.objectContaining({ name: 'deliveryReference', nullable }),
    );
    expect(
      (await connection.collections.getPhysical(orders))?.columns,
    ).toContainEqual(
      expect.objectContaining({ columnName: 'delivery_reference', nullable }),
    );
  };
  try {
    await migrator.upTo(migration.name);
    await assertNullable(false);
    await connection.query
      .insertInto(orders)
      .values({
        id: 'existing-order',
        projectId: 'project',
        quoteId: 'quote',
        title: 'Existing order',
        status: 'ready',
        deliveryReference: 'SHIP-1',
      })
      .execute();
    await migrator.latest();
    await assertNullable(true);
    expect(
      await connection.query.selectFrom(orders).selectAll().executeTakeFirst(),
    ).toMatchObject({
      id: 'existing-order',
      deliveryReference: 'SHIP-1',
    });
    await connection.query
      .updateTable(orders)
      .where('id', '=', 'existing-order')
      .set({ deliveryReference: null })
      .execute();
    await expect(migrator.rollback()).rejects.toThrow(
      'Fill missing order delivery references',
    );
    await assertNullable(true);
    expect(
      await connection.query.selectFrom(orders).selectAll().executeTakeFirst(),
    ).toMatchObject({
      id: 'existing-order',
      deliveryReference: null,
    });
    await connection.query
      .updateTable(orders)
      .where('id', '=', 'existing-order')
      .set({ deliveryReference: 'SHIP-2' })
      .execute();
    await migrator.rollback();
    await assertNullable(false);
    await expect(
      connection.query
        .updateTable(orders)
        .where('id', '=', 'existing-order')
        .set({ deliveryReference: null })
        .execute(),
    ).rejects.toThrow();
    await migrator.rollback();
    expect(await connection.collections.getPhysical(orders)).toBeUndefined();
  } finally {
    await database.destroy();
  }
});

describe('against the seeded example', () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await fixture.database.destroy();
  });

  it('reverses the relation migration and restores metadata on reapplication', async () => {
    const connection = fixture.database.connection();
    const context = {
      connection,
      builder: connection.builder,
      query: connection.query,
    };
    expect(
      (await connection.collections.get(ORDERS))?.fields?.find(
        (field) => field.name === 'checks',
      ),
    ).toMatchObject({ type: 'hasMany' });
    expect(
      (await connection.collections.getPhysical(ORDERS))?.columns.some(
        (column) => column.columnName === 'carrier_id',
      ),
    ).toBe(true);
    await migration.down!(context);
    expect(
      await connection.collections.getPhysical(
        'authorizationExampleOrderChecks',
      ),
    ).toBeUndefined();
    expect(await connection.collections.get(ORDERS)).toBeUndefined();
    await migration.up(context);
    expect(
      await connection.collections.getPhysical(
        'authorizationExampleOrderChecks',
      ),
    ).toBeDefined();
    expect(
      (await connection.collections.get(ORDERS))?.fields?.find(
        (field) => field.name === 'collaborators',
      ),
    ).toMatchObject({ type: 'belongsToMany' });
  });

  it('creates and removes all example schema through the real migrator', async () => {
    const connection = fixture.database.connection();
    expect(await connection.collections.getPhysical(ORDERS)).toBeDefined();
    const migrator = fixture.database.createMigrator({
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-authorization-example',
    });
    await connection.query
      .updateTable(ORDERS)
      .set({ deliveryReference: 'ROLLBACK-TEST' })
      .where('deliveryReference', 'is', null)
      .execute();
    await migrator.rollback();
    for (const name of [
      MEMBERS,
      PROJECTS,
      QUOTES,
      ORDERS,
      'authorizationExampleCarriers',
      'authorizationExampleOrderCarriers',
    ])
      expect(await connection.collections.getPhysical(name)).toBeUndefined();
  });
});

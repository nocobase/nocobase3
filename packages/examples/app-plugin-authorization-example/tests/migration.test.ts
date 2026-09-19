import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
} from '@nocobase/db';
import { expect, it } from 'vitest';
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
    'authorizationExampleTeams',
    'authorizationExampleTeamMembers',
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

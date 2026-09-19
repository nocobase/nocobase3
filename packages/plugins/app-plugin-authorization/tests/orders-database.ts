import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

/** The fields `orders` carries, in the order db reports them. */
export const orderFields: readonly string[] = [
  'id',
  'ownerId',
  'createdById',
  'amount',
  'regionId',
];

/**
 * A real SQLite database holding the `orders` Collection these tests grant on.
 * Collection metadata comes from db now, so a test that authorizes a
 * Collection has to create it.
 */
export async function createOrdersDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await database.connection().builder.createCollection('orders', (orders) => {
    orders.increments('id').primary();
    orders.string('ownerId', { length: 64 });
    orders.string('createdById', { length: 64 });
    orders.integer('amount');
    orders.string('regionId', { length: 64 });
  });
  return database;
}

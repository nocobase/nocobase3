import type { Knex } from 'knex';
import { createDatabaseManager } from '@nocobase/db';
import { defineDatabaseContractSuite } from '@nocobase/db-testkit';
import sqlite from '../src/index.js';

defineDatabaseContractSuite({
  title: 'sqlite database contract',
  createContext: async () => {
    const database = createDatabaseManager({
      connections: { main: sqlite({ filename: ':memory:' }) },
    });
    const db = await database.connection('main').client<Knex>();
    return {
      database,
      table: (name: string) => name,
      identifier: (name: string) => name,
      cleanup: () => database.destroy(),
      createTable: async (name: string) => {
        await db.schema.createTable(name, (table) => {
          table.increments('id');
          table.string('name');
        });
      },
      insert: async (table: string, values: Record<string, unknown>) => {
        await db(table).insert(values);
      },
      select: (table: string) => db(table).select(),
    };
  },
});

import type { Knex } from 'knex';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type DatabaseConnection,
} from '@nocobase/db';
import {
  createTestPrefix,
  truncateIdentifier,
  snakeCase,
  type DatabaseIntegrationContext,
  type DatabaseIntegrationAdapter,
} from '@nocobase/db-testkit';
import sqlite from '../../src/index.js';

export const sqliteIntegrationAdapter: DatabaseIntegrationAdapter = {
  name: 'sqlite',
  createContext: (): DatabaseIntegrationContext => {
    const context = {
      database: undefined as unknown as DatabaseManager,
      connection: undefined as unknown as DatabaseConnection,
      db: undefined as unknown as Knex,
      builder: undefined as never,
      metadataStore: undefined as unknown as InMemoryCollectionMetadataStore,
      prefix: '',
      table: (name: string) => context.identifier(name),
      identifier: (name: string) =>
        truncateIdentifier(`${context.prefix}_${snakeCase(name)}`),
      indexName: (collection, columns) => {
        const table = context.table(collection);
        return truncateIdentifier(`idx_${table}_${columns.join('_')}`);
      },
      createTable: async (name) => {
        await context.db.schema.createTable(name, (tableBuilder) => {
          tableBuilder.increments('id');
          tableBuilder.string('name');
        });
      },
      insert: async (tableName, values) => {
        await context.db(tableName).insert(values);
      },
      select: (tableName) => context.db(tableName).select(),
      cleanup: async () => undefined,
    } as DatabaseIntegrationContext;
    return context;
  },
  setupContext: async (context) => {
    const prefix = createTestPrefix();
    const metadataStore = new InMemoryCollectionMetadataStore();
    const database = createDatabaseManager({
      default: 'main',
      metadataStore,
      connections: {
        main: sqlite({
          filename: ':memory:',
          naming: { tablePrefix: `${prefix}_` },
        }),
      },
    });
    const connection = database.connection('main');
    context.database = database;
    context.connection = connection;
    context.metadataStore = metadataStore;
    context.prefix = prefix;
    context.builder = connection.builder;
    context.db = await connection.client<Knex>();
    await context.db.raw('PRAGMA foreign_keys = ON');
  },
  cleanupContext: async (context) => {
    await context.database.destroy();
  },
};

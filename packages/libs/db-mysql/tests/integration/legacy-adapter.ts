import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseDialectIntegrationAdapter,
  type DatabaseDialectIntegrationAdapter,
} from '@nocobase/db-testkit';
import mysql from '../../src/index.js';
import { mysqlIntegrationProfile } from './adapter.js';

export const mysqlDialectIntegrationAdapter: DatabaseDialectIntegrationAdapter =
  createDatabaseDialectIntegrationAdapter({
    name: 'mysql',
    spec: {
      name: 'mysql',
      dialect: 'mysql',
      driver: 'mysql2',
      profile: mysqlIntegrationProfile,
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 13306),
      username: process.env.MYSQL_USER ?? 'nocobase',
      password: process.env.MYSQL_PASSWORD ?? 'nocobase',
      database: process.env.MYSQL_DATABASE ?? 'nocobase_collection_builder',
    },
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'mysql',
        metadataStore,
        connections: {
          mysql: mysql({
            host: process.env.MYSQL_HOST ?? '127.0.0.1',
            port: Number(process.env.MYSQL_PORT ?? 13306),
            username: process.env.MYSQL_USER ?? 'nocobase',
            password: process.env.MYSQL_PASSWORD ?? 'nocobase',
            database:
              process.env.MYSQL_DATABASE ?? 'nocobase_collection_builder',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    listIndexes: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select distinct index_name as name from information_schema.statistics
           where table_schema = database() and table_name = ?`,
          [tableName],
        ),
      ).map((row) => ({ ...row, name: row.name ?? row.INDEX_NAME })),
    listForeignKeys: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select referenced_table_name as referenced_table,
             column_name as column_name, referenced_column_name as referenced_column
           from information_schema.key_column_usage
           where table_schema = database() and table_name = ?
             and referenced_table_name is not null`,
          [tableName],
        ),
      ).map((row) => ({
        table: row.referenced_table ?? row.REFERENCED_TABLE_NAME,
        from: row.column_name ?? row.COLUMN_NAME,
        to: row.referenced_column ?? row.REFERENCED_COLUMN_NAME,
      })),
    listColumns: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select column_name as name, data_type as type
           from information_schema.columns
           where table_schema = database() and table_name = ?`,
          [tableName],
        ),
      ).map((row) => ({
        ...row,
        name: row.name ?? row.COLUMN_NAME,
        type: row.type ?? row.DATA_TYPE,
      })),
    listObjects: async (context, objectType) => {
      const tableType = objectType === 'table' ? 'BASE TABLE' : 'VIEW';
      return rows(
        await context.db.raw(
          `select table_name as name from information_schema.tables
           where table_schema = database() and table_type = ? and table_name like ?`,
          [tableType, `${context.prefix}_%`],
        ),
      ).map((row) => String(row.name ?? row.TABLE_NAME));
    },
    quoteIdentifier: (identifier) => `\`${identifier.replace(/`/g, '``')}\``,
    cleanup: async (context) => {
      const adapter = mysqlDialectIntegrationAdapter;
      await context.db.raw('set foreign_key_checks = 0');
      try {
        for (const view of await adapter.listObjects(context, 'view'))
          await context.db.raw(
            `drop view if exists ${adapter.quoteIdentifier(view)}`,
          );
        for (const table of await adapter.listObjects(context, 'table'))
          await context.db.raw(
            `drop table if exists ${adapter.quoteIdentifier(table)}`,
          );
      } finally {
        await context.db.raw('set foreign_key_checks = 1');
      }
    },
  });

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result))
    return (Array.isArray(result[0]) ? result[0] : result) as Array<
      Record<string, unknown>
    >;
  return result && typeof result === 'object' && 'rows' in result
    ? (result as { rows: Array<Record<string, unknown>> }).rows
    : [];
}

import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseDialectIntegrationAdapter,
  type DatabaseDialectIntegrationAdapter,
} from '@nocobase/db-testkit';
import kingbasePostgres from '../../src/index.js';
import { kingbasePostgresIntegrationProfile } from './adapter.js';

export const kingbasePostgresDialectIntegrationAdapter: DatabaseDialectIntegrationAdapter =
  createDatabaseDialectIntegrationAdapter({
    name: 'kingbase-postgres',
    spec: {
      name: 'kingbase-postgres',
      dialect: 'kingbase-postgres',
      driver: 'pg',
      profile: kingbasePostgresIntegrationProfile,
      host:
        process.env.KINGBASE_POSTGRES_HOST ?? process.env.PGHOST ?? '127.0.0.1',
      port: Number(
        process.env.KINGBASE_POSTGRES_PORT ?? process.env.PGPORT ?? 54321,
      ),
      username:
        process.env.KINGBASE_POSTGRES_USER ?? process.env.PGUSER ?? 'nocobase',
      password:
        process.env.KINGBASE_POSTGRES_PASSWORD ??
        process.env.PGPASSWORD ??
        'nocobase',
      database:
        process.env.KINGBASE_POSTGRES_DATABASE ??
        process.env.PGDATABASE ??
        'test',
    },
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'kingbase-postgres',
        metadataStore,
        connections: {
          'kingbase-postgres': kingbasePostgres({
            host:
              process.env.KINGBASE_POSTGRES_HOST ??
              process.env.PGHOST ??
              '127.0.0.1',
            port: Number(
              process.env.KINGBASE_POSTGRES_PORT ?? process.env.PGPORT ?? 54321,
            ),
            username:
              process.env.KINGBASE_POSTGRES_USER ??
              process.env.PGUSER ??
              'nocobase',
            password:
              process.env.KINGBASE_POSTGRES_PASSWORD ??
              process.env.PGPASSWORD ??
              'nocobase',
            database:
              process.env.KINGBASE_POSTGRES_DATABASE ??
              process.env.PGDATABASE ??
              'test',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    listIndexes: async (context, tableName) =>
      rows(
        await context.db.raw(
          'select indexname as name from pg_indexes where schemaname = current_schema() and tablename = ?',
          [tableName],
        ),
      ),
    listForeignKeys: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select ccu.table_name as "table", kcu.column_name as "from", ccu.column_name as "to"
           from information_schema.table_constraints tc
           join information_schema.key_column_usage kcu
             on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
           join information_schema.constraint_column_usage ccu
             on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
           where tc.constraint_type = 'FOREIGN KEY'
             and tc.table_schema = current_schema() and tc.table_name = ?`,
          [tableName],
        ),
      ),
    listColumns: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select column_name as name, data_type as type
           from information_schema.columns
           where table_schema = current_schema() and table_name = ?`,
          [tableName],
        ),
      ),
    listObjects: async (context, objectType) => {
      const tableType = objectType === 'table' ? 'BASE TABLE' : 'VIEW';
      return rows(
        await context.db.raw(
          `select table_name as name from information_schema.tables
           where table_schema = current_schema() and table_type = ? and table_name like ?`,
          [tableType, `${context.prefix}_%`],
        ),
      ).map((row) => String(row.name));
    },
    quoteIdentifier: quote,
    cleanup: async (context) => {
      const adapter = kingbasePostgresDialectIntegrationAdapter;
      for (const view of await adapter.listObjects(context, 'view'))
        await context.db.raw(`drop view if exists ${quote(view)} cascade`);
      for (const table of await adapter.listObjects(context, 'table'))
        await context.db.raw(`drop table if exists ${quote(table)} cascade`);
    },
  });

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return (Array.isArray(result[0]) ? result[0] : result) as Array<
      Record<string, unknown>
    >;
  }
  return result && typeof result === 'object' && 'rows' in result
    ? (result as { rows: Array<Record<string, unknown>> }).rows
    : [];
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

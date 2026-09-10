import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseDialectIntegrationAdapter,
  type DatabaseDialectIntegrationAdapter,
} from '@nocobase/db-testkit';
import mssql from '../../src/index.js';

export const mssqlDialectIntegrationAdapter: DatabaseDialectIntegrationAdapter =
  createDatabaseDialectIntegrationAdapter({
    name: 'mssql',
    spec: {
      name: 'mssql',
      dialect: 'mssql',
      driver: 'tedious',
      host: process.env.MSSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MSSQL_PORT ?? 11433),
      username: process.env.MSSQL_USER ?? 'sa',
      password: process.env.MSSQL_PASSWORD ?? 'NocoBase_Mssql_2026',
      database: process.env.MSSQL_DATABASE ?? 'nocobase_collection_builder',
      encrypt: false,
      trustServerCertificate: true,
    },
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'mssql',
        metadataStore,
        connections: {
          mssql: mssql({
            host: process.env.MSSQL_HOST ?? '127.0.0.1',
            port: Number(process.env.MSSQL_PORT ?? 11433),
            username: process.env.MSSQL_USER ?? 'sa',
            password: process.env.MSSQL_PASSWORD ?? 'NocoBase_Mssql_2026',
            database:
              process.env.MSSQL_DATABASE ?? 'nocobase_collection_builder',
            encrypt: false,
            trustServerCertificate: true,
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    listIndexes: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select i.name from sys.indexes i join sys.tables t on t.object_id = i.object_id
           where t.name = ? and i.name is not null`,
          [tableName],
        ),
      ),
    listForeignKeys: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select rt.name as [table], pc.name as [from], rc.name as [to]
           from sys.foreign_keys fk
           join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id
           join sys.tables pt on pt.object_id = fkc.parent_object_id
           join sys.columns pc on pc.object_id = fkc.parent_object_id and pc.column_id = fkc.parent_column_id
           join sys.tables rt on rt.object_id = fkc.referenced_object_id
           join sys.columns rc on rc.object_id = fkc.referenced_object_id and rc.column_id = fkc.referenced_column_id
           where pt.name = ?`,
          [tableName],
        ),
      ),
    listColumns: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select c.name, t.name as type from sys.columns c
           join sys.types t on t.user_type_id = c.user_type_id
           join sys.tables tb on tb.object_id = c.object_id where tb.name = ?`,
          [tableName],
        ),
      ),
    listObjects: async (context, objectType) => {
      const type = objectType === 'table' ? 'U' : 'V';
      return rows(
        await context.db.raw(
          'select o.name from sys.objects o where o.type = ? and o.is_ms_shipped = 0 and o.name like ?',
          [type, `${context.prefix}_%`],
        ),
      ).map((row) => String(row.name));
    },
    quoteIdentifier: (identifier) => `[${identifier.replace(/]/g, ']]')}]`,
    cleanup: async (context) => {
      const adapter = mssqlDialectIntegrationAdapter;
      const foreignKeys = rows(
        await context.db.raw(
          `select s.name as schema_name, t.name as table_name, fk.name as constraint_name
           from sys.foreign_keys fk join sys.tables t on t.object_id = fk.parent_object_id
           join sys.schemas s on s.schema_id = t.schema_id where t.name like ?`,
          [`${context.prefix}_%`],
        ),
      );
      for (const row of foreignKeys)
        await context.db.raw(
          `alter table ${adapter.quoteIdentifier(String(row.schema_name))}.${adapter.quoteIdentifier(String(row.table_name))}
           drop constraint ${adapter.quoteIdentifier(String(row.constraint_name))}`,
        );
      for (const view of await adapter.listObjects(context, 'view'))
        await context.db.raw(`drop view ${adapter.quoteIdentifier(view)}`);
      for (const table of await adapter.listObjects(context, 'table'))
        await context.db.raw(`drop table ${adapter.quoteIdentifier(table)}`);
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

import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseDialectIntegrationAdapter,
  type DatabaseDialectIntegrationAdapter,
} from '@nocobase/db-testkit';
import oracle from '../../src/index.js';

export const oracleDialectIntegrationAdapter: DatabaseDialectIntegrationAdapter =
  createDatabaseDialectIntegrationAdapter({
    name: 'oracle',
    spec: {
      name: 'oracle',
      dialect: 'oracle',
      driver: 'oracledb',
      host: process.env.ORACLE_HOST ?? '127.0.0.1',
      port: Number(process.env.ORACLE_PORT ?? 11521),
      username: process.env.ORACLE_USER ?? 'nocobase',
      password: process.env.ORACLE_PASSWORD ?? 'nocobase',
      serviceName: process.env.ORACLE_SERVICE_NAME ?? 'FREEPDB1',
    },
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'oracle',
        metadataStore,
        connections: {
          oracle: oracle({
            host: process.env.ORACLE_HOST ?? '127.0.0.1',
            port: Number(process.env.ORACLE_PORT ?? 11521),
            username: process.env.ORACLE_USER ?? 'nocobase',
            password: process.env.ORACLE_PASSWORD ?? 'nocobase',
            serviceName: process.env.ORACLE_SERVICE_NAME ?? 'FREEPDB1',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    listIndexes: async (context, tableName) =>
      rows(
        await context.db.raw(
          'select index_name as "name" from user_indexes where table_name = ?',
          [tableName],
        ),
      ),
    listForeignKeys: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select rc.table_name as "table", cc.column_name as "from", rcc.column_name as "to"
           from user_constraints c
           join user_cons_columns cc on cc.constraint_name = c.constraint_name
           join all_constraints rc on rc.owner = c.r_owner and rc.constraint_name = c.r_constraint_name
           join all_cons_columns rcc on rcc.owner = rc.owner
             and rcc.constraint_name = rc.constraint_name and rcc.position = cc.position
           where c.constraint_type = 'R' and c.table_name = ?`,
          [tableName],
        ),
      ),
    listColumns: async (context, tableName) =>
      rows(
        await context.db.raw(
          'select column_name as "name", data_type as "type" from user_tab_columns where table_name = ?',
          [tableName],
        ),
      ),
    listObjects: async (context, objectType) => {
      const column = objectType === 'table' ? 'table_name' : 'view_name';
      const source = objectType === 'table' ? 'user_tables' : 'user_views';
      return rows(
        await context.db.raw(
          `select ${column} as "name" from ${source} where ${column} like ?`,
          [`${context.prefix}_%`],
        ),
      )
        .map((row) => String(row.name ?? row.NAME))
        .filter((name) => name.startsWith(`${context.prefix}_`));
    },
    quoteIdentifier: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
    cleanup: async (context) => {
      const adapter = oracleDialectIntegrationAdapter;
      for (const name of await oracleObjects(
        context,
        'user_mviews',
        'mview_name',
      ))
        await context.db.raw(
          `drop materialized view ${adapter.quoteIdentifier(name)}`,
        );
      for (const view of await adapter.listObjects(context, 'view'))
        await context.db.raw(`drop view ${adapter.quoteIdentifier(view)}`);
      for (const table of await adapter.listObjects(context, 'table'))
        await context.db.raw(
          `drop table ${adapter.quoteIdentifier(table)} cascade constraints purge`,
        );
      for (const sequence of await oracleObjects(
        context,
        'user_sequences',
        'sequence_name',
      ))
        await context.db.raw(
          `drop sequence ${adapter.quoteIdentifier(sequence)}`,
        );
    },
  });

async function oracleObjects(
  context: Parameters<DatabaseDialectIntegrationAdapter['listObjects']>[0],
  source: 'user_mviews' | 'user_sequences',
  column: 'mview_name' | 'sequence_name',
): Promise<string[]> {
  return rows(
    await context.db.raw(
      `select s.${column} as "name"
       from ${source} s
       where ${
         source === 'user_sequences'
           ? `not exists (
               select 1
               from user_tab_identity_cols i
               where i.sequence_name = s.${column}
             )
             and `
           : ''
       }s.${column} like ?`,
      [`${context.prefix}_%`],
    ),
  )
    .map((row) => String(row.name ?? row.NAME))
    .filter((name) => name.startsWith(`${context.prefix}_`));
}

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result))
    return (Array.isArray(result[0]) ? result[0] : result) as Array<
      Record<string, unknown>
    >;
  return result && typeof result === 'object' && 'rows' in result
    ? (result as { rows: Array<Record<string, unknown>> }).rows
    : [];
}

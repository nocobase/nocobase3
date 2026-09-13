import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseDialectIntegrationAdapter,
  type DatabaseIntegrationProfile,
  type DatabaseDialectIntegrationAdapter,
} from '@nocobase/db-testkit';
import dameng from '../../src/index.js';

export const damengIntegrationProfile: DatabaseIntegrationProfile = {
  numeric: {
    nativeResults: false,
    integerResults: 'number',
    nativeAggregates: false,
    bigintAverage: 'fractional',
    exactProjection: 'castVarchar',
    bigintBinding: 'supported',
    bigintRange: 'full',
    storagePrecision: 'exact',
  },
  character: {
    charRead: 'trimmed',
    lengthUnit: 'bytes',
    collation: false,
    characterSet: false,
  },
  temporal: {
    precisionProbeType: 'timestamp(6) with time zone',
    logicalTypes: {
      day: 'datetime',
      time: 'time',
      local: 'datetime',
      instant: 'datetimeTz',
    },
    inspectorDataTypes: {
      day: 'datetime',
      clock: 'time',
      instant: 'datetimeTz',
    },
    fixtureTypes: [
      'DATE',
      'TIME(3)',
      'TIMESTAMP(3)',
      'TIMESTAMP(6) WITH TIME ZONE',
    ],
    sessionTimezone: 'unsupported',
    instantFilterInput: 'iso',
    isoLiteralFilters: false,
    instantPrimaryKey: true,
  },
  schema: {
    defaultSchema: 'public',
    declareSchema: true,
    supportsSchemas: false,
    uniqueConstraints: true,
    foreignKeyActions: { onDelete: 'restrict', onUpdate: 'cascade' },
    uniqueConstraintDropKeepsIndex: false,
    nativeTextType: 'text',
    comments: 'complete',
    booleanStorage: 'decimal',
    emptyStringIsNull: false,
    integerResolution: 'integer',
    scalarTypes: ['CHAR(8)', 'VARCHAR(16)', 'INTEGER', 'REAL', 'NUMBER(1,0)'],
    scalarInspection: {
      quantity: { dataType: 'integer' },
      ratioDataType: 'float',
    },
  },
  json: {
    filters: 'unsupported',
  },
} satisfies DatabaseIntegrationProfile;

export const damengDialectIntegrationAdapter: DatabaseDialectIntegrationAdapter =
  createDatabaseDialectIntegrationAdapter({
    name: 'dameng',
    spec: {
      name: 'dameng',
      dialect: 'dameng',
      driver: 'dmdb',
      profile: damengIntegrationProfile,
      host: process.env.DAMENG_HOST ?? '127.0.0.1',
      port: Number(process.env.DAMENG_PORT ?? 15236),
      username: process.env.DAMENG_USER ?? 'SYSDBA',
      password: process.env.DAMENG_PASSWORD ?? 'SYSDBA001',
      schema: process.env.DAMENG_SCHEMA ?? 'SYSDBA',
    },
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'dameng',
        metadataStore,
        connections: {
          dameng: dameng({
            connectString: `${process.env.DAMENG_HOST ?? '127.0.0.1'}:${Number(process.env.DAMENG_PORT ?? 15236)}`,
            username: process.env.DAMENG_USER ?? 'SYSDBA',
            password: process.env.DAMENG_PASSWORD ?? 'SYSDBA001',
            schema: process.env.DAMENG_SCHEMA ?? 'SYSDBA',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    listIndexes: async (context, tableName) =>
      rows(
        await context.db.raw(
          `select i.index_name as "name",
                  coalesce(c.constraint_name, i.index_name) as "logicalName"
           from user_indexes i
           left join user_constraints c
             on c.index_name = i.index_name and c.table_name = i.table_name
           where i.table_name = ?`,
          [tableName],
        ),
      ).map((row) => ({ ...row, name: row.logicalName ?? row.name })),
    listForeignKeys: async (context, tableName) =>
      rows(
        await context.db.raw(
          'select cc.column_name as "from", rc.table_name as "table", rcc.column_name as "to" from user_constraints c join user_cons_columns cc on cc.constraint_name = c.constraint_name join all_constraints rc on rc.owner = c.r_owner and rc.constraint_name = c.r_constraint_name join all_cons_columns rcc on rcc.owner = rc.owner and rcc.constraint_name = rc.constraint_name and rcc.position = cc.position where c.constraint_type = \'R\' and c.table_name = ?',
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
      for (const table of await damengDialectIntegrationAdapter.listObjects(
        context,
        'table',
      ))
        await context.db.raw(
          `drop table ${damengDialectIntegrationAdapter.quoteIdentifier(table)} cascade constraints`,
        );
      for (const view of await damengDialectIntegrationAdapter.listObjects(
        context,
        'view',
      ))
        await context.db.raw(
          `drop view ${damengDialectIntegrationAdapter.quoteIdentifier(view)}`,
        );
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

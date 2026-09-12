import { createDatabaseManager } from '@nocobase/db';
import {
  createDatabaseIntegrationAdapter,
  createDatabaseDialectIntegrationAdapter,
  dropPortableIntegrationObjects,
  type DatabaseIntegrationProfile,
  type DatabaseIntegrationAdapter,
  type DatabaseDialectIntegrationAdapter,
} from '@nocobase/db-testkit';
import sqlite from '../../src/index.js';

export const sqliteIntegrationProfile: DatabaseIntegrationProfile = {
  numeric: {
    nativeResults: false,
    integerResults: 'number',
    nativeAggregates: false,
    bigintAverage: 'fractional',
    exactProjection: 'castVarchar',
    bigintBinding: 'supported',
    bigintRange: 'full',
    storagePrecision: 'approximate',
  },
  character: {
    charRead: 'trimmed',
    lengthUnit: 'none',
    collation: false,
    characterSet: false,
  },
  temporal: {
    precisionProbeType: 'TIMESTAMP(6)',
    logicalTypes: {
      day: 'text',
      time: 'text',
      local: 'text',
      instant: 'text',
    },
    inspectorDataTypes: { day: 'date', clock: 'time', instant: 'text' },
    fixtureTypes: ['DATE', 'TIME(3)', 'DATETIME(3)', 'TEXT'],
    sessionTimezone: 'unsupported',
    instantFilterInput: 'iso',
    isoLiteralFilters: true,
    instantPrimaryKey: true,
  },
  schema: {
    defaultSchema: 'main',
    declareSchema: true,
    supportsSchemas: false,
    uniqueConstraints: false,
    foreignKeyActions: { onDelete: 'restrict', onUpdate: 'cascade' },
    uniqueConstraintDropKeepsIndex: false,
    nativeTextType: 'text',
    comments: 'unsupported',
    booleanStorage: 'native',
    emptyStringIsNull: false,
    integerResolution: 'integer',
    scalarTypes: ['CHAR(8)', 'VARCHAR(16)', 'INTEGER', 'REAL', 'BOOLEAN'],
  },
  json: {
    filters: 'supported',
  },
} satisfies DatabaseIntegrationProfile;

export const sqliteIntegrationAdapter: DatabaseIntegrationAdapter =
  createDatabaseIntegrationAdapter({
    name: 'sqlite',
    profile: sqliteIntegrationProfile,
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'sqlite',
        metadataStore,
        connections: {
          sqlite: sqlite({
            filename: ':memory:',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    setup: async (context) => {
      await context.db.raw('PRAGMA foreign_keys = ON');
    },
    cleanup: async (context) => {
      await context.db.raw('PRAGMA foreign_keys = OFF');
      await dropPortableIntegrationObjects(context, [
        'orderItems',
        'dryRunItems',
        'viewSource',
        'viewRows',
        'keyless',
      ]);
      await context.db.raw('PRAGMA foreign_keys = ON');
    },
  });

export const sqliteDialectIntegrationAdapter: DatabaseDialectIntegrationAdapter =
  createDatabaseDialectIntegrationAdapter({
    name: 'sqlite',
    spec: {
      name: 'sqlite',
      dialect: 'sqlite',
      driver: 'better-sqlite3',
      profile: sqliteIntegrationProfile,
    },
    createDatabase: (prefix, metadataStore) =>
      createDatabaseManager({
        default: 'sqlite',
        metadataStore,
        connections: {
          sqlite: sqlite({
            filename: ':memory:',
            naming: { tablePrefix: `${prefix}_` },
          }),
        },
      }),
    setup: async (context) => {
      await context.db.raw('PRAGMA foreign_keys = ON');
    },
    cleanup: async (context) => {
      const views = await sqliteDialectIntegrationAdapter.listObjects(
        context,
        'view',
      );
      const tables = await sqliteDialectIntegrationAdapter.listObjects(
        context,
        'table',
      );
      await context.db.raw('PRAGMA foreign_keys = OFF');
      for (const view of views)
        await context.db.raw(
          `drop view if exists ${sqliteDialectIntegrationAdapter.quoteIdentifier(view)}`,
        );
      for (const table of tables)
        await context.db.raw(
          `drop table if exists ${sqliteDialectIntegrationAdapter.quoteIdentifier(table)}`,
        );
      await context.db.raw('PRAGMA foreign_keys = ON');
    },
    listIndexes: async (context, tableName) =>
      rawRows(
        await context.db.raw(`PRAGMA index_list(${quoteLiteral(tableName)})`),
      ),
    listForeignKeys: async (context, tableName) =>
      rawRows(
        await context.db.raw(
          `PRAGMA foreign_key_list(${quoteLiteral(tableName)})`,
        ),
      ),
    listColumns: async (context, tableName) =>
      rawRows(
        await context.db.raw(`PRAGMA table_info(${quoteLiteral(tableName)})`),
      ),
    listObjects: async (context, objectType) =>
      rawRows(
        await context
          .db('sqlite_master')
          .select('name')
          .where('type', objectType)
          .where('name', 'like', `${context.prefix}_%`),
      ).map((row) => String(row.name)),
    quoteIdentifier: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  });

function rawRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0]))
      return result[0] as Array<Record<string, unknown>>;
    return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === 'object' && 'rows' in result)
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  return [];
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

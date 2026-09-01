import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect } from 'vitest';
import { CollectionBuilder, type ConnectionConfig } from '../../src/index.js';
import {
  createDatabaseManager,
  type DatabaseManager,
} from '../../src/index.js';
import { InMemoryCollectionMetadataStore } from '../../src/index.js';
import {
  DefaultNamingStrategy,
  snakeCase,
  truncateIdentifier,
} from '../../src/index.js';

export type IntegrationDialect = 'sqlite' | 'postgres' | 'mysql';

export interface IntegrationDatabaseSpec {
  name: string;
  dialect: IntegrationDialect;
  driver?: ConnectionConfig['driver'];
  filename?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  charset?: string;
  pool?: unknown;
}

export interface IntegrationTestContext {
  spec: IntegrationDatabaseSpec;
  prefix: string;
  database: DatabaseManager;
  db: Knex;
  builder: CollectionBuilder;
  metadataStore: InMemoryCollectionMetadataStore;
  table(collection: string): string;
  identifier(name: string): string;
  indexName(collection: string, columns: string[]): string;
}

export function describeIntegrationDatabases(
  title: string,
  defineSuite: (context: IntegrationTestContext) => void,
): void {
  for (const spec of getIntegrationDatabaseSpecs()) {
    describe(`${title} [${spec.name}]`, () => {
      const context = useIntegrationDatabase(spec);
      defineSuite(context);
    });
  }
}

export function useIntegrationDatabase(
  spec: IntegrationDatabaseSpec,
): IntegrationTestContext {
  const naming = new DefaultNamingStrategy({ underscored: true });
  const context = {
    spec,
    table: (collection: string) => context.identifier(collection),
    identifier: (name: string) =>
      truncateIdentifier(`${context.prefix}_${snakeCase(name)}`),
    indexName: (collection: string, columns: string[]) =>
      naming.indexName(context.table(collection), columns),
  } as IntegrationTestContext;

  beforeEach(async () => {
    context.prefix = createTestPrefix();
    context.metadataStore = new InMemoryCollectionMetadataStore();
    context.database = createDatabaseManager({
      default: spec.name,
      metadataStore: context.metadataStore,
      connections: {
        [spec.name]: {
          ...createConnectionConfig(spec),
          pool: spec.pool,
          naming: {
            underscored: true,
            tablePrefix: `${context.prefix}_`,
          },
        },
      },
    });
    const connection = context.database.connection(spec.name);
    context.builder = connection.builder;
    context.db = await connection.client<Knex>();
    await setupConnection(context);
  });

  afterEach(async () => {
    try {
      await cleanupIntegrationObjects(context);
    } finally {
      await context.database?.destroy();
    }
  });

  return context;
}

export async function listIndexes(
  context: IntegrationTestContext,
  tableName: string,
): Promise<Array<Record<string, any>>> {
  switch (context.spec.dialect) {
    case 'sqlite':
      return rawRows(
        await context.db.raw(`PRAGMA index_list(${quoteLiteral(tableName)})`),
      );
    case 'postgres':
      return rawRows(
        await context.db.raw(
          'select indexname as name from pg_indexes where schemaname = current_schema() and tablename = ?',
          [tableName],
        ),
      );
    case 'mysql': {
      const rows = rawRows(
        await context.db.raw(
          'select distinct index_name as name from information_schema.statistics where table_schema = database() and table_name = ?',
          [tableName],
        ),
      );
      return rows.map((row) => ({ ...row, name: row.name ?? row.INDEX_NAME }));
    }
    default:
      return assertNever(context.spec.dialect);
  }
}

export async function listForeignKeys(
  context: IntegrationTestContext,
  tableName: string,
): Promise<Array<Record<string, any>>> {
  switch (context.spec.dialect) {
    case 'sqlite':
      return rawRows(
        await context.db.raw(
          `PRAGMA foreign_key_list(${quoteLiteral(tableName)})`,
        ),
      );
    case 'postgres':
      return rawRows(
        await context.db.raw(
          `
          select
            ccu.table_name as "table",
            kcu.column_name as "from",
            ccu.column_name as "to"
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name
            and tc.table_schema = kcu.table_schema
          join information_schema.constraint_column_usage ccu
            on ccu.constraint_name = tc.constraint_name
            and ccu.table_schema = tc.table_schema
          where tc.constraint_type = 'FOREIGN KEY'
            and tc.table_schema = current_schema()
            and tc.table_name = ?
        `,
          [tableName],
        ),
      );
    case 'mysql':
      return rawRows(
        await context.db.raw(
          `
          select
            referenced_table_name as referenced_table,
            column_name as column_name,
            referenced_column_name as referenced_column
          from information_schema.key_column_usage
          where table_schema = database()
            and table_name = ?
            and referenced_table_name is not null
        `,
          [tableName],
        ),
      ).map((row) => ({
        table: row.referenced_table ?? row.REFERENCED_TABLE_NAME,
        from: row.column_name ?? row.COLUMN_NAME,
        to: row.referenced_column ?? row.REFERENCED_COLUMN_NAME,
      }));
    default:
      return assertNever(context.spec.dialect);
  }
}

export async function listColumns(
  context: IntegrationTestContext,
  tableName: string,
): Promise<Array<Record<string, any>>> {
  switch (context.spec.dialect) {
    case 'sqlite':
      return rawRows(
        await context.db.raw(`PRAGMA table_info(${quoteLiteral(tableName)})`),
      );
    case 'postgres':
      return rawRows(
        await context.db.raw(
          `
          select column_name as name, data_type as type
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = ?
        `,
          [tableName],
        ),
      );
    case 'mysql':
      return rawRows(
        await context.db.raw(
          `
          select column_name as name, data_type as type
          from information_schema.columns
          where table_schema = database()
            and table_name = ?
        `,
          [tableName],
        ),
      ).map((row) => ({
        ...row,
        name: row.name ?? row.COLUMN_NAME,
        type: row.type ?? row.DATA_TYPE,
      }));
    default:
      return assertNever(context.spec.dialect);
  }
}

export async function getColumnType(
  context: IntegrationTestContext,
  tableName: string,
  columnName: string,
): Promise<string | undefined> {
  const columns = await listColumns(context, tableName);
  const column = columns.find(
    (row) =>
      String(row.name ?? row.column_name).toLowerCase() ===
      columnName.toLowerCase(),
  );
  return column
    ? String(column.type ?? column.data_type).toLowerCase()
    : undefined;
}

export async function expectForeignKeyViolation(
  action: Promise<unknown>,
): Promise<void> {
  await expect(action).rejects.toThrow(/foreign key/i);
}

export async function expectUniqueViolation(
  action: Promise<unknown>,
): Promise<void> {
  await expect(action).rejects.toThrow(/unique|duplicate/i);
}

function getIntegrationDatabaseSpecs(): IntegrationDatabaseSpec[] {
  const requested = splitList(
    process.env.INTEGRATION_DB_CONNECTIONS ??
      process.env.DB_CONNECTION ??
      'sqlite',
  );
  const connectionNames = requested.includes('all')
    ? ['sqlite', 'postgres', 'mysql']
    : requested;
  return connectionNames.map(createIntegrationDatabaseSpec);
}

function createIntegrationDatabaseSpec(name: string): IntegrationDatabaseSpec {
  switch (normalizeConnectionName(name)) {
    case 'sqlite':
      return {
        name: 'sqlite',
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: process.env.SQLITE_FILENAME ?? ':memory:',
      };
    case 'postgres':
      return {
        name: 'postgres',
        dialect: 'postgres',
        driver: 'pg',
        host: process.env.POSTGRES_HOST ?? process.env.PGHOST ?? '127.0.0.1',
        port: Number(process.env.POSTGRES_PORT ?? process.env.PGPORT ?? 15432),
        username: process.env.POSTGRES_USER ?? process.env.PGUSER ?? 'nocobase',
        password:
          process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? 'nocobase',
        database:
          process.env.POSTGRES_DATABASE ??
          process.env.PGDATABASE ??
          'nocobase_collection_builder',
      };
    case 'mysql':
      return {
        name: 'mysql',
        dialect: 'mysql',
        driver: 'mysql2',
        host: process.env.MYSQL_HOST ?? '127.0.0.1',
        port: Number(process.env.MYSQL_PORT ?? 13306),
        username: process.env.MYSQL_USER ?? 'nocobase',
        password: process.env.MYSQL_PASSWORD ?? 'nocobase',
        database: process.env.MYSQL_DATABASE ?? 'nocobase_collection_builder',
      };
    default:
      throw new Error(`Unsupported integration database connection "${name}".`);
  }
}

function createConnectionConfig(
  spec: IntegrationDatabaseSpec,
): ConnectionConfig {
  switch (spec.dialect) {
    case 'sqlite':
      return {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: spec.filename ?? ':memory:',
      };
    case 'postgres':
      return {
        dialect: 'postgres',
        driver: 'pg',
        host: spec.host,
        port: spec.port,
        database: spec.database,
        username: spec.username,
        password: spec.password,
      };
    case 'mysql':
      return {
        dialect: 'mysql',
        driver: 'mysql2',
        host: spec.host,
        port: spec.port,
        database: spec.database,
        username: spec.username,
        password: spec.password,
        charset: spec.charset,
      };
    default:
      return assertNever(spec.dialect);
  }
}

async function setupConnection(context: IntegrationTestContext): Promise<void> {
  if (context.spec.dialect === 'sqlite') {
    await context.db.raw('PRAGMA foreign_keys = ON');
  }
}

async function cleanupIntegrationObjects(
  context: IntegrationTestContext,
): Promise<void> {
  if (!context.db || !context.prefix) {
    return;
  }

  const views = await listObjects(context, 'view');
  const tables = await listObjects(context, 'table');

  switch (context.spec.dialect) {
    case 'sqlite':
      await context.db.raw('PRAGMA foreign_keys = OFF');
      for (const view of views) {
        await context.db.raw(
          `drop view if exists ${quoteIdentifier(view, context.spec.dialect)}`,
        );
      }
      for (const table of tables) {
        await context.db.raw(
          `drop table if exists ${quoteIdentifier(table, context.spec.dialect)}`,
        );
      }
      await context.db.raw('PRAGMA foreign_keys = ON');
      break;
    case 'postgres':
      for (const view of views) {
        await context.db.raw(
          `drop view if exists ${quoteIdentifier(view, context.spec.dialect)} cascade`,
        );
      }
      for (const table of tables) {
        await context.db.raw(
          `drop table if exists ${quoteIdentifier(table, context.spec.dialect)} cascade`,
        );
      }
      break;
    case 'mysql':
      await context.db.raw('set foreign_key_checks = 0');
      try {
        for (const view of views) {
          await context.db.raw(
            `drop view if exists ${quoteIdentifier(view, context.spec.dialect)}`,
          );
        }
        for (const table of tables) {
          await context.db.raw(
            `drop table if exists ${quoteIdentifier(table, context.spec.dialect)}`,
          );
        }
      } finally {
        await context.db.raw('set foreign_key_checks = 1');
      }
      break;
    default:
      assertNever(context.spec.dialect);
  }
}

async function listObjects(
  context: IntegrationTestContext,
  objectType: 'table' | 'view',
): Promise<string[]> {
  const like = `${context.prefix}_%`;
  switch (context.spec.dialect) {
    case 'sqlite':
      return rawRows(
        await context
          .db('sqlite_master')
          .select('name')
          .where('type', objectType)
          .where('name', 'like', like),
      ).map((row) => String(row.name));
    case 'postgres': {
      const tableType = objectType === 'table' ? 'BASE TABLE' : 'VIEW';
      return rawRows(
        await context.db.raw(
          `
          select table_name as name
          from information_schema.tables
          where table_schema = current_schema()
            and table_type = ?
            and table_name like ?
        `,
          [tableType, like],
        ),
      ).map((row) => String(row.name));
    }
    case 'mysql': {
      const tableType = objectType === 'table' ? 'BASE TABLE' : 'VIEW';
      return rawRows(
        await context.db.raw(
          `
          select table_name as name
          from information_schema.tables
          where table_schema = database()
            and table_type = ?
            and table_name like ?
        `,
          [tableType, like],
        ),
      ).map((row) => String(row.name ?? row.TABLE_NAME));
    }
    default:
      return assertNever(context.spec.dialect);
  }
}

function rawRows(result: unknown): Array<Record<string, any>> {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) {
      return result[0] as Array<Record<string, any>>;
    }
    return result as Array<Record<string, any>>;
  }
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: Array<Record<string, any>> }).rows;
  }
  return [];
}

function createTestPrefix(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `cbt_${process.pid}_${random}`;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeConnectionName(name: string): IntegrationDialect {
  switch (name) {
    case 'sqlite':
    case 'sqlite3':
    case 'better-sqlite3':
      return 'sqlite';
    case 'pg':
    case 'postgres':
    case 'postgresql':
      return 'postgres';
    case 'mysql':
    case 'mysql2':
      return 'mysql';
    default:
      throw new Error(`Unsupported integration database connection "${name}".`);
  }
}

function quoteIdentifier(
  identifier: string,
  dialect: IntegrationDialect,
): string {
  if (dialect === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

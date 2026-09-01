import type { Knex } from 'knex';
import type { DatabaseDialect } from '../../config.js';
import type {
  DatabaseDialectAdapter,
  SchemaInspector,
  SchemaInspectorFactoryContext,
} from '../../../schema/inspector/index.js';
import { MysqlSchemaInspector } from '../../../schema/inspector/dialects/mysql.js';
import { MssqlSchemaInspector } from '../../../schema/inspector/dialects/mssql.js';
import { OracleSchemaInspector } from '../../../schema/inspector/dialects/oracle.js';
import { PostgresSchemaInspector } from '../../../schema/inspector/dialects/postgres.js';
import { SqliteSchemaInspector } from '../../../schema/inspector/dialects/sqlite.js';
import type { KnexConnectionConfig } from './config.js';

type KnexInspectorFactory = (
  context: SchemaInspectorFactoryContext<Knex, KnexConnectionConfig>,
) => SchemaInspector;

class KnexDatabaseDialectAdapter implements DatabaseDialectAdapter<
  Knex,
  KnexConnectionConfig
> {
  constructor(
    readonly dialect: DatabaseDialect,
    private readonly createInspector: KnexInspectorFactory,
  ) {}

  createSchemaInspector(
    context: SchemaInspectorFactoryContext<Knex, KnexConnectionConfig>,
  ): SchemaInspector {
    return this.createInspector(context);
  }
}

const KNEX_DIALECT_ADAPTERS: Readonly<
  Record<DatabaseDialect, DatabaseDialectAdapter<Knex, KnexConnectionConfig>>
> = {
  sqlite: new KnexDatabaseDialectAdapter(
    'sqlite',
    (context) =>
      new SqliteSchemaInspector({
        connectionName: context.connectionName,
        resolveClient: () => context.resolveClient(),
      }),
  ),
  postgres: new KnexDatabaseDialectAdapter(
    'postgres',
    (context) =>
      new PostgresSchemaInspector({
        connectionName: context.connectionName,
        searchPath: context.config.searchPath,
        resolveClient: () => context.resolveClient(),
      }),
  ),
  mysql: new KnexDatabaseDialectAdapter(
    'mysql',
    (context) =>
      new MysqlSchemaInspector({
        connectionName: context.connectionName,
        resolveClient: () => context.resolveClient(),
      }),
  ),
  oracle: new KnexDatabaseDialectAdapter(
    'oracle',
    (context) =>
      new OracleSchemaInspector({
        connectionName: context.connectionName,
        resolveClient: () => context.resolveClient(),
      }),
  ),
  mssql: new KnexDatabaseDialectAdapter(
    'mssql',
    (context) =>
      new MssqlSchemaInspector({
        connectionName: context.connectionName,
        resolveClient: () => context.resolveClient(),
      }),
  ),
};

export function resolveKnexDatabaseDialectAdapter(
  dialect: DatabaseDialect,
): DatabaseDialectAdapter<Knex, KnexConnectionConfig> {
  return KNEX_DIALECT_ADAPTERS[dialect];
}

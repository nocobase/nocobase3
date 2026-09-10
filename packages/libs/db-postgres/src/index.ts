import { createRequire } from 'node:module';
import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  PostgresConnectionConfig,
} from '@nocobase/db';
import { PostgresSchemaInspector } from './inspectors/postgres.js';

const require = createRequire(import.meta.url);
const Pg: unknown = require('pg') as unknown;
const PgQueryStream =
  require('pg-query-stream') as typeof import('pg-query-stream');

export type PostgresOptions = Omit<
  PostgresConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;

export const postgresDriver: DatabaseDriverDefinition<'postgres'> = {
  dialect: 'postgres',
  packageName: '@nocobase/db-postgres',
  nativeDriver: 'pg',
  knexClient: 'pg',
  createKnexClient: (_config, baseClient) => {
    if (!baseClient) return 'pg';
    class PostgresClientWithQueryStream extends baseClient {
      _driver(): unknown {
        return Pg;
      }

      _stream(
        connection: {
          query(query: unknown): NodeJS.ReadableStream;
        },
        obj: { sql?: string; bindings?: unknown[] },
        stream: NodeJS.WritableStream,
        options: unknown,
      ): Promise<void> {
        if (!obj.sql) throw new Error('The query is empty');
        const sql = obj.sql;
        return new Promise((resolve, reject) => {
          const queryStream = connection.query(
            new PgQueryStream(
              sql,
              obj.bindings,
              options as PgQueryStreamConfig,
            ),
          );
          queryStream.on('error', (error) => {
            reject(error instanceof Error ? error : new Error(String(error)));
            stream.emit('error', error);
          });
          queryStream.on('end', resolve);
          queryStream.pipe(stream);
        });
      }
    }
    return PostgresClientWithQueryStream;
  },
  resolveConnection: (
    source: ConnectionConfig,
  ): {
    connection: unknown;
    searchPath?: string[];
    useNullAsDefault?: boolean;
  } => {
    const config = source as PostgresConnectionConfig;
    assertDriverOptions(config.driverOptions, [
      'host',
      'port',
      'database',
      'user',
      'username',
      'password',
      'ssl',
      'pool',
      'url',
      'connectionString',
      'uri',
    ]);
    return {
      connection: compactObject({
        ...config.driverOptions,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl,
      }),
      searchPath:
        config.schema === undefined
          ? undefined
          : typeof config.schema === 'string'
            ? [config.schema]
            : [...config.schema],
    };
  },
  createSchemaInspector: (context) => {
    const schema = (context.config as PostgresConnectionConfig).schema;
    return new PostgresSchemaInspector({
      connectionName: context.connectionName,
      searchPath:
        typeof schema === 'string'
          ? [schema]
          : schema
            ? [...schema]
            : undefined,
      resolveClient: context.resolveClient,
    });
  },
} satisfies DatabaseDriverDefinition<'postgres'>;

export type PostgresConnection = PostgresOptions & {
  dialect: 'postgres';
  databaseDriver: typeof postgresDriver;
};

export interface PostgresFactory {
  (options?: PostgresOptions): PostgresConnection;
  readonly dialect: 'postgres';
  readonly driver: typeof postgresDriver;
}

export const postgres: PostgresFactory = Object.assign(
  (options: PostgresOptions = {}) => ({
    ...options,
    dialect: 'postgres' as const,
    driver: 'pg' as const,
    databaseDriver: postgresDriver,
  }),
  {
    dialect: 'postgres' as const,
    driver: postgresDriver,
  },
);

export default postgres;

type PgQueryStreamConfig = {
  batchSize?: number;
  highWaterMark?: number;
  rowMode?: 'array';
  types?: unknown;
};

function assertDriverOptions(
  driverOptions: Record<string, unknown> | undefined,
  reservedKeys: readonly string[],
): void {
  if (!driverOptions) return;
  const reserved = reservedKeys.filter(
    (key) => driverOptions[key] !== undefined,
  );
  if (reserved.length > 0) {
    throw new Error(
      `Database driverOptions cannot include ${reserved.join(', ')}. Use flattened connection parameters.`,
    );
  }
}

function compactObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

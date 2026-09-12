import { createRequire } from 'node:module';
import type {
  BaseConnectionConfig,
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
} from '@nocobase/db';
import { rawRows } from '@nocobase/db';
import { KingbaseSchemaInspector } from './inspectors/kingbase.js';
import { compileKingbaseJsonCondition } from './json.js';

const require = createRequire(import.meta.url);
const Pg: unknown = require('pg') as unknown;
const PgQueryStream =
  require('pg-query-stream') as typeof import('pg-query-stream');

export interface KingbaseConnectionConfig extends BaseConnectionConfig {
  dialect: 'kingbase';
  driver?: string;
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export type KingbaseOptions = Omit<
  KingbaseConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;

export const kingbaseDriver: DatabaseDriverDefinition<'kingbase'> = {
  dialect: 'kingbase',
  packageName: '@nocobase/db-kingbase',
  nativeDriver: 'pg',
  knexClient: 'pg',
  resolveKnexClient: () =>
    require('knex/lib/dialects/postgres/index.js') as typeof import('knex').Knex.Client,
  capabilities: {
    schemas: true,
    materializedViews: true,
    refreshMaterializedViews: true,
    deferrableConstraints: true,
    partialIndexes: true,
    nativeTypes: true,
    comments: true,
  } satisfies Partial<DatabaseCapabilities>,
  createRuntime: ({ dialect, capabilities }) => ({
    dialect,
    capabilities,
    numeric: {
      hasNativeResults: true,
      aggregateProjection: ({ expression }) => expression,
    },
    schema: {
      columnType: ({ column }) =>
        column.type === 'datetimeTz'
          ? 'timestamp(3) with time zone'
          : column.type === 'datetime'
            ? 'timestamp(3) without time zone'
            : column.type === 'time'
              ? 'time(3)'
              : undefined,
    },
    repository: {
      enumGroupKey: ({ client, field }) =>
        client.raw('convert_to(??, ?)', [field, 'UTF8']),
      compileFilterCondition: ({ query, node, field, name, boolean }) => {
        if (
          field?.type === 'enum' &&
          typeof node.value === 'string' &&
          (node.operator === '$eq' || node.operator === '$ne')
        ) {
          query[boolean === 'or' ? 'orWhereRaw' : 'whereRaw'](
            `convert_to(??, ?) ${node.operator === '$eq' ? '=' : '<>'} convert_to(?, ?)`,
            [name, 'UTF8', node.value, 'UTF8'],
          );
          return { handled: true };
        }
        return { handled: false };
      },
      compileJsonCondition: ({ client, column, node }) =>
        compileKingbaseJsonCondition(client, column, node),
      temporalBinding: ({ value }) => String(value),
      temporalProjection: ({ client, field, reference }) => {
        if (!field)
          return typeof reference === 'string'
            ? client.ref(reference)
            : reference;
        const instant = field.type === 'datetimeTz';
        const format =
          field.type === 'date'
            ? 'YYYY-MM-DD'
            : field.type === 'time'
              ? 'HH24:MI:SS.MS'
              : 'YYYY-MM-DD"T"HH24:MI:SS.MS';
        return client.raw(
          `to_char(${instant ? "?? at time zone 'UTC'" : '??'}, ?)${instant ? " || 'Z'" : ''}`,
          [reference, format],
        );
      },
    },
  }),
  createKnexClient: (_config, baseClient) => {
    if (!baseClient) return 'pg';
    class KingbaseClientWithQueryStream extends baseClient {
      checkVersion(connection: {
        query(
          query: string,
          callback: (
            error: Error | null,
            result: { rows: Array<Record<string, unknown>> },
          ) => void,
        ): void;
      }): Promise<string> {
        return new Promise((resolve, reject) => {
          connection.query('show server_version', (error, result) => {
            if (error) {
              reject(error);
              return;
            }
            const version = result.rows[0]?.server_version;
            resolve(typeof version === 'string' ? version : '12.1');
          });
        });
      }

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
    return KingbaseClientWithQueryStream;
  },
  resolveConnection: (
    source: ConnectionConfig,
  ): {
    connection: unknown;
    searchPath?: string[];
    useNullAsDefault?: boolean;
  } => {
    const config = source as unknown as KingbaseConnectionConfig;
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
    const schema = (context.config as KingbaseConnectionConfig).schema;
    return new KingbaseSchemaInspector({
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
  normalizeConnection: (source) => ({
    host: '127.0.0.1',
    port: 54321,
    database: 'test',
    username: 'nocobase',
    password: 'nocobase',
    ssl: false,
    schema: ['public'],
    ...asKingbaseConnectionConfig(source),
  }),
  resolveOwnershipTarget: (source) => {
    const config = asKingbaseConnectionConfig(source);
    const schema =
      typeof config.schema === 'string'
        ? config.schema
        : (config.schema?.[0] ?? 'public');
    return [
      'kingbase',
      config.host,
      config.port,
      undefined,
      config.database,
      schema,
    ];
  },
  resetManagedSchema: async (context) => {
    const config = context.config as KingbaseConnectionConfig;
    const schema =
      typeof config.schema === 'string'
        ? config.schema
        : (config.schema?.[0] ?? 'public');
    const client = await context.resolveClient();
    const objects = rawRows<{ name: string; kind: string }>(
      await client.raw(
        `select c.relname as name, c.relkind as kind
         from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = ?
           and c.relname not like 'sys_%'
           and c.relkind in ('m', 'v', 'r', 'p', 'S')
         order by case c.relkind when 'm' then 0 when 'v' then 1 when 'r' then 2 when 'p' then 2 else 3 end, c.relname`,
        [schema],
      ),
    );
    for (const object of objects) {
      const kind =
        object.kind === 'm'
          ? 'materialized view'
          : object.kind === 'v'
            ? 'view'
            : object.kind === 'S'
              ? 'sequence'
              : 'table';
      await client.raw(
        `drop ${kind} if exists ${quoteKingbase(schema)}.${quoteKingbase(object.name)} cascade`,
      );
    }
  },
} satisfies DatabaseDriverDefinition<'kingbase'>;

export type KingbaseConnection = KingbaseOptions & {
  dialect: 'kingbase';
  databaseDriver: typeof kingbaseDriver;
};

export interface KingbaseFactory {
  (options?: KingbaseOptions): KingbaseConnection;
  readonly dialect: 'kingbase';
  readonly driver: typeof kingbaseDriver;
}

export const kingbase: KingbaseFactory = Object.assign(
  (options: KingbaseOptions = {}) => ({
    ...options,
    dialect: 'kingbase' as const,
    driver: 'pg' as const,
    databaseDriver: kingbaseDriver,
  }),
  {
    dialect: 'kingbase' as const,
    driver: kingbaseDriver,
  },
);

export default kingbase;

function quoteKingbase(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

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

function asKingbaseConnectionConfig(source: unknown): KingbaseConnectionConfig {
  return source as KingbaseConnectionConfig;
}

export { kingbaseTypes, kingbaseNumeric } from './inspectors/kingbase.js';

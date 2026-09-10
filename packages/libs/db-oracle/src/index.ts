import { createRequire } from 'node:module';
import type {
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
  OracleConnectionConfig,
} from '@nocobase/db';
import { preciseIntegerClient } from './precise-integers.js';
import { OracleSchemaInspector } from './inspectors/oracle.js';

const require = createRequire(import.meta.url);
const Oracledb: unknown = require('oracledb') as unknown;
export type OracleOptions = Omit<
  OracleConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const oracleDriver: DatabaseDriverDefinition<'oracle'> = {
  dialect: 'oracle',
  packageName: '@nocobase/db-oracle',
  nativeDriver: 'oracledb',
  knexClient: 'oracledb',
  capabilities: {
    schemas: true,
    materializedViews: true,
    refreshMaterializedViews: true,
    deferrableConstraints: true,
    nativeTypes: true,
    comments: true,
  } satisfies Partial<DatabaseCapabilities>,
  createRuntime: ({ dialect, capabilities }) => ({
    dialect,
    capabilities,
    numeric: {
      aggregateProjection: ({ client, expression }) =>
        client.raw(`to_char(?, 'TM9', 'NLS_NUMERIC_CHARACTERS=''.,''')`, [
          expression,
        ]),
    },
    repository: {
      streamOptions: () => ({
        outFormat: (Oracledb as { OUT_FORMAT_OBJECT: number })
          .OUT_FORMAT_OBJECT,
      }),
      decodeStreamRow: async (row) => {
        const driver = Oracledb as { CLOB: object; NCLOB: object };
        for (const [field, value] of Object.entries(row)) {
          if (
            !value ||
            typeof value !== 'object' ||
            !(Symbol.asyncIterator in value)
          )
            continue;
          const lob = value as AsyncIterable<Buffer> & { type?: object };
          const textual = lob.type === driver.CLOB || lob.type === driver.NCLOB;
          const chunks: Buffer[] = [];
          for await (const chunk of lob) chunks.push(Buffer.from(chunk));
          row[field] = textual
            ? Buffer.concat(chunks).toString('utf8')
            : Buffer.concat(chunks);
        }
        return row;
      },
      createManyFallback: (collection) =>
        collection.fields?.some(
          (field) =>
            !('target' in field) &&
            ['date', 'time', 'datetime', 'datetimeTz'].includes(field.type),
        ) ?? false,
      emptyInsertValue: ({ client, collection }) => {
        const field = collection.fields?.find(
          (item) => !('target' in item) && item.db?.generated === undefined,
        );
        return field ? { [field.name]: client.raw('default') } : undefined;
      },
      reloadReturnedDecimal: true,
      collectionAliasKeyword: ' ',
      limitLockedQuery: (query) => {
        query.whereRaw('rownum <= ?', [2]);
      },
      encodeBoolean: (field, value) =>
        field.db?.nativeType && /^boolean$/i.test(String(field.db.nativeType))
          ? value === null
            ? null
            : Boolean(value)
          : value === null
            ? null
            : value
              ? 1
              : 0,
      temporalBinding: ({ client, field, value }) => {
        const normalized = String(value);
        if (field.type === 'date')
          return client.raw("to_date(?, 'YYYY-MM-DD')", [normalized]);
        if (field.type === 'time') return normalized;
        const instant = field.type === 'datetimeTz';
        return instant
          ? client.raw(
              'to_timestamp_tz(?, \'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM\')',
              [normalized.replace('Z', '+00:00')],
            )
          : client.raw('to_timestamp(?, \'YYYY-MM-DD"T"HH24:MI:SS.FF3\')', [
              normalized,
            ]);
      },
      temporalProjection: ({ client, field, reference }) => {
        if (!field)
          return typeof reference === 'string'
            ? client.ref(reference)
            : reference;
        if (field.type === 'time')
          return typeof reference === 'string'
            ? client.ref(reference)
            : reference;
        const instant = field.type === 'datetimeTz';
        const format =
          field.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3';
        return client.raw(
          instant
            ? `case when ?? is null then null else to_char(sys_extract_utc(??), ?) || 'Z' end`
            : field.type === 'datetime'
              ? 'to_char(cast(?? as timestamp(3)), ?)'
              : 'to_char(??, ?)',
          instant ? [reference, reference, format] : [reference, format],
        );
      },
    },
    query: {
      configureAggregateResults: ({ query, aliases }) => {
        const driver = Oracledb as {
          DB_TYPE_NUMBER: unknown;
          STRING: unknown;
        };
        query.options({
          fetchTypeHandler: (column: { name: string; dbType: unknown }) =>
            aliases.has(column.name) && column.dbType === driver.DB_TYPE_NUMBER
              ? { type: driver.STRING }
              : undefined,
        });
      },
    },
  }),
  createKnexClient: () =>
    // Oracle's integer codecs are installed by the shared Knex helper.
    preciseIntegerClient(Oracledb),
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as OracleConnectionConfig;
    assertDriverOptions(config.driverOptions, [
      'host',
      'port',
      'database',
      'serviceName',
      'user',
      'username',
      'password',
      'connectString',
      'externalAuth',
      'pool',
      'url',
      'connectionString',
      'uri',
    ]);
    if (config.serviceName.trim() === '') {
      throw new Error(
        'Oracle database serviceName must be a non-empty string.',
      );
    }
    return {
      connection: compactObject({
        ...config.driverOptions,
        user: config.username,
        password: config.password,
        connectString: `${config.host ?? '127.0.0.1'}:${config.port ?? 1521}/${config.serviceName}`,
      }),
    };
  },
  createSchemaInspector: (context) =>
    new OracleSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
  configurePool: (_config, pool) => {
    const configuredAfterCreate = pool.afterCreate;
    return {
      ...pool,
      afterCreate: (
        connection: { execute(sql: string): Promise<unknown> },
        done: (error: unknown, connection?: unknown) => void,
      ) => {
        Promise.all([
          connection.execute(
            `alter session set nls_date_format = 'YYYY-MM-DD HH24:MI:SS'`,
          ),
          connection.execute(
            `alter session set nls_timestamp_format = 'YYYY-MM-DD HH24:MI:SS'`,
          ),
        ])
          .then(() => {
            if (configuredAfterCreate) {
              (
                configuredAfterCreate as unknown as (
                  connection: unknown,
                  done: (error: unknown, connection?: unknown) => void,
                ) => void
              )(connection, done);
            } else done(null, connection);
          })
          .catch((error: unknown) => done(error));
      },
    };
  },
};
export type OracleConnection = OracleOptions & {
  dialect: 'oracle';
  databaseDriver: typeof oracleDriver;
};
export interface OracleFactory {
  (options?: OracleOptions): OracleConnection;
  readonly dialect: 'oracle';
  readonly driver: typeof oracleDriver;
}
export const oracle: OracleFactory = Object.assign(
  (options: OracleOptions = { serviceName: 'FREEPDB1' }) => ({
    ...options,
    dialect: 'oracle' as const,
    driver: 'oracledb' as const,
    databaseDriver: oracleDriver,
  }),
  { dialect: 'oracle' as const, driver: oracleDriver },
);
export default oracle;

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

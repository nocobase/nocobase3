import { createRequire } from 'node:module';
import type {
  BaseConnectionConfig,
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
} from '@nocobase/db';
import type { Knex } from 'knex';
import { DamengSchemaInspector } from './inspectors/dameng.js';

const require = createRequire(import.meta.url);
const DamengClient = require('knex-dm') as typeof Knex.Client;

export interface DamengConnectionConfig extends BaseConnectionConfig {
  dialect: 'dameng';
  connectString?: string;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  username?: string;
  password?: string;
  fetchAsString?: string[];
  compatible?: 'oracle' | 'mysql';
  parseJson?: boolean;
  sqlTransformer?: (sql: string) => string;
}

export type DamengOptions = Omit<
  DamengConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;

export const damengDriver: DatabaseDriverDefinition<'dameng'> = {
  dialect: 'dameng',
  packageName: '@nocobase/db-dameng',
  nativeDriver: 'dmdb',
  knexClient: 'dameng',
  resolveKnexClient: () => DamengClient,
  createKnexClient: (_config, baseClient) => {
    if (!baseClient) return DamengClient;

    class NocobaseDamengClient extends baseClient {
      _driver(): unknown {
        const connection = this.config.connection;
        if (connection && typeof connection === 'object') {
          const options = connection as Record<string, unknown>;
          for (const key of [
            'fetchAsString',
            'compatible',
            'parseJson',
            'sqlTransformer',
          ]) {
            if (options[key] !== undefined) {
              (this.config as Record<string, unknown>)[key] = options[key];
            }
          }
        }
        return (
          DamengClient.prototype as unknown as {
            _driver(this: unknown): unknown;
          }
        )._driver.call(this);
      }
    }

    return NocobaseDamengClient;
  },
  capabilities: {
    schemas: true,
    views: true,
    replaceView: true,
    nativeTypes: true,
    comments: true,
  } satisfies Partial<DatabaseCapabilities>,
  createSchemaInspector: (context) =>
    new DamengSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
  createRuntime: ({ dialect, capabilities }) => ({
    dialect,
    capabilities,
    numeric: {
      hasNativeResults: false,
      aggregateProjection: ({ expression }) => expression,
    },
    schema: {
      normalizeOperation: (operation) => {
        if (operation.type === 'createTable') {
          return {
            ...operation,
            table: {
              ...operation.table,
              columns: operation.table.columns.map((column) =>
                typeof column.defaultValue === 'boolean'
                  ? {
                      ...column,
                      defaultValue: column.defaultValue ? 1 : 0,
                    }
                  : column,
              ),
            },
          };
        }
        return operation;
      },
      columnType: ({ column }) => {
        if (column.autoIncrement || column.type === 'increments')
          return undefined;
        switch (column.type) {
          case 'string':
          case 'enum':
            return `varchar(${column.length ?? 255})`;
          case 'char':
            return `char(${column.length ?? 1})`;
          case 'text':
          case 'json':
            return 'clob';
          case 'boolean':
            return 'number(1, 0)';
          case 'integer':
            return 'integer';
          case 'bigInt':
            return 'bigint';
          case 'decimal':
            return `decimal(${column.precision ?? 38}, ${column.scale ?? 10})`;
          case 'float':
            return 'binary_float';
          case 'double':
            return 'binary_double';
          case 'date':
            return 'date';
          case 'time':
            return 'time(3)';
          case 'datetime':
            return 'timestamp(3)';
          case 'datetimeTz':
            return 'timestamp(3) with time zone';
          case 'blob':
            return 'blob';
          case 'uuid':
            return 'char(36)';
          default:
            return undefined;
        }
      },
      configureForeignKey: ({ foreign, constraint }) => {
        const builder = foreign as {
          onDelete(action: string): unknown;
          onUpdate(action: string): unknown;
        };
        if (constraint.onDelete) {
          builder.onDelete(
            constraint.onDelete === 'restrict'
              ? 'NO ACTION'
              : constraint.onDelete.toUpperCase(),
          );
        }
        if (constraint.onUpdate) {
          builder.onUpdate(
            constraint.onUpdate === 'restrict'
              ? 'NO ACTION'
              : constraint.onUpdate.toUpperCase(),
          );
        }
      },
    },
    repository: {
      emptyInsertValue: ({ client, collection }) => {
        const field = (collection.fields ?? []).find(
          (item) =>
            !['increments', 'bigInt'].includes(item.type) &&
            item.type !== 'id' &&
            item.name !== 'createdAt' &&
            item.name !== 'updatedAt',
        );
        return field ? { [field.name]: client.raw('?', [null]) } : undefined;
      },
      encodeBoolean: (_field, value) => (value === null ? null : value ? 1 : 0),
      temporalBinding: ({ client, field, value }) => {
        const normalized = String(value);
        if (field.type === 'date') {
          return client.raw("to_date(?, 'YYYY-MM-DD')", [normalized]);
        }
        if (field.type === 'time') {
          return client.raw("to_time(?, 'HH24:MI:SS.FF3')", [normalized]);
        }
        if (field.type === 'datetimeTz') {
          return client.raw(
            'to_timestamp_tz(?, \'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM\')',
            [normalized.replace(/Z$/u, '+00:00')],
          );
        }
        return client.raw('to_timestamp(?, \'YYYY-MM-DD"T"HH24:MI:SS.FF3\')', [
          normalized,
        ]);
      },
      temporalProjection: ({ client, field, reference }) => {
        if (!field) {
          return typeof reference === 'string'
            ? client.ref(reference)
            : reference;
        }
        const format =
          field.type === 'date'
            ? 'YYYY-MM-DD'
            : field.type === 'time'
              ? 'HH24:MI:SS.FF3'
              : 'YYYY-MM-DD"T"HH24:MI:SS.FF3';
        return client.raw('to_char(??, ?)', [reference, format]);
      },
      numericMutation: ({ client, field, name, operation, operand }) => {
        if (
          field?.type !== 'integer' &&
          field?.type !== 'bigInt' &&
          field?.type !== 'decimal'
        ) {
          return undefined;
        }
        const operator = (
          {
            increment: '+',
            decrement: '-',
            multiply: '*',
            divide: '/',
          } as Record<string, string>
        )[operation];
        if (!operator) return undefined;
        const type =
          field.type === 'integer'
            ? 'integer'
            : field.type === 'bigInt'
              ? 'bigint'
              : `decimal(${field.precision ?? 38}, ${field.scale ?? 10})`;
        return client.raw(`?? ${operator} cast(? as ${type})`, [
          name,
          String(operand),
        ]);
      },
      compileFilterCondition: ({ query, node, field, name, boolean }) => {
        if (
          field?.type === 'enum' &&
          typeof node.value === 'string' &&
          (node.operator === '$eq' || node.operator === '$ne')
        ) {
          query[boolean === 'or' ? 'orWhereRaw' : 'whereRaw'](
            `?? ${node.operator === '$eq' ? '=' : '<>'} ?`,
            [name, node.value],
          );
          return { handled: true };
        }
        return { handled: false };
      },
    },
  }),
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as unknown as DamengConnectionConfig;
    assertDriverOptions(config.driverOptions, [
      'connectString',
      'connectionString',
      'host',
      'port',
      'database',
      'schema',
      'user',
      'username',
      'password',
      'fetchAsString',
      'compatible',
      'parseJson',
      'sqlTransformer',
    ]);
    const connectString =
      config.connectString ??
      `${config.host ?? '127.0.0.1'}:${config.port ?? 5236}`;
    return {
      connection: compactObject({
        ...config.driverOptions,
        connectString,
        user: config.username,
        password: config.password,
        schema: config.schema,
        fetchAsString: config.fetchAsString ?? ['NUMBER'],
        compatible: config.compatible,
        parseJson: config.parseJson,
        sqlTransformer: config.sqlTransformer,
      }),
    };
  },
  normalizeConnection: (source) => {
    const config = asDamengConfig(source);
    return {
      host: '127.0.0.1',
      port: 5236,
      username: 'SYSDBA',
      password: '',
      ...config,
    };
  },
  resolveOwnershipTarget: (source) => {
    const config = asDamengConfig(source);
    return [
      'dameng',
      config.connectString ?? config.host,
      config.port,
      config.database,
      config.schema,
      config.username,
    ];
  },
};

export interface DamengConnection extends DamengOptions {
  dialect: 'dameng';
  databaseDriver: typeof damengDriver;
}

export interface DamengFactory {
  (options?: DamengOptions): DamengConnection;
  readonly dialect: 'dameng';
  readonly driver: typeof damengDriver;
}

export const dameng: DamengFactory = Object.assign(
  (options: DamengOptions = {}) => ({
    ...options,
    dialect: 'dameng' as const,
    driver: 'dmdb' as const,
    databaseDriver: damengDriver,
  }),
  { dialect: 'dameng' as const, driver: damengDriver },
);

export default dameng;

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
      `Database connection driverOptions cannot include ${reserved.join(', ')}. Use flattened connection parameters.`,
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

function asDamengConfig(source: unknown): DamengConnectionConfig {
  return source as DamengConnectionConfig;
}

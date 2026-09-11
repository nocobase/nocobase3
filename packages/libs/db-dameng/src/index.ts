import { createRequire } from 'node:module';
import type {
  BaseConnectionConfig,
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
} from '@nocobase/db';
import { rawRows } from '@nocobase/db';
import type { Knex } from 'knex';
import { DamengSchemaInspector } from './inspectors/dameng.js';

const require = createRequire(import.meta.url);
const DamengClient = require('knex-dm') as typeof Knex.Client;
const dmdb = require('dmdb') as { OUT_FORMAT_OBJECT: number };

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
  fetchAsBuffer?: string[];
  compatible?: 'oracle' | 'mysql';
  parseJson?: boolean;
  sqlTransformer?: (sql: string) => string;
}

export type DamengOptions = Omit<
  DamengConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;

/**
 * dmdb binds JavaScript strings as VARCHAR, so a canonical ISO-8601 instant
 * reaches DM as text and implicit conversion to `timestamp` fails with
 * "illegal date/time type data" (`-6118`). Convert the instant to a `Date`
 * here so the driver binds it as a native DATETIME. Canonical values that the
 * Repository wraps in `to_timestamp(...)` never end in `Z`, so they are left
 * untouched.
 */
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const damengDriver: DatabaseDriverDefinition<'dameng'> = {
  dialect: 'dameng',
  packageName: '@nocobase/db-dameng',
  nativeDriver: 'dmdb',
  knexClient: 'dameng',
  resolveKnexClient: () => DamengClient,
  createKnexClient: (_config, baseClient) => {
    if (!baseClient) return DamengClient;
    const BaseClient = baseClient;

    class NocobaseDamengClient extends BaseClient {
      prepBindings(bindings: readonly unknown[]): unknown[] {
        const prepared = super.prepBindings(
          bindings as Parameters<typeof BaseClient.prototype.prepBindings>[0],
        ) as unknown[];
        return prepared.map((value: unknown) =>
          typeof value === 'string' && ISO_INSTANT_PATTERN.test(value)
            ? new Date(value)
            : value,
        );
      }

      _stream(
        connection: unknown,
        obj: { sql?: string; bindings?: unknown[] },
        stream: NodeJS.WritableStream,
        options: Record<string, unknown>,
      ): Promise<void> {
        return (
          BaseClient.prototype as unknown as {
            _stream(
              connection: unknown,
              obj: { sql?: string; bindings?: unknown[] },
              stream: NodeJS.WritableStream,
              options: Record<string, unknown>,
            ): Promise<void>;
          }
        )._stream.call(this, connection, obj, stream, {
          ...options,
          outFormat: dmdb.OUT_FORMAT_OBJECT,
        });
      }

      _driver(): unknown {
        const connection = this.config.connection;
        if (connection && typeof connection === 'object') {
          const options = connection as Record<string, unknown>;
          for (const key of [
            'fetchAsString',
            'fetchAsBuffer',
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
    schemas: false,
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
      aggregateSql: ({ client, kind, field, distinct, source }) => {
        const operand = field === '*' ? client.raw('*') : client.ref(field);
        const prefix = distinct ? 'distinct ' : '';
        if (kind === 'count') return client.raw(`count(${prefix}?)`, [operand]);
        if (
          source &&
          ['bigInt', 'integer', 'increments'].includes(source.type) &&
          (kind === 'sum' || kind === 'avg')
        ) {
          return client.raw(`${kind}(${prefix}cast(? as decimal(38, 0)))`, [
            operand,
          ]);
        }
        return client.raw(`${kind}(${prefix}?)`, [operand]);
      },
      aggregateProjection: ({ client, expression }) =>
        client.raw('cast(? as varchar(100))', [expression]),
    },
    query: {
      decodeScalarResult: ({ field, value }) => {
        if (value === null) return null;
        if (field.type === 'integer' || field.type === 'increments')
          return Number(value);
        if (field.type === 'float' || field.type === 'double')
          return Number(value);
        return value;
      },
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
      emptyInsertValue: ({ client, collection, column }) => {
        const field = (collection.fields ?? []).find(
          (item) =>
            !item.autoIncrement &&
            item.db?.generated === undefined &&
            !['increments', 'bigInt'].includes(item.type) &&
            item.type !== 'id' &&
            item.name !== 'createdAt' &&
            item.name !== 'updatedAt',
        );
        if (!field) return undefined;
        return {
          [column(field.name)]: client.raw('?', [
            (field.defaultValue === undefined ? null : field.defaultValue) as
              string | number | boolean | null,
          ]),
        };
      },
      reloadReturnedExactNumeric: true,
      trimCharResults: true,
      decodeStreamRow: async (row) => {
        for (const [field, value] of Object.entries(row)) {
          if (
            !value ||
            typeof value !== 'object' ||
            typeof (value as { getData?: unknown }).getData !== 'function'
          ) {
            continue;
          }
          const lob = value as {
            type?: number;
            getData: () => Promise<string | Buffer>;
            close?: () => Promise<void>;
          };
          row[field] = await lob.getData();
          if (lob.close) await lob.close();
        }
        return row;
      },
      encodeBoolean: (_field, value) => (value === null ? null : value ? 1 : 0),
      temporalBinding: ({ client, field, value }) => {
        const normalized =
          value instanceof Date ? value.toISOString() : String(value);
        if (field.type === 'date') {
          return client.raw("to_date(?, 'YYYY-MM-DD')", [normalized]);
        }
        if (field.type === 'time') {
          return normalized;
        }
        if (field.type === 'datetimeTz') {
          const instant = normalized.replace(/Z$/u, '+00:00');
          return client.raw(
            `to_timestamp_tz('${instant.replace(/'/g, "''")}', 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`,
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
        if (field.type === 'datetimeTz') {
          return client.raw(`to_char(??, '${format}TZH:TZM')`, [reference]);
        }
        return client.raw(`to_char(??, '${format}')`, [reference]);
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
      enumGroupKey: ({ client, field }) =>
        client.raw('utl_raw.cast_to_raw(??)', [field]),
      compileFilterCondition: ({ query, node, field, name, boolean }) => {
        if (
          field?.type === 'text' &&
          (node.operator === '$empty' || node.operator === '$notEmpty')
        ) {
          const method = boolean === 'or' ? 'orWhereRaw' : 'whereRaw';
          query[method](
            node.operator === '$empty'
              ? '(?? is null or dbms_lob.getlength(??) = 0)'
              : '(?? is not null and dbms_lob.getlength(??) > 0)',
            [name, name],
          );
          return { handled: true };
        }
        if (
          field?.type === 'enum' &&
          typeof node.value === 'string' &&
          (node.operator === '$eq' || node.operator === '$ne')
        ) {
          query[boolean === 'or' ? 'orWhereRaw' : 'whereRaw'](
            `utl_raw.cast_to_raw(??) ${node.operator === '$eq' ? '=' : '<>'} utl_raw.cast_to_raw(?)`,
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
      'fetchAsBuffer',
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
        fetchAsString: config.fetchAsString ?? ['CLOB'],
        fetchAsBuffer: config.fetchAsBuffer ?? ['BLOB'],
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
  resetManagedSchema: async (context) => {
    const client = await context.resolveClient();
    const views = rawRows<{ name: string }>(
      await client.raw('select view_name as "name" from user_views'),
    );
    const tables = rawRows<{ name: string }>(
      await client.raw(
        `select table_name as "name"
         from user_tables
         where table_name not like '##%'`,
      ),
    );
    const sequences = rawRows<{ name: string }>(
      await client.raw('select sequence_name as "name" from user_sequences'),
    );
    for (const view of views)
      await client.raw(`drop view ${quoteDameng(view.name)}`);
    for (const table of tables)
      await client.raw(
        `drop table ${quoteDameng(table.name)} cascade constraints`,
      );
    for (const sequence of sequences)
      await client.raw(`drop sequence ${quoteDameng(sequence.name)}`);
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

function quoteDameng(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

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

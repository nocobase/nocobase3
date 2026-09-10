import { createRequire } from 'node:module';
import type { Knex } from 'knex';

import type { DatabaseDialect } from '../../config.js';

const require = createRequire(import.meta.url);

interface SqliteColumn {
  name: string;
  type: string | null;
}

interface SqliteStatement {
  reader: boolean;
  safeIntegers(enabled: boolean): SqliteStatement;
  columns(): SqliteColumn[];
  all(bindings: unknown[]): Record<string, unknown>[];
  run(bindings: unknown[]): {
    lastInsertRowid: number | bigint;
    changes: number | bigint;
  };
}

interface SqliteConnection {
  prepare(sql: string): SqliteStatement;
}

interface SqliteQuery {
  sql: string;
  bindings?: unknown[];
  response?: unknown;
  context?: { lastID: number | string; changes: number };
}

function sqliteInteger(value: unknown, declaredType?: string | null): unknown {
  if (typeof value !== 'bigint') return value;
  if (/^(bigint|int8)/i.test(declaredType ?? '')) return value.toString();
  const number = Number(value);
  // Expressions and SQLite INTEGER columns may exceed JS's safe range too.
  return Number.isSafeInteger(number) ? number : value.toString();
}

interface OracleColumn {
  dbType: unknown;
  precision?: number;
  scale?: number;
}

interface OracleFetchResult {
  type?: unknown;
  converter?: (value: string) => unknown;
}

type OracleFetchHandler = (
  column: OracleColumn,
) => OracleFetchResult | undefined;

interface OracleQuery {
  options?: { fetchTypeHandler?: OracleFetchHandler; [key: string]: unknown };
}

/** Install codecs on this client only; never change process-wide driver parsers. */
export function preciseIntegerClient(
  dialect: DatabaseDialect,
  fallback: string,
  nativeDriver?: unknown,
): string | typeof Knex.Client {
  if (dialect !== 'sqlite' && dialect !== 'oracle') return fallback;
  const Base = require(
    `knex/lib/dialects/${dialect === 'sqlite' ? 'better-sqlite3' : 'oracledb'}/index.js`,
  ) as typeof Knex.Client;
  // Knex transactions construct clients from constructor.prototype, so codecs
  // must live on a local subclass rather than only on the initial instance.
  class PreciseIntegerClient extends Base {}
  if (nativeDriver !== undefined) {
    (
      PreciseIntegerClient.prototype as Knex.Client & {
        _driver: () => unknown;
      }
    )._driver = () => nativeDriver;
  }
  if (dialect === 'sqlite') {
    const prototype = PreciseIntegerClient.prototype as Knex.Client & {
      _query(
        connection: SqliteConnection,
        query: SqliteQuery,
      ): Promise<SqliteQuery>;
    };
    // Knex's SQLite stream also delegates to _query. Decode before either path
    // loses the statement's declared column types or converts int64 to number.
    prototype._query = async (
      connection: SqliteConnection,
      query: SqliteQuery,
    ): Promise<SqliteQuery> => {
      if (!query.sql) throw new Error('The query is empty');
      const statement = connection.prepare(query.sql).safeIntegers(true);
      const bindings = (query.bindings ?? []).map((value) =>
        value instanceof Date
          ? value.valueOf()
          : typeof value === 'boolean'
            ? Number(value)
            : value,
      );
      if (statement.reader) {
        const columns = statement.columns();
        query.response = statement.all(bindings).map((row) => {
          for (const column of columns)
            row[column.name] = sqliteInteger(row[column.name], column.type);
          return row;
        });
      } else {
        const result = statement.run(bindings);
        const lastID = sqliteInteger(result.lastInsertRowid) as number | string;
        const changes = Number(result.changes);
        query.response = { lastInsertRowid: lastID, changes };
        query.context = { lastID, changes };
      }
      return query;
    };
  }
  if (dialect === 'oracle') {
    const prototype = PreciseIntegerClient.prototype as Knex.Client & {
      _query: (
        this: Knex.Client,
        connection: unknown,
        query: OracleQuery,
      ) => Promise<unknown>;
      _stream: (
        this: Knex.Client,
        connection: unknown,
        query: unknown,
        output: unknown,
        options: OracleQuery['options'],
      ) => Promise<unknown>;
    };
    const withHandler = (
      driver: { DB_TYPE_NUMBER: unknown; STRING: unknown },
      options: OracleQuery['options'],
    ): OracleQuery['options'] => ({
      ...options,
      fetchTypeHandler: (
        column: OracleColumn,
      ): OracleFetchResult | undefined => {
        // NUMBER(18,0) is Builder's bigInt representation. Wider integral
        // columns need the same lossless transport; ordinary integers stay numbers.
        if (
          column.dbType === driver.DB_TYPE_NUMBER &&
          column.scale === 0 &&
          (column.precision ?? 0) >= 16
        ) {
          return { type: driver.STRING };
        }
        return options?.fetchTypeHandler?.(column);
      },
    });
    const query = prototype._query;
    prototype._query = function (
      connection: unknown,
      obj: OracleQuery,
    ): Promise<unknown> {
      return query.call(this, connection, {
        ...obj,
        options: withHandler(this.driver, obj.options),
      });
    };
    const stream = prototype._stream;
    prototype._stream = function (
      connection: unknown,
      obj: unknown,
      output: unknown,
      options: OracleQuery['options'],
    ): Promise<unknown> {
      return stream.call(
        this,
        connection,
        obj,
        output,
        withHandler(this.driver, options),
      );
    };
  }
  return PreciseIntegerClient;
}

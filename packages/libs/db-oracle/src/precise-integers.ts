import { createRequire } from 'node:module';
import type { Knex } from 'knex';

const require = createRequire(import.meta.url);

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

export function preciseIntegerClient(
  nativeDriver?: unknown,
): string | typeof Knex.Client {
  const Base =
    require('knex/lib/dialects/oracledb/index.js') as typeof Knex.Client;
  class PreciseIntegerClient extends Base {}
  if (nativeDriver !== undefined) {
    (
      PreciseIntegerClient.prototype as Knex.Client & { _driver: () => unknown }
    )._driver = () => nativeDriver;
  }
  const prototype = PreciseIntegerClient.prototype as Knex.Client & {
    config: { fetchAsString?: string[] };
    fetchAsString?: unknown[];
    driver: unknown;
    _driver: (this: Knex.Client) => unknown;
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
    fetchTypeHandler: (column: OracleColumn): OracleFetchResult | undefined => {
      if (
        column.dbType === driver.DB_TYPE_NUMBER &&
        column.scale === 0 &&
        (column.precision ?? 0) >= 16
      )
        return { type: driver.STRING };
      return options?.fetchTypeHandler?.(column);
    },
  });
  const query = prototype._query;
  prototype._query = function (connection, obj) {
    const driver = this.driver as unknown as {
      DB_TYPE_NUMBER: unknown;
      STRING: unknown;
    };
    return query.call(this, connection, {
      ...obj,
      options: withHandler(driver, obj.options),
    });
  };
  const stream = prototype._stream;
  // Knex normally initializes this array in its own `_driver()` method.  The
  // dialect package replaces that method to inject its resolved native
  // driver, so it must preserve the initialization itself.  Assigning
  // `undefined` to oracledb.fetchAsString causes NJS-004 before the first
  // connection is opened.
  prototype._driver = function () {
    const client = this as unknown as {
      config: { fetchAsString?: string[] };
      fetchAsString: unknown[];
    };
    const driver = nativeDriver as Record<string, unknown>;
    client.fetchAsString = [];
    for (const type of client.config.fetchAsString ?? []) {
      const key = type.toUpperCase();
      if (
        ['NUMBER', 'DATE', 'CLOB', 'BUFFER'].includes(key) &&
        driver[key] !== undefined
      ) {
        client.fetchAsString.push(driver[key]);
      }
    }
    return nativeDriver;
  };
  prototype._stream = function (connection, obj, output, options) {
    const driver = this.driver as unknown as {
      DB_TYPE_NUMBER: unknown;
      STRING: unknown;
    };
    return stream.call(
      this,
      connection,
      obj,
      output,
      withHandler(driver, options),
    );
  };
  return PreciseIntegerClient;
}

import { installDecimalAggregates } from '../../../numeric/sqlite.js';
import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';
import { preciseIntegerClient } from './precise-integers.js';

export function createKnexClient(config: KnexConnectionConfig): Knex {
  const client = knex({
    client:
      config.databaseDriver?.createKnexClient?.(config) ??
      preciseIntegerClient(config.dialect, config.knexClient),
    connection: config.connection as Knex.StaticConnectionConfig,
    pool: config.databaseDriver?.configurePool
      ? config.databaseDriver.configurePool(config, config.pool ?? {})
      : resolvePoolConfig(config),
    useNullAsDefault: config.useNullAsDefault,
    searchPath: config.searchPath,
    debug: config.debug,
  });
  // Keep dialect detection stable when the driver uses a local subclass.
  client.client.config.client = config.knexClient;
  return client;
}

function resolvePoolConfig(config: KnexConnectionConfig): Knex.PoolConfig {
  const pool = (config.pool ?? {}) as Knex.PoolConfig;
  if (config.dialect === 'sqlite') {
    const afterCreate = pool.afterCreate;
    return {
      ...pool,
      afterCreate: (
        connection: Parameters<typeof installDecimalAggregates>[0],
        done: (error: unknown, connection?: unknown) => void,
      ) => {
        try {
          installDecimalAggregates(connection);
          if (afterCreate) afterCreate(connection, done);
          else done(null, connection);
        } catch (error) {
          done(error);
        }
      },
    };
  }
  if (config.dialect !== 'oracle') return pool;
  const configuredAfterCreate = pool.afterCreate;
  return {
    ...pool,
    afterCreate: (connection: OracleSessionConnection, done: PoolDone) => {
      configureOracleSession(connection)
        .then(() => {
          if (configuredAfterCreate) configuredAfterCreate(connection, done);
          else done(null, connection);
        })
        .catch((error: unknown) => done(error));
    },
  };
}

interface OracleSessionConnection {
  execute(sql: string): Promise<unknown>;
}
type PoolDone = (error: unknown, connection?: OracleSessionConnection) => void;
async function configureOracleSession(
  connection: OracleSessionConnection,
): Promise<void> {
  await connection.execute(
    `alter session set nls_date_format = 'YYYY-MM-DD HH24:MI:SS'`,
  );
  await connection.execute(
    `alter session set nls_timestamp_format = 'YYYY-MM-DD HH24:MI:SS'`,
  );
}

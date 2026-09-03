import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';

export function createKnexClient(config: KnexConnectionConfig): Knex {
  return knex({
    client: config.knexClient,
    connection: config.connection as Knex.StaticConnectionConfig,
    pool: resolvePoolConfig(config),
    useNullAsDefault: config.useNullAsDefault,
    searchPath: config.searchPath,
    debug: config.debug,
  });
}

function resolvePoolConfig(config: KnexConnectionConfig): Knex.PoolConfig {
  const pool = (config.pool ?? {}) as Knex.PoolConfig;
  if (config.dialect !== 'oracle') {
    return pool;
  }

  const configuredAfterCreate = pool.afterCreate;
  return {
    ...pool,
    afterCreate: (connection: OracleSessionConnection, done: PoolDone) => {
      configureOracleSession(connection)
        .then(() => {
          if (configuredAfterCreate) {
            configuredAfterCreate(connection, done);
            return;
          }
          done(null, connection);
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

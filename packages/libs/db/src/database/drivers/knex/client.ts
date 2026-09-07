import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';
import { isQuarantinedKnexConnection } from './connection-quarantine.js';

export function createKnexClient(config: KnexConnectionConfig): Knex {
  const pool = config.pool as Knex.PoolConfig | undefined;
  const validate = pool?.validate;
  return knex({
    client: config.knexClient,
    connection: config.connection as Knex.StaticConnectionConfig,
    pool: {
      ...pool,
      validate: async (connection: object): Promise<boolean> =>
        !isQuarantinedKnexConnection(connection) &&
        (validate ? await validate(connection) : true),
    },
    useNullAsDefault: config.useNullAsDefault,
    searchPath: config.searchPath,
    debug: config.debug,
  });
}

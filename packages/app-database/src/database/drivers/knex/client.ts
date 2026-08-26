import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';

export function createKnexClient(config: KnexConnectionConfig): Knex {
  return knex({
    client: config.knexClient,
    connection: config.connection as Knex.StaticConnectionConfig,
    pool: config.pool as Knex.PoolConfig,
    useNullAsDefault: config.useNullAsDefault,
    searchPath: config.searchPath,
    debug: config.debug,
  });
}

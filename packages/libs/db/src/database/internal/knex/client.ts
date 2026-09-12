import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';

export function createKnexClient(config: KnexConnectionConfig): Knex {
  const baseClient = config.databaseDriver?.resolveKnexClient?.();
  const dialectClient = config.databaseDriver?.createKnexClient?.(
    config,
    baseClient,
  );
  const client = knex({
    client: dialectClient ?? baseClient ?? config.knexClient,
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
  return config.pool ?? {};
}

import { createRequire } from 'node:module';
import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';

const require = createRequire(import.meta.url);

export function createKnexClient(config: KnexConnectionConfig): Knex {
  const dialectClient = config.databaseDriver?.createKnexClient?.(
    config,
    resolveKnexDialectClient(config.knexClient),
  );
  const client = knex({
    client: dialectClient ?? config.knexClient,
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

function resolveKnexDialectClient(clientName: string): typeof Knex.Client {
  const dialect = clientName === 'pg' ? 'postgres' : clientName;
  return require(`knex/lib/dialects/${dialect}/index.js`) as typeof Knex.Client;
}

function resolvePoolConfig(config: KnexConnectionConfig): Knex.PoolConfig {
  return config.pool ?? {};
}

import knex, { type Knex } from 'knex';
import type { KnexConnectionConfig } from './config.js';

export function createKnexClient(config: KnexConnectionConfig): Knex {
  return knex({
    client: config.client,
    connection: config.connection as Knex.StaticConnectionConfig,
    pool: config.pool as Knex.PoolConfig,
    useNullAsDefault: config.useNullAsDefault,
    searchPath: config.searchPath,
    debug: config.debug,
  });
}

export function normalizeKnexDialect(client: string): string {
  switch (client) {
    case 'better-sqlite3':
    case 'sqlite3':
      return 'sqlite';
    case 'pg':
    case 'postgres':
    case 'postgresql':
      return 'postgres';
    case 'mysql':
    case 'mysql2':
      return 'mysql';
    default:
      return client;
  }
}

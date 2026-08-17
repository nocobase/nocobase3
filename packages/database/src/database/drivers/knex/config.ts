import type { BaseConnectionConfig } from '../../config.js';

export interface KnexConnectionConfig extends BaseConnectionConfig {
  driver: 'knex';
  client: string;
  connection?: unknown;
  pool?: unknown;
  useNullAsDefault?: boolean;
  searchPath?: string[];
}

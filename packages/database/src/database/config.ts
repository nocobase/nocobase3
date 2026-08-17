import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/index.js';
import type { NamingStrategy } from '../naming/index.js';
import type { DatabaseCapabilities } from '../schema/index.js';
import type { KnexConnectionConfig } from './drivers/knex/config.js';

export interface DatabaseConfig {
  default?: string;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}

export type ConnectionConfig = KnexConnectionConfig;

export interface BaseConnectionConfig {
  driver: string;
  schema?: string;
  naming?: NamingOptions;
  namingStrategy?: NamingStrategy;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  managed?: boolean;
  debug?: boolean;
}

export function defineDatabase<T extends DatabaseConfig>(config: T): T {
  return config;
}

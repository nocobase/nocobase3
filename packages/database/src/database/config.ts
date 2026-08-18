import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/index.js';
import type { NamingStrategy } from '../naming/index.js';
import type { DatabaseCapabilities } from '../schema/index.js';

export interface DatabaseConfig {
  default?: string;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}

export type DatabaseDialect = 'sqlite' | 'postgres' | 'mysql';

export interface BaseConnectionConfig {
  naming?: NamingOptions;
  namingStrategy?: NamingStrategy;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  managed?: boolean;
  debug?: boolean;
  pool?: unknown;
  driverOptions?: Record<string, unknown>;
}

export interface SqliteConnectionConfig extends BaseConnectionConfig {
  dialect: 'sqlite';
  driver?: 'better-sqlite3';
  filename: string;
}

export type PostgresConnectionConfig = BaseConnectionConfig & {
  dialect: 'postgres';
  driver?: 'pg';
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
} & HostConnectionConfig;

export type MysqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mysql';
  driver?: 'mysql2';
  charset?: string;
  timezone?: string;
  ssl?: boolean | Record<string, unknown>;
} & MysqlConnectionTargetConfig;

export type ConnectionConfig =
  | SqliteConnectionConfig
  | PostgresConnectionConfig
  | MysqlConnectionConfig;

export type DatabaseDriver = NonNullable<ConnectionConfig['driver']>;

type MysqlConnectionTargetConfig =
  | (HostConnectionConfig & { socketPath?: never })
  | SocketConnectionConfig;

interface HostConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

interface SocketConnectionConfig {
  host?: never;
  port?: never;
  socketPath: string;
  database?: string;
  username?: string;
  password?: string;
}

export function defineDatabase<T extends DatabaseConfig>(config: T): T {
  return config;
}

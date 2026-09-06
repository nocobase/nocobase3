import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/document-store.js';
import type { DatabaseCapabilities } from '../schema/adapter.js';

export interface DatabaseConfig {
  default?: string;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}

export type DatabaseDialect =
  'sqlite' | 'postgres' | 'mysql' | 'oracle' | 'mssql';

export type SchemaManagementMode = 'managed' | 'external';

export interface BaseConnectionConfig {
  naming?: NamingOptions;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  onCollectionMetadataInvalidationError?: (error: unknown) => void;
  schemaManagement?: SchemaManagementMode;
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

export type OracleConnectionConfig = BaseConnectionConfig & {
  dialect: 'oracle';
  driver?: 'oracledb';
  serviceName: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};

export type MssqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mssql';
  driver?: 'tedious';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

export type ConnectionConfig =
  | SqliteConnectionConfig
  | PostgresConnectionConfig
  | MysqlConnectionConfig
  | OracleConnectionConfig
  | MssqlConnectionConfig;

export type DatabaseDriver = NonNullable<ConnectionConfig['driver']>;

type MysqlConnectionTargetConfig =
  (HostConnectionConfig & { socketPath?: never }) | SocketConnectionConfig;

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

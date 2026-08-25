import type { CollectionBuilder } from '../collection/builder/index.js';
import type { DatabaseConnection } from '../database/index.js';
import type { DatabaseDialect, DatabaseDriver } from '../database/config.js';
import type { DatabaseCapabilities } from '../schema/index.js';
import type { QueryAdapter } from '../query/index.js';

export type MigrationTransactionMode = true | false | 'auto';

export interface MigrationConnection {
  readonly name: string;
  readonly driver: DatabaseDriver;
  readonly dialect: DatabaseDialect;
  readonly capabilities: DatabaseCapabilities;

  client<T = unknown>(): Promise<T>;
}

export interface MigrationContext {
  readonly builder: CollectionBuilder;
  readonly query: QueryAdapter;
  readonly connection: MigrationConnection;
}

export interface MigrationDefinition {
  readonly name: string;
  /** Stable checksum used when source and compiled migration artifacts differ. */
  readonly checksum?: string;
  readonly transaction?: MigrationTransactionMode;
  readonly irreversible?: boolean;
  readonly acceptedChecksums?: readonly string[];
  up(context: MigrationContext): Promise<void>;
  down?(context: MigrationContext): Promise<void>;
}

export interface LoadedMigration {
  readonly packageName: string;
  readonly name: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly checksum: string;
  readonly migration: MigrationDefinition;
}

export interface MigrationSource {
  readonly packageName: string;
  readonly directory: string;
  readonly extensions?: readonly string[];
}

export interface LoadMigrationsOptions {
  readonly directory?: string;
  readonly packageName?: string;
  readonly extensions?: readonly string[];
  readonly sources?: readonly MigrationSource[];
}

export interface CreateMigratorOptions extends LoadMigrationsOptions {
  readonly database: {
    connection(name?: string): DatabaseConnection;
  };
  readonly connection?: string;
  readonly tableName?: string;
  readonly lockTableName?: string;
}

export interface MigrationRunResult {
  readonly batch: number;
  readonly executed: string[];
  readonly skipped: string[];
}

export interface MigrationRollbackResult {
  readonly batch: number;
  readonly rolledBack: string[];
}

export interface MigrationHistoryRecord {
  readonly id: number;
  readonly packageName: string;
  readonly name: string;
  readonly batch: number;
  readonly checksum: string;
  readonly executedAt: Date | string;
  readonly durationMs: number | null;
}

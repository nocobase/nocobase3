import type { CollectionBuilder } from '../collection/builder/builder.js';
import type { DatabaseConnection } from '../database/connection.js';
import type { DatabaseDialect, DatabaseDriver } from '../database/config.js';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { QueryAdapter } from '../query/types.js';

/** Controls whether an individual migration runs in a database transaction. */
export type MigrationTransactionMode = true | false | 'auto';

/** Restricted connection capabilities exposed to migration definitions. */
export interface MigrationConnection {
  readonly name: string;
  readonly driver: DatabaseDriver;
  readonly dialect: DatabaseDialect;
  readonly capabilities: DatabaseCapabilities;

  client<T = unknown>(): Promise<T>;
}

/** Services available while applying or rolling back a migration. */
export interface MigrationContext {
  readonly builder: CollectionBuilder;
  readonly query: QueryAdapter;
  readonly connection: MigrationConnection;
}

/** Named database change loaded and executed by a Migrator. */
export interface MigrationDefinition {
  readonly name: string;
  readonly transaction?: MigrationTransactionMode;
  readonly irreversible?: boolean;
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

/** Filesystem source containing migration definition modules. */
export interface MigrationSource {
  readonly packageName: string;
  readonly directory: string;
  readonly extensions?: readonly string[];
}

/** Selects either one migration directory or an ordered set of named sources. */
export interface LoadMigrationsOptions {
  readonly directory?: string;
  readonly packageName?: string;
  readonly extensions?: readonly string[];
  readonly sources?: readonly MigrationSource[];
}

/** Configuration for a standalone Migrator, including its database dependency. */
export interface CreateMigratorOptions extends LoadMigrationsOptions {
  readonly database: {
    connection(name?: string): DatabaseConnection;
  };
  readonly connection?: string;
  readonly tableName?: string;
  readonly lockTableName?: string;
}

/** Configuration accepted by DatabaseManager.createMigrator(). */
export type DatabaseMigratorOptions = Omit<CreateMigratorOptions, 'database'>;

/** Summary returned after applying migrations. */
export interface MigrationRunResult {
  readonly batch: number;
  readonly executed: string[];
  readonly skipped: string[];
}

/** Summary returned after rolling back the latest migration batch. */
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

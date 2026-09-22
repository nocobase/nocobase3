import type { ServiceResolver } from '@nocobase/service-provider';
import type { DatabaseTaskConfig } from '../task-config.js';
import type {
  ChecksumMismatch,
  ChecksumMismatchPolicy,
} from './checksum-history.js';
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
  readonly config: DatabaseTaskConfig;
  readonly container: ServiceResolver;
  /** Runtime configuration for applicability; excluded from history identity. */
  readonly configuration?: readonly Readonly<Record<string, unknown>>[];
  /** Immutable target parameters declared by this migration source. */
  readonly parameters?: Readonly<Record<string, string>>;
  readonly builder: CollectionBuilder;
  readonly query: QueryAdapter;
  readonly connection: MigrationConnection;
}

/** Named database change loaded and executed by a Migrator. */
export interface MigrationDefinition {
  readonly name: string;
  readonly transaction?: MigrationTransactionMode;
  readonly irreversible?: boolean;
  /** Evaluated for pending migrations under the migration lock. False does not record history. */
  shouldRun?(context: MigrationContext): boolean | Promise<boolean>;
  up(context: MigrationContext): Promise<void>;
  down?(context: MigrationContext): Promise<void>;
}

export interface LoadedMigration {
  /** Runtime configuration for applicability; excluded from history identity. */
  readonly configuration?: readonly Readonly<Record<string, unknown>>[];
  readonly parameters?: Readonly<Record<string, string>>;
  readonly packageName: string;
  readonly name: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly checksum: string;
  /** Verified pre-manifest artifact hash used only to upgrade legacy history. */
  readonly legacyChecksum?: string;
  readonly migration: MigrationDefinition;
}

/** Filesystem source containing migration definition modules. */
export interface MigrationSource {
  /** Runtime configuration for applicability; excluded from history identity. */
  readonly configuration?: readonly Readonly<Record<string, unknown>>[];
  /** Distinct parameter sets receive distinct migration history identities. */
  readonly parameters?: Readonly<Record<string, string>>;
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
  readonly config?: DatabaseTaskConfig;
  readonly container?: ServiceResolver;
  readonly database: {
    connection(name?: string): DatabaseConnection;
  };
  readonly connection?: string;
  readonly tableName?: string;
  readonly lockTableName?: string;
  /**
   * How to react when an executed migration's source no longer hashes to the
   * checksum recorded for it. Defaults to `warn`.
   */
  readonly onChecksumMismatch?: ChecksumMismatchPolicy;
}

/** Configuration accepted by DatabaseManager.createMigrator(). */
export type DatabaseMigratorOptions = Omit<CreateMigratorOptions, 'database'>;

/** Summary returned after applying migrations. */
export interface MigrationRunResult {
  readonly batch: number;
  readonly executed: string[];
  readonly skipped: string[];
  /** Checksum drift the `warn` policy allowed the run to continue past. */
  readonly warnings: ChecksumMismatch[];
}

/** Summary returned after rolling back the latest migration batch. */
export interface MigrationRollbackResult {
  readonly batch: number;
  readonly rolledBack: string[];
  /** Checksum drift the `warn` policy allowed the rollback to continue past. */
  readonly warnings: ChecksumMismatch[];
}

/** Options accepted by Migrator.repair(). */
export interface MigrationRepairOptions {
  /** Report what would be rewritten without writing anything. */
  readonly dryRun?: boolean;
}

/** Summary returned after realigning recorded migration checksums. */
export interface MigrationRepairResult {
  /** Records rewritten, or the records a dry run would rewrite. */
  readonly repaired: ChecksumMismatch[];
  readonly dryRun: boolean;
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

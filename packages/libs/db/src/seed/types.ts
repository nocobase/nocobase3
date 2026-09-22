import type { ServiceResolver } from '@nocobase/service-provider';
import type { DatabaseTaskConfig } from '../task-config.js';
import type { DatabaseConnection } from '../database/connection.js';
import type {
  ChecksumMismatch,
  ChecksumMismatchPolicy,
} from '../migration/checksum-history.js';
import type { MigrationConnection } from '../migration/types.js';
import type { QueryAdapter } from '../query/types.js';

/** Controls whether an individual seed runs in a database transaction. */
export type SeedTransactionMode = true | false | 'auto';

/** Restricted database connection exposed to seed definitions. */
export type SeedConnection = MigrationConnection;

/** Services available while executing a seed definition. */
export interface SeedContext {
  readonly config: DatabaseTaskConfig;
  readonly container: ServiceResolver;
  readonly query: QueryAdapter;
  readonly connection: SeedConnection;
}

/** Named installation data operation loaded and executed by a Seeder. */
export interface SeedDefinition {
  readonly name: string;
  readonly transaction?: SeedTransactionMode;
  run(context: SeedContext): Promise<void>;
}

export interface LoadedSeed {
  readonly packageName: string;
  readonly name: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly checksum: string;
  /** Verified pre-manifest artifact hash used only to upgrade legacy history. */
  readonly legacyChecksum?: string;
  readonly seed: SeedDefinition;
}

/** Filesystem source containing seed definition modules. */
export interface SeedSource {
  readonly packageName: string;
  readonly directory: string;
  readonly extensions?: readonly string[];
}

/** Selects either one seed directory or an ordered set of named sources. */
export interface LoadSeedsOptions {
  readonly directory?: string;
  readonly packageName?: string;
  readonly extensions?: readonly string[];
  readonly sources?: readonly SeedSource[];
}

/** Configuration for a standalone Seeder, including its database dependency. */
export interface CreateSeederOptions extends LoadSeedsOptions {
  readonly config?: DatabaseTaskConfig;
  readonly container?: ServiceResolver;
  readonly database: {
    connection(name?: string): DatabaseConnection;
  };
  readonly connection?: string;
  readonly tableName?: string;
  readonly lockTableName?: string;
  /**
   * How to react when an executed seed's source no longer hashes to the
   * checksum recorded for it. Defaults to `warn`.
   */
  readonly onChecksumMismatch?: ChecksumMismatchPolicy;
}

/** Configuration accepted by DatabaseManager.createSeeder(). */
export type DatabaseSeederOptions = Omit<CreateSeederOptions, 'database'>;

/** Summary returned after executing pending seeds. */
export interface SeedRunResult {
  readonly executed: string[];
  readonly skipped: string[];
  /** Checksum drift the `warn` policy allowed the run to continue past. */
  readonly warnings: ChecksumMismatch[];
}

/** Options accepted by Seeder.repair(). */
export interface SeedRepairOptions {
  /** Report what would be rewritten without writing anything. */
  readonly dryRun?: boolean;
}

/** Summary returned after realigning recorded seed checksums. */
export interface SeedRepairResult {
  /** Records rewritten, or the records a dry run would rewrite. */
  readonly repaired: ChecksumMismatch[];
  readonly dryRun: boolean;
}

export interface SeedHistoryRecord {
  readonly id: number;
  readonly packageName: string;
  readonly name: string;
  readonly checksum: string;
  readonly executedAt: Date | string;
  readonly durationMs: number | null;
}

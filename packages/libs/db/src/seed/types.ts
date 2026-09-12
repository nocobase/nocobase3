import type { DatabaseConnection } from '../database/connection.js';
import type { MigrationConnection } from '../migration/types.js';
import type { QueryAdapter } from '../query/types.js';

/** Controls whether an individual seed runs in a database transaction. */
export type SeedTransactionMode = true | false | 'auto';

/** Restricted database connection exposed to seed definitions. */
export type SeedConnection = MigrationConnection;

/** Services available while executing a seed definition. */
export interface SeedContext {
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
  readonly database: {
    connection(name?: string): DatabaseConnection;
  };
  readonly connection?: string;
  readonly tableName?: string;
  readonly lockTableName?: string;
}

/** Configuration accepted by DatabaseManager.createSeeder(). */
export type DatabaseSeederOptions = Omit<CreateSeederOptions, 'database'>;

/** Summary returned after executing pending seeds. */
export interface SeedRunResult {
  readonly executed: string[];
  readonly skipped: string[];
}

export interface SeedHistoryRecord {
  readonly id: number;
  readonly packageName: string;
  readonly name: string;
  readonly checksum: string;
  readonly executedAt: Date | string;
  readonly durationMs: number | null;
}

import type { DatabaseConnection } from '../database/index.js';
import type { MigrationConnection } from '../migration/types.js';
import type { QueryAdapter } from '../query/index.js';

export type SeedTransactionMode = true | false | 'auto';

export type SeedConnection = MigrationConnection;

export interface SeedContext {
  readonly query: QueryAdapter;
  readonly connection: SeedConnection;
}

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

export interface SeedSource {
  readonly packageName: string;
  readonly directory: string;
  readonly extensions?: readonly string[];
}

export interface LoadSeedsOptions {
  readonly directory?: string;
  readonly packageName?: string;
  readonly extensions?: readonly string[];
  readonly sources?: readonly SeedSource[];
}

export interface CreateSeederOptions extends LoadSeedsOptions {
  readonly database: {
    connection(name?: string): DatabaseConnection;
  };
  readonly connection?: string;
  readonly tableName?: string;
  readonly lockTableName?: string;
}

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

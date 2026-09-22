import {
  collectChecksumMismatches,
  describeChecksumMismatch,
  upgradeTaskChecksums,
  writeTaskChecksums,
  type ChecksumMismatch,
} from '../migration/checksum-history.js';
import { createMigrationConnection } from '../migration/internal/context.js';
import { createSeedContext } from './internal/context.js';
import {
  DEFAULT_SEED_TABLE,
  ensureSeedTable,
  readSeedHistory,
  recordSeedCompleted,
} from './internal/history.js';
import { DEFAULT_SEED_LOCK_TABLE, withSeedLock } from './internal/lock.js';
import { loadSeeds } from './loader.js';
import type {
  CreateSeederOptions,
  LoadedSeed,
  SeedHistoryRecord,
  SeedRepairOptions,
  SeedRepairResult,
  SeedRunResult,
} from './types.js';

/** Executes pending seed definitions for one database connection. */
export interface Seeder {
  /** Executes every seed that has no matching history record. */
  run(): Promise<SeedRunResult>;
  /**
   * Rewrites recorded checksums to match the current sources, clearing drift
   * reported by a run. Executes no seed and changes no data.
   */
  repair(options?: SeedRepairOptions): Promise<SeedRepairResult>;
}

/** Creates a seed runner backed by the supplied database manager. */
export function createSeeder(options: CreateSeederOptions): Seeder {
  return new DefaultSeeder(options);
}

class DefaultSeeder implements Seeder {
  constructor(private readonly options: CreateSeederOptions) {}

  async run(): Promise<SeedRunResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    const seeds = await loadSeeds(this.options);
    const seedConnection = createSeedContext(
      connection,
      this.options.config,
      this.options.container,
    ).connection;

    return withSeedLock(
      seedConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_SEED_LOCK_TABLE,
      },
      async () => {
        await ensureSeedTable(
          seedConnection,
          this.options.tableName ?? DEFAULT_SEED_TABLE,
        );

        const history = await readSeedHistory(
          seedConnection,
          this.options.tableName,
        );
        const warnings = this.validateAppliedHistory(seeds, history);
        await upgradeTaskChecksums(
          seedConnection,
          this.options.tableName ?? DEFAULT_SEED_TABLE,
          seeds,
          history,
        );

        const appliedNames = new Set(history.map((record) => record.name));
        const pending = seeds.filter((seed) => !appliedNames.has(seed.name));
        const skipped = seeds
          .filter((seed) => appliedNames.has(seed.name))
          .map((seed) => seed.name);
        const executed: string[] = [];

        for (const seed of pending) {
          await this.runSeed(connection, seed);
          executed.push(seed.name);
        }

        return { executed, skipped, warnings };
      },
    );
  }

  async repair(options: SeedRepairOptions = {}): Promise<SeedRepairResult> {
    const connection = this.options.database.connection(
      this.options.connection,
    );
    const tableName = this.options.tableName ?? DEFAULT_SEED_TABLE;
    const seeds = await loadSeeds(this.options);
    const seedConnection = createMigrationConnection(connection);

    return withSeedLock(
      seedConnection,
      {
        tableName: this.options.lockTableName ?? DEFAULT_SEED_LOCK_TABLE,
      },
      async () => {
        await ensureSeedTable(seedConnection, tableName);
        const history = await readSeedHistory(
          seedConnection,
          this.options.tableName,
        );
        const repaired = collectChecksumMismatches(seeds, history);
        if (!options.dryRun)
          await writeTaskChecksums(seedConnection, tableName, repaired);
        return { repaired, dryRun: options.dryRun === true };
      },
    );
  }

  /** Applies the configured policy to executed seeds whose source has changed. */
  private validateAppliedHistory(
    seeds: LoadedSeed[],
    history: SeedHistoryRecord[],
  ): ChecksumMismatch[] {
    const mismatches = collectChecksumMismatches(seeds, history);
    if (this.options.onChecksumMismatch === 'error' && mismatches.length) {
      throw new Error(describeChecksumMismatch(mismatches[0], 'seed'));
    }
    return mismatches;
  }

  private async runSeed(
    connection: ReturnType<CreateSeederOptions['database']['connection']>,
    loaded: LoadedSeed,
  ): Promise<void> {
    const mode = loaded.seed.transaction ?? 'auto';
    if (mode === false) {
      const context = createSeedContext(
        connection,
        this.options.config,
        this.options.container,
      );
      const startedAt = Date.now();
      await loaded.seed.run(context);
      await recordSeedCompleted(context.connection, {
        tableName: this.options.tableName,
        packageName: loaded.packageName,
        name: loaded.name,
        checksum: loaded.checksum,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await connection.transaction(async (trxConnection) => {
      const context = createSeedContext(
        trxConnection,
        this.options.config,
        this.options.container,
      );
      const startedAt = Date.now();
      await loaded.seed.run(context);
      await recordSeedCompleted(context.connection, {
        tableName: this.options.tableName,
        packageName: loaded.packageName,
        name: loaded.name,
        checksum: loaded.checksum,
        durationMs: Date.now() - startedAt,
      });
    });
  }
}

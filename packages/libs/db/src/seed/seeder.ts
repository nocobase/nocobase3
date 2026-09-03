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
  SeedRunResult,
} from './types.js';

/** Executes pending seed definitions for one database connection. */
export interface Seeder {
  /** Executes every seed that has no matching history record. */
  run(): Promise<SeedRunResult>;
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
    const seedConnection = createSeedContext(connection).connection;

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
        validateAppliedSeedHistory(seeds, history);

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

        return { executed, skipped };
      },
    );
  }

  private async runSeed(
    connection: ReturnType<CreateSeederOptions['database']['connection']>,
    loaded: LoadedSeed,
  ): Promise<void> {
    const mode = loaded.seed.transaction ?? 'auto';
    if (mode === false) {
      const context = createSeedContext(connection);
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
      const context = createSeedContext(trxConnection);
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

function validateAppliedSeedHistory(
  seeds: LoadedSeed[],
  history: SeedHistoryRecord[],
): void {
  const historyByName = new Map(history.map((record) => [record.name, record]));
  for (const seed of seeds) {
    const record = historyByName.get(seed.name);
    if (!record) {
      continue;
    }
    if (record.checksum !== seed.checksum) {
      throw new Error(
        `Executed seed "${record.name}" checksum changed. Package: "${record.packageName}".`,
      );
    }
  }
}

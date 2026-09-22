import type { MigrationConnection } from '../../migration/types.js';
import type { SeedHistoryRecord } from '../types.js';
import {
  ensureTaskHistoryTable,
  readTaskHistoryEntries,
  recordTaskHistoryEntry,
  type TaskLedger,
} from '../../migration/internal/history.js';

export const DEFAULT_SEED_TABLE = '__nocobase_seeds';

/** Seeds keep their own ledger, and it is not batched: they never roll back. */
function seedLedger(tableName: string): TaskLedger {
  return { tableName, batched: false };
}

export async function ensureSeedTable(
  connection: MigrationConnection,
  tableName: string = DEFAULT_SEED_TABLE,
): Promise<void> {
  await ensureTaskHistoryTable(connection, seedLedger(tableName));
}

export async function readSeedHistory(
  connection: MigrationConnection,
  tableName: string = DEFAULT_SEED_TABLE,
): Promise<SeedHistoryRecord[]> {
  return readTaskHistoryEntries(connection, seedLedger(tableName));
}

export async function recordSeedCompleted(
  connection: MigrationConnection,
  options: {
    tableName?: string;
    packageName: string;
    name: string;
    checksum: string;
    durationMs: number;
  },
): Promise<void> {
  await recordTaskHistoryEntry(
    connection,
    seedLedger(options.tableName ?? DEFAULT_SEED_TABLE),
    {
      packageName: options.packageName,
      name: options.name,
      checksum: options.checksum,
      durationMs: options.durationMs,
    },
  );
}

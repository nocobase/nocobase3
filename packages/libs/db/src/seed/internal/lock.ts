import type { MigrationConnection } from '../../migration/types.js';
import {
  withTaskLock,
  type TaskLockOptions,
} from '../../migration/internal/lock.js';

export const DEFAULT_SEED_LOCK_TABLE = '__nocobase_seed_lock';

/**
 * Seeds take the same lock as migrations, with their own table: one
 * implementation so contention behaves and reports identically for both.
 */
export function withSeedLock<T>(
  connection: MigrationConnection,
  options: TaskLockOptions,
  fn: () => Promise<T>,
): Promise<T> {
  return withTaskLock(
    connection,
    {
      label: 'Seed',
      tableName: options.tableName ?? DEFAULT_SEED_LOCK_TABLE,
      acquireTimeoutMs: options.acquireTimeoutMs,
    },
    fn,
  );
}

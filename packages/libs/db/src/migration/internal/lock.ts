import type { Knex } from 'knex';
import type { MigrationConnection } from '../types.js';

export const DEFAULT_MIGRATION_LOCK_TABLE = '__nocobase_migration_lock';

/**
 * How long acquiring waits for a concurrent run to release the lock before it
 * fails. A restarted process releases its lock in well under a second, while a
 * real run can legitimately hold it for much longer, which is what the wait is
 * for: contention between two starts is normally transient, and failing on the
 * first conflict turns it into an error an operator has to interpret.
 */
export const DEFAULT_TASK_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

const LOCK_ROW_ID = 1;
const INITIAL_RETRY_DELAY_MS = 50;
const MAX_RETRY_DELAY_MS = 500;

/**
 * Insert attempts tolerated while the lock table holds no row. An insert that
 * keeps failing with nothing to conflict with is not contention, so the driver
 * error is reported instead of being retried until the timeout.
 */
const MAX_ATTEMPTS_WITHOUT_HOLDER = 3;

const inProcessLocks = new Set<string>();

export interface TaskLockOptions {
  readonly tableName?: string;
  /** Defaults to {@link DEFAULT_TASK_LOCK_ACQUIRE_TIMEOUT_MS}. */
  readonly acquireTimeoutMs?: number;
}

/** A task lock with its messages resolved: `Migration`, `Seed`, and so on. */
export interface TaskLockDescriptor extends TaskLockOptions {
  readonly label: string;
  readonly tableName: string;
}

interface TaskLockRow {
  readonly locked_by?: unknown;
  readonly locked_at?: unknown;
}

export function withMigrationLock<T>(
  connection: MigrationConnection,
  options: TaskLockOptions,
  fn: () => Promise<T>,
): Promise<T> {
  return withTaskLock(
    connection,
    {
      label: 'Migration',
      tableName: options.tableName ?? DEFAULT_MIGRATION_LOCK_TABLE,
      acquireTimeoutMs: options.acquireTimeoutMs,
    },
    fn,
  );
}

export async function withTaskLock<T>(
  connection: MigrationConnection,
  options: TaskLockDescriptor,
  fn: () => Promise<T>,
): Promise<T> {
  const { label, tableName } = options;
  const lockKey = `${connection.name}:${tableName}`;
  if (inProcessLocks.has(lockKey)) {
    throw new Error(
      `${label} lock "${tableName}" is already held for connection "${connection.name}".`,
    );
  }

  inProcessLocks.add(lockKey);
  const owner = createLockOwner();
  let acquired = false;

  try {
    await ensureTaskLockTable(connection, tableName);
    await acquireDatabaseLock(connection, options, owner);
    acquired = true;
    return await fn();
  } finally {
    try {
      if (acquired) {
        await releaseDatabaseLock(connection, tableName, owner);
      }
    } finally {
      inProcessLocks.delete(lockKey);
    }
  }
}

export async function ensureTaskLockTable(
  connection: MigrationConnection,
  tableName: string,
): Promise<void> {
  const knex = await connection.client<Knex>();
  const exists = await knex.schema.hasTable(tableName);
  if (exists) {
    return;
  }

  try {
    await knex.schema.createTable(
      tableName,
      (table: Knex.CreateTableBuilder) => {
        table.integer('id').primary();
        table.string('locked_by', 191).notNullable();
        table.dateTime('locked_at').notNullable();
      },
    );
  } catch (error) {
    if (await knex.schema.hasTable(tableName)) {
      return;
    }
    throw error;
  }
}

async function acquireDatabaseLock(
  connection: MigrationConnection,
  options: TaskLockDescriptor,
  owner: string,
): Promise<void> {
  const { label, tableName } = options;
  const timeoutMs =
    options.acquireTimeoutMs ?? DEFAULT_TASK_LOCK_ACQUIRE_TIMEOUT_MS;
  const knex = await connection.client<Knex>();
  const startedAt = Date.now();
  let delayMs = INITIAL_RETRY_DELAY_MS;
  let attemptsWithoutHolder = 0;
  let holder: TaskLockRow | undefined;
  let lastError: unknown;

  for (;;) {
    try {
      await knex(tableName).insert({
        id: LOCK_ROW_ID,
        locked_by: owner,
        locked_at: new Date(),
      });
      return;
    } catch (error) {
      lastError = error;
    }

    // A conflicting row is the expected reason to be here, but the holder can
    // release it between the failed insert and this read. A missing row is
    // therefore a reason to try again rather than a reason to report the
    // driver's constraint error for what is ordinary contention.
    const current = await readLockRow(knex, tableName);
    const elapsedMs = Date.now() - startedAt;
    if (current) {
      holder = current;
      attemptsWithoutHolder = 0;
      if (elapsedMs >= timeoutMs) {
        throw new Error(lockHeldMessage(label, tableName, holder, elapsedMs), {
          cause: lastError,
        });
      }
    } else {
      attemptsWithoutHolder += 1;
      if (
        attemptsWithoutHolder >= MAX_ATTEMPTS_WITHOUT_HOLDER ||
        elapsedMs >= timeoutMs
      ) {
        throw new Error(
          `${label} lock "${tableName}" could not be acquired, and the lock table holds no row to wait for.`,
          { cause: lastError },
        );
      }
    }

    await sleep(Math.min(delayMs, MAX_RETRY_DELAY_MS, timeoutMs - elapsedMs));
    delayMs *= 2;
  }
}

async function releaseDatabaseLock(
  connection: MigrationConnection,
  tableName: string,
  owner: string,
): Promise<void> {
  const knex = await connection.client<Knex>();
  await knex(tableName)
    .where({
      id: LOCK_ROW_ID,
      locked_by: owner,
    })
    .delete();
}

/**
 * Reads the current holder for the failure message. A read that fails leaves
 * the caller to retry and then report the insert error, so it reports no
 * holder rather than replacing the original failure with its own.
 */
async function readLockRow(
  knex: Knex,
  tableName: string,
): Promise<TaskLockRow | undefined> {
  try {
    return await knex(tableName)
      .where({ id: LOCK_ROW_ID })
      .first<TaskLockRow | undefined>();
  } catch {
    return undefined;
  }
}

function lockHeldMessage(
  label: string,
  tableName: string,
  holder: TaskLockRow | undefined,
  elapsedMs: number,
): string {
  const by =
    typeof holder?.locked_by === 'string' ? ` by "${holder.locked_by}"` : '';
  const since = formatLockTimestamp(holder?.locked_at);
  const waited = `Waited ${(elapsedMs / 1000).toFixed(1)}s for it to be released.`;
  return `${label} lock "${tableName}" is already held${by}${since ? ` since ${since}` : ''}. ${waited} Another ${label.toLowerCase()} run holds it; if the process that held it was killed, delete the row with id ${LOCK_ROW_ID} from "${tableName}" before running it again.`;
}

/** Dialects return the timestamp as a Date, an epoch number, or a string. */
function formatLockTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return undefined;
}

function sleep(durationMs: number): Promise<void> {
  if (durationMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function createLockOwner(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

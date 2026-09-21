import type { Knex } from 'knex';
import type { MigrationConnection } from './types.js';

interface TaskHistory {
  readonly packageName: string;
  readonly name: string;
  readonly checksum: string;
}

interface TaskChecksum extends TaskHistory {
  readonly legacyChecksum?: string;
}

/**
 * How a runner reacts when an executed task's recorded checksum no longer
 * matches its source. `warn` reports the drift and continues; `error` refuses
 * to run.
 */
export type ChecksumMismatchPolicy = 'error' | 'warn';

/** One executed task whose recorded checksum no longer matches its source. */
export interface ChecksumMismatch {
  readonly packageName: string;
  readonly name: string;
  /** The checksum stored in history when the task was executed. */
  readonly recordedChecksum: string;
  /** The checksum of the task as it exists in the current sources. */
  readonly sourceChecksum: string;
}

/**
 * Executed tasks whose recorded checksum no longer matches the loaded source.
 * A record matching the source's pre-manifest hash is not drift: it is
 * upgraded in place by `upgradeTaskChecksums`.
 */
export function collectChecksumMismatches(
  tasks: readonly TaskChecksum[],
  history: readonly TaskHistory[],
): ChecksumMismatch[] {
  const byName = new Map(tasks.map((task) => [task.name, task]));
  return history.flatMap((record) => {
    const task = byName.get(record.name);
    if (!task || task.checksum === record.checksum) return [];
    if (
      task.packageName === record.packageName &&
      task.legacyChecksum === record.checksum
    )
      return [];
    return [
      {
        packageName: record.packageName,
        name: record.name,
        recordedChecksum: record.checksum,
        sourceChecksum: task.checksum,
      },
    ];
  });
}

/** Renders one mismatch for an error message or a warning log line. */
export function describeChecksumMismatch(
  mismatch: ChecksumMismatch,
  kind: 'migration' | 'seed',
): string {
  return `Executed ${kind} "${mismatch.name}" checksum changed. Package: "${mismatch.packageName}". Recorded: ${mismatch.recordedChecksum}. Source: ${mismatch.sourceChecksum}. Run "nocobase app db repair" to realign the history after confirming the change is intentional.`;
}

/** Called under the task lock, after the entire history has passed validation. */
export async function upgradeTaskChecksums(
  connection: Pick<MigrationConnection, 'client'>,
  tableName: string,
  tasks: readonly TaskChecksum[],
  history: readonly TaskHistory[],
): Promise<void> {
  const byName = new Map(tasks.map((task) => [task.name, task]));
  const upgrades = history.flatMap((record) => {
    const task = byName.get(record.name);
    return task &&
      task.packageName === record.packageName &&
      task.checksum !== record.checksum &&
      task.legacyChecksum === record.checksum
      ? [
          {
            packageName: record.packageName,
            name: record.name,
            recordedChecksum: record.checksum,
            sourceChecksum: task.checksum,
          },
        ]
      : [];
  });
  await writeTaskChecksums(connection, tableName, upgrades);
}

/**
 * Rewrites recorded checksums to the values their sources now hash to. Each
 * update is conditioned on the checksum that was read, so a history changed by
 * another process between read and write aborts the whole batch rather than
 * overwriting it.
 */
export async function writeTaskChecksums(
  connection: Pick<MigrationConnection, 'client'>,
  tableName: string,
  updates: readonly ChecksumMismatch[],
): Promise<void> {
  if (!updates.length) return;
  const knex = await connection.client<Knex>();
  await knex.transaction(async (trx) => {
    for (const update of updates) {
      const updated = await trx(tableName)
        .where({
          package_name: update.packageName,
          name: update.name,
          checksum: update.recordedChecksum,
        })
        .update({ checksum: update.sourceChecksum });
      if (updated !== 1)
        throw new Error(
          `Database task history changed during checksum upgrade: ${update.name}.`,
        );
    }
  });
}

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
      ? [{ record, checksum: task.checksum }]
      : [];
  });
  if (!upgrades.length) return;
  const knex = await connection.client<Knex>();
  await knex.transaction(async (trx) => {
    for (const { record, checksum } of upgrades) {
      const updated = await trx(tableName)
        .where({
          package_name: record.packageName,
          name: record.name,
          checksum: record.checksum,
        })
        .update({ checksum });
      if (updated !== 1)
        throw new Error(
          `Database task history changed during checksum upgrade: ${record.name}.`,
        );
    }
  });
}

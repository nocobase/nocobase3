import type { Knex } from 'knex';

import type { Row } from '../query/types.js';
import type { DatabaseConnection } from './connection.js';
import { isUniqueConstraintViolation } from './internal/unique-constraint.js';

export interface UpsertPhysicalRowOptions {
  /** Exact physical table name; connection naming and Collection metadata are not applied. */
  readonly table: string;
  /** Non-null columns backed by a primary key or unique constraint. */
  readonly key: Readonly<Row>;
  /** Raw database values for a new row, excluding key columns. */
  readonly create: Readonly<Row>;
  /** Raw database values to replace on an existing row, excluding key columns. */
  readonly update: Readonly<Row>;
}

/**
 * Upsert internal physical storage without registering a Collection. Values are
 * already encoded for storage; use Repository for Collection-level conversion.
 * The row lock lasts until the owning transaction completes.
 */
export async function upsertPhysicalRow(
  connection: DatabaseConnection,
  options: UpsertPhysicalRowOptions,
): Promise<void> {
  const keys = Object.keys(options.key);
  if (keys.length === 0 || keys.some((key) => options.key[key] == null)) {
    throw new Error(
      'Physical row upsert requires a non-empty, non-null unique key.',
    );
  }
  if (keys.some((key) => key in options.create || key in options.update)) {
    throw new Error('Physical row upsert values must not replace key columns.');
  }
  const execute = async (transaction: Knex.Transaction): Promise<void> => {
    const lock = () =>
      transaction(options.table).where(options.key).select(keys).forUpdate();
    if ((await lock()).length === 0) {
      try {
        // A savepoint keeps databases such as PostgreSQL usable after a
        // concurrent insert wins the unique key race.
        await transaction.transaction(async (savepoint) => {
          await savepoint(options.table).insert({
            ...options.create,
            ...options.key,
          });
        });
        return;
      } catch (error) {
        if (
          !isUniqueConstraintViolation(error) ||
          (await lock()).length === 0
        ) {
          throw error;
        }
      }
    }
    if (Object.keys(options.update).length > 0) {
      await transaction(options.table)
        .where(options.key)
        .update(options.update);
    }
  };
  const client = await connection.client<Knex>();
  if (client.isTransaction) {
    await execute(client as Knex.Transaction);
  } else {
    await client.transaction(execute);
  }
}

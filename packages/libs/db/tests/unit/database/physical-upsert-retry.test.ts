import type { Knex } from 'knex';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../../../src/database/connection.js';
import { upsertPhysicalRow } from '../../../src/database/upsert-physical-row.js';

const options = {
  table: 'jobs',
  key: { id: 'one' },
  create: { value: 'initial' },
  update: { value: 'updated' },
};
const deadlock = () =>
  Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });

function connection(client: object): DatabaseConnection {
  return { client: () => Promise.resolve(client) } as DatabaseConnection;
}

describe('physical upsert transaction retries', () => {
  it.each([
    deadlock(),
    Object.assign(new Error('Deadlock'), { code: '40P01' }),
    Object.assign(new Error('Deadlock'), { number: 1205 }),
    new Error('Wrapped', { cause: deadlock() }),
  ])('starts a fresh owned transaction after a deadlock', async (error) => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    await upsertPhysicalRow(connection({ transaction }), options);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('bounds retries and preserves the final failure', async () => {
    const error = deadlock();
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(
      upsertPhysicalRow(connection({ transaction }), options),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(6);
  });

  it('does not retry unrelated failures or lock wait timeouts', async () => {
    for (const error of [
      new Error('Disconnected'),
      { code: 'ER_LOCK_WAIT_TIMEOUT', errno: 1205 },
    ]) {
      const transaction = vi.fn().mockRejectedValue(error);
      await expect(
        upsertPhysicalRow(connection({ transaction }), options),
      ).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(1);
    }
  });

  it('does not replay any part of a caller-owned transaction', async () => {
    const error = deadlock();
    const forUpdate = vi.fn().mockRejectedValue(error);
    const query = {
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      forUpdate,
    };
    const transaction = vi.fn();
    const client = Object.assign(
      vi.fn(() => query),
      { isTransaction: true, transaction },
    );
    await expect(
      upsertPhysicalRow(connection(client as unknown as Knex), options),
    ).rejects.toBe(error);
    expect(client).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});

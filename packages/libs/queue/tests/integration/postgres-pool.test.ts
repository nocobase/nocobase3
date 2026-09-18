import { expect, it, vi } from 'vitest';
import {
  createBorrowedPostgresPool,
  postgresDeadline,
} from '../../src/backends/postgres-pool.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'rejects borrowing before acquisition when the caller timeout exceeds the budget',
  async () => {
    const { Pool } = await import('pg');
    const owner = new Pool({ connectionTimeoutMillis: 1000 });
    const connect = vi.spyOn(Pool.prototype, 'connect');
    const adapter = createBorrowedPostgresPool(owner);
    try {
      await expect(
        postgresDeadline.run(performance.now() + 50, () =>
          adapter.pool.connect(),
        ),
      ).rejects.toThrow('borrow timeout');
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
      await adapter.close();
      await owner.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'retires leases that ended before release without hanging or closing the owner',
  async () => {
    const { Pool } = await import('pg');
    const config = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      connectionTimeoutMillis: 100,
    };
    const owner = new Pool(config);
    const admin = new Pool(config);
    const adapter = createBorrowedPostgresPool(owner);
    try {
      const lease = await adapter.pool.connect();
      lease.on('error', () => {});
      const ended = new Promise<void>((resolve) => lease.on('end', resolve));
      const pid = await lease.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      await admin.query('SELECT pg_terminate_backend($1)', [pid.rows[0]!.pid]);
      await ended;
      lease.release();
      let closed = false;
      void adapter.close().then(() => {
        closed = true;
      });
      await expect.poll(() => closed, { timeout: 1000 }).toBe(true);
      expect((await owner.query('SELECT 1 AS value')).rows).toEqual([
        { value: 1 },
      ]);
    } finally {
      await owner.end();
      await admin.end();
    }
  },
);

it('rejects nonstandard Pool checkout before invoking it', async () => {
  const { Pool } = await import('pg');
  const { isBorrowedPostgresPool } =
    await import('../../src/backends/postgres-pool.js');
  const owner = new Pool({ connectionTimeoutMillis: 100 });
  const overridden = vi.spyOn(owner, 'connect');
  try {
    expect(() => isBorrowedPostgresPool(owner)).toThrow('unmodified standard');
    expect(overridden).not.toHaveBeenCalled();
  } finally {
    overridden.mockRestore();
    await owner.end();
  }
});

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'bounds saturated caller Pool acquisition and leaves no detached waiter',
  async () => {
    const { Pool } = await import('pg');
    const owner = new Pool({
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      max: 1,
      connectionTimeoutMillis: 100,
    });
    const held = await owner.connect();
    const adapter = createBorrowedPostgresPool(owner);
    try {
      const start = performance.now();
      await expect(
        postgresDeadline.run(start + 500, () => adapter.pool.query('SELECT 1')),
      ).rejects.toThrow('timeout');
      expect(performance.now() - start).toBeLessThan(800);
      expect(owner.waitingCount).toBe(0);
      await adapter.close();
      expect((await held.query('SELECT 1 AS value')).rows).toEqual([
        { value: 1 },
      ]);
    } finally {
      held.release();
      await adapter.close();
      await owner.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'cancels slow lease SQL at the scoped deadline and preserves the owner',
  async () => {
    const { Pool } = await import('pg');
    const config = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      connectionTimeoutMillis: 100,
    };
    const owner = new Pool(config);
    const admin = new Pool(config);
    const adapter = createBorrowedPostgresPool(owner);
    try {
      const lease = await adapter.pool.connect();
      const result = await lease.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const pid = result.rows[0]!.pid;
      const start = performance.now();
      await expect(
        postgresDeadline.run(start + 150, () =>
          lease.query('SELECT pg_sleep(5)'),
        ),
      ).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(1000);
      await adapter.close();
      await expect
        .poll(
          async () =>
            (
              await admin.query(
                'SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid=$1',
                [pid],
              )
            ).rows,
        )
        .toEqual([{ count: 0 }]);
      expect((await owner.query('SELECT 1 AS value')).rows).toEqual([
        { value: 1 },
      ]);
    } finally {
      await adapter.close();
      await owner.end();
      await admin.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'terminates a blackholed borrowed lease without closing the owner',
  async () => {
    const { Pool } = await import('pg');
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(Number(process.env.QUEUE_TEST_PG_PORT));
    const owner = new Pool({
      host: '127.0.0.1',
      port: proxy.port,
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      connectionTimeoutMillis: 100,
    });
    const adapter = createBorrowedPostgresPool(owner);
    try {
      const lease = await adapter.pool.connect();
      await lease.query('SELECT 1');
      proxy.blackhole(true);
      await expect(
        postgresDeadline.run(performance.now() + 150, () =>
          lease.query('SELECT 2'),
        ),
      ).rejects.toThrow();
      let closed = false;
      void adapter.close().then(() => {
        closed = true;
      });
      await expect.poll(() => closed, { timeout: 1000 }).toBe(true);
      await expect.poll(() => proxy.sockets.size, { timeout: 1000 }).toBe(0);
      proxy.blackhole(false);
      expect((await owner.query('SELECT 3 AS value')).rows).toEqual([
        { value: 3 },
      ]);
    } finally {
      await proxy.close();
      await adapter.close();
      await owner.end();
    }
  },
);

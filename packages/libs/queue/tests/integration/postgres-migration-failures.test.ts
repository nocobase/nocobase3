import { expect, it } from 'vitest';
import { MIGRATION_ADVISORY_LOCK_KEY } from 'bullmq';
import { createQueueService } from '../../src/service.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'cancels a migration blocked on the official advisory lock before creating queues',
  async () => {
    const { Pool } = await import('pg');
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
    };
    const admin = new Pool(connection);
    const lock = await admin.connect();
    const schema = 'blocked_migration';
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-blocked`,
      queueBackend: 'postgres',
      setupTimeoutMs: 200,
      connection: { ...connection, schema },
    });
    let calls = 0;
    service.consumer('jobs').consume(async () => {
      calls++;
    });
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
        MIGRATION_ADVISORY_LOCK_KEY,
        schema,
      ]);
      const start = performance.now();
      await expect(service.setup()).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(3000);
      await expect
        .poll(
          async () => {
            const result = await admin.query(
              "SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event = 'advisory'",
            );
            return result.rows;
          },
          { timeout: 2000 },
        )
        .toEqual([{ count: 0 }]);
      await lock.query('ROLLBACK');
      expect(
        (
          await admin.query('SELECT to_regclass($1)::text AS relation', [
            `${schema}.job`,
          ])
        ).rows,
      ).toEqual([{ relation: null }]);
      expect(calls).toBe(0);
    } finally {
      await service.shutdown().catch(() => {});
      await lock.query('ROLLBACK');
      lock.release();
      await admin.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'cancels borrowed migration lock waits while preserving the caller Pool',
  async () => {
    const { Pool } = await import('pg');
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
    };
    const owner = new Pool({
      ...connection,
      options: '-c search_path=bullmq',
      connectionTimeoutMillis: 50,
    });
    const admin = new Pool(connection);
    const lock = await admin.connect();
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-borrowed-lock`,
      queueBackend: 'postgres',
      connection: owner,
      setupTimeoutMs: 200,
    });
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
        MIGRATION_ADVISORY_LOCK_KEY,
        'bullmq',
      ]);
      const start = performance.now();
      await expect(service.setup()).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(3000);
      await expect
        .poll(
          async () =>
            (
              await admin.query(
                "SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event = 'advisory'",
              )
            ).rows,
          { timeout: 2000 },
        )
        .toEqual([{ count: 0 }]);
      expect(owner.waitingCount).toBe(0);
      expect(owner.totalCount).toBe(0);
      expect(owner.listenerCount('error')).toBe(0);
      expect((await owner.query('SELECT 1 AS value')).rows).toEqual([
        { value: 1 },
      ]);
    } finally {
      await service.shutdown().catch(() => {});
      await lock.query('ROLLBACK');
      lock.release();
      await owner.end();
      await admin.end();
    }
  },
);

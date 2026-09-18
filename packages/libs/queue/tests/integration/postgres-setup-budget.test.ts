import { expect, it } from 'vitest';
import { MIGRATION_ADVISORY_LOCK_KEY } from 'bullmq';
import { Pool } from 'pg';
import { createQueueService } from '../../src/service.js';

it('rejects queue checkout when migrations consumed the caller Pool borrow budget', async () => {
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
    connectionTimeoutMillis: 800,
  });
  const admin = new Pool(connection);
  const lock = await admin.connect();
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-remaining-budget`,
    queueBackend: 'postgres',
    connection: owner,
    setupTimeoutMs: 1500,
  });
  service.producer('jobs');
  let unlocking: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
      MIGRATION_ADVISORY_LOCK_KEY,
      'bullmq',
    ]);
    const started = performance.now();
    timer = setTimeout(() => {
      unlocking = lock.query('ROLLBACK');
    }, 900);
    await expect(service.setup()).rejects.toThrow(
      'borrow timeout exceeds remaining budget',
    );
    expect(performance.now() - started).toBeLessThan(2500);
    await expect.poll(() => owner.waitingCount).toBe(0);
    await service.shutdown();
    expect((await owner.query('SELECT 1 AS value')).rows).toEqual([
      { value: 1 },
    ]);
  } finally {
    clearTimeout(timer);
    await unlocking;
    await lock.query('ROLLBACK');
    await service.shutdown().catch(() => {});
    lock.release();
    await owner.end();
    await admin.end();
  }
});

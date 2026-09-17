import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'migrates and consumes with owned PostgreSQL PoolConfig',
  async () => {
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-postgres-service`,
      queueBackend: 'postgres',
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.QUEUE_TEST_PG_PORT),
        user: 'postgres',
        password: 'queue-test-only',
        database: 'postgres',
        connectionTimeoutMillis: 1000,
      },
    });
    const received: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    try {
      await service.setup();
      await service
        .producer('jobs')
        .publish('event', { nul: '\u0000', surrogate: '\ud800' });
      await expect
        .poll(() => received, { timeout: 5000 })
        .toEqual([{ nul: '\u0000', surrogate: '\ud800' }]);
    } finally {
      await service.shutdown();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'terminates concurrent owned publications under a transport blackhole',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(Number(process.env.QUEUE_TEST_PG_PORT));
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-blackhole`,
      queueBackend: 'postgres',
      connection: {
        host: '127.0.0.1',
        port: proxy.port,
        user: 'postgres',
        password: 'queue-test-only',
        database: 'postgres',
        connectionTimeoutMillis: 1000,
      },
    });
    const producer = service.producer('blocked');
    try {
      await service.setup();
      await Promise.all([
        producer.publish('warm-one', {}),
        producer.publish('warm-two', {}),
        producer.publishMany([{ channel: 'warm-three', message: {} }]),
      ]);
      expect(proxy.sockets.size).toBeGreaterThan(0);
      proxy.blackhole(true);
      const start = performance.now();
      const results = await Promise.allSettled([
        producer.publish('one', {}),
        producer.publish('two', {}),
        producer.publishMany([{ channel: 'three', message: {} }]),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        'rejected',
        'rejected',
        'rejected',
      ]);
      expect(performance.now() - start).toBeLessThan(14000);
      await expect.poll(() => proxy.sockets.size, { timeout: 2000 }).toBe(0);
      await expect(producer.publish('later', {})).rejects.toThrow();
      expect(proxy.sockets.size).toBe(0);
      await service.shutdown();
    } finally {
      await service.shutdown().catch(() => {});
      await proxy.close();
    }
  },
  20000,
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'keeps a PostgreSQL producer usable after a completed SQL error',
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
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-sql-error`,
      queueBackend: 'postgres',
      connection: { ...connection, schema: 'sql_error_fixture' },
    });
    const producer = service.producer('jobs');
    try {
      await service.setup();
      await admin.query(
        "CREATE FUNCTION sql_error_fixture.reject_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Intentional fixture rejection' USING ERRCODE = '23514'; END $$",
      );
      await admin.query(
        'CREATE TRIGGER reject_job BEFORE INSERT ON sql_error_fixture.job FOR EACH ROW EXECUTE FUNCTION sql_error_fixture.reject_job()',
      );
      await expect(producer.publish('rejected', {})).rejects.toThrow(
        'Intentional fixture rejection',
      );
      await admin.query('DROP TRIGGER reject_job ON sql_error_fixture.job');
      const receipt = await producer.publish('accepted', {});
      const result = await admin.query(
        'SELECT count(*)::int AS count FROM sql_error_fixture.job WHERE id = $1',
        [receipt.jobId],
      );
      expect(result.rows).toEqual([{ count: 1 }]);
    } finally {
      await service.shutdown();
      await admin.end();
    }
  },
);

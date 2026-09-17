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

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'closes owned PostgreSQL sockets after an initial handshake deadline',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(Number(process.env.QUEUE_TEST_PG_PORT));
    proxy.blackhole(true);
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-handshake`,
      queueBackend: 'postgres',
      setupTimeoutMs: 100,
      connection: {
        host: '127.0.0.1',
        port: proxy.port,
        user: 'postgres',
        password: 'queue-test-only',
        database: 'postgres',
        connectionTimeoutMillis: 1000,
      },
    });
    service.producer('jobs');
    try {
      const start = performance.now();
      await expect(service.setup()).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(2500);
      await expect.poll(() => proxy.sockets.size, { timeout: 1000 }).toBe(0);
    } finally {
      await service.shutdown().catch(() => {});
      await proxy.close();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'borrows a caller Pool without changing or closing it',
  async () => {
    const { Pool } = await import('pg');
    const owner = new Pool({
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      options: '-c search_path=bullmq',
      connectionTimeoutMillis: 100,
      max: 8,
    });
    const before = { ...owner.options };
    const errorListener = (): void => {};
    owner.on('error', errorListener);
    const listeners = owner.listeners('error');
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-borrowed`,
      queueBackend: 'postgres',
      connection: owner,
    });
    const received: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    try {
      await service.setup();
      await service.producer('jobs').publish('event', 42);
      await expect.poll(() => received, { timeout: 5000 }).toEqual([42]);
      await service.shutdown();
      expect(owner.options).toEqual(before);
      expect(owner.listeners('error')).toEqual(listeners);
      expect(owner.totalCount).toBe(0);
      expect(owner.waitingCount).toBe(0);
      expect((await owner.query('SELECT 1 AS value')).rows).toEqual([
        { value: 1 },
      ]);
    } finally {
      await service.shutdown().catch(() => {});
      await owner.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'rejects a borrowed Pool with a shared search path before migration',
  async () => {
    const { Pool } = await import('pg');
    const owner = new Pool({
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      options: '-c search_path=public,bullmq',
      connectionTimeoutMillis: 100,
    });
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-bad-path`,
      queueBackend: 'postgres',
      connection: owner,
    });
    try {
      await expect(service.setup()).rejects.toThrow('dedicated search_path');
      expect(owner.totalCount).toBe(0);
      expect(owner.listenerCount('error')).toBe(0);
      expect(
        (await owner.query("SELECT current_setting('search_path') AS path"))
          .rows,
      ).toEqual([{ path: 'public,bullmq' }]);
    } finally {
      await service.shutdown().catch(() => {});
      await owner.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'preserves session options while pinning a custom schema',
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
      namespace: `${process.env.QUEUE_TEST_RUN}-options`,
      queueBackend: 'postgres',
      connection: {
        ...connection,
        schema: 'session_fixture',
        options: '-c timezone=UTC -c search_path=public',
        application_name: 'queue-session-fixture',
      },
    });
    try {
      await service.setup();
      await admin.query(
        "CREATE FUNCTION session_fixture.assert_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('TimeZone') <> 'UTC' OR current_schema() <> 'session_fixture' OR current_setting('application_name') <> 'queue-session-fixture' THEN RAISE EXCEPTION 'Unexpected producer session settings'; END IF; RETURN NEW; END $$",
      );
      await admin.query(
        'CREATE TRIGGER assert_session BEFORE INSERT ON session_fixture.job FOR EACH ROW EXECUTE FUNCTION session_fixture.assert_session()',
      );
      const result = await service.producer('jobs').publish('event', {});
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS count FROM session_fixture.job WHERE id=$1',
            [result.jobId],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await service.shutdown();
      await admin.end();
    }
  },
);

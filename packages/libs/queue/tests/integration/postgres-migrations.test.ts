import { expect, it } from 'vitest';
import { selectedBackend } from '../helpers/backend-harness.js';
import { createQueueService } from '../../src/service.js';

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'migrates default and unused override targets without creating business queues',
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
      namespace: `${process.env.QUEUE_TEST_RUN}-targets`,
      queueBackend: 'postgres',
      connection: { ...connection, schema: 'default_target' },
      queues: {
        __defaults__: {
          connection: { ...connection, schema: 'override_target' },
        },
      },
    });
    try {
      await service.setup();
      for (const schema of ['default_target', 'override_target']) {
        const result = await admin.query(
          'SELECT to_regclass($1)::text AS relation',
          [`${schema}.job`],
        );
        expect(result.rows).toEqual([{ relation: `${schema}.job` }]);
        const jobs = await admin.query(
          `SELECT count(*)::int AS count FROM ${schema}.job`,
        );
        expect(jobs.rows).toEqual([{ count: 0 }]);
      }
    } finally {
      await service.shutdown();
      await admin.end();
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'reuses migrated targets for late queues without rerunning DDL',
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
      namespace: `${process.env.QUEUE_TEST_RUN}-late`,
      queueBackend: 'postgres',
      connection: { ...connection, schema: 'late_target' },
    });
    const received: unknown[] = [];
    let trigger = false;
    try {
      await service.setup();
      await admin.query(
        "CREATE FUNCTION public.reject_late_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Unexpected DDL after setup'; END $$",
      );
      await admin.query(
        "CREATE EVENT TRIGGER reject_late_ddl ON ddl_command_start WHEN TAG IN ('CREATE SCHEMA', 'ALTER TABLE', 'CREATE FUNCTION') EXECUTE FUNCTION public.reject_late_ddl()",
      );
      trigger = true;
      service.consumer('late').consume(async (_channel, message) => {
        received.push(message);
      });
      await service.producer('late').publish('event', 42);
      await expect.poll(() => received, { timeout: 5000 }).toEqual([42]);
    } finally {
      try {
        if (trigger) await admin.query('DROP EVENT TRIGGER reject_late_ddl');
      } finally {
        await service.shutdown();
        await admin.end();
      }
    }
  },
);

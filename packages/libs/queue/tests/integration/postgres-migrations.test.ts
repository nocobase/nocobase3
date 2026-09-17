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

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'merges equivalent string and object migration targets',
  async () => {
    const { Pool } = await import('pg');
    const port = Number(process.env.QUEUE_TEST_PG_PORT);
    const connection = {
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
    };
    const admin = new Pool(connection);
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-merged`,
      queueBackend: 'postgres',
      connection,
      queues: {
        alias: {
          connection: `postgresql://postgres:queue-test-only@127.0.0.1:${port}/postgres`,
        },
      },
    });
    let trigger = false;
    try {
      await admin.query('CREATE TABLE public.migration_calls (tag text)');
      await admin.query(
        'CREATE FUNCTION public.count_migration_calls() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.migration_calls VALUES (TG_TAG); END $$',
      );
      await admin.query(
        "CREATE EVENT TRIGGER count_migration_calls ON ddl_command_end WHEN TAG IN ('CREATE SCHEMA') EXECUTE FUNCTION public.count_migration_calls()",
      );
      trigger = true;
      await service.setup();
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS count FROM public.migration_calls',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      try {
        if (trigger)
          await admin.query('DROP EVENT TRIGGER count_migration_calls');
      } finally {
        await service.shutdown();
        await admin.end();
      }
    }
  },
);

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'checks access for each credential even when the migration target is already ready',
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
      namespace: `${process.env.QUEUE_TEST_RUN}-restricted`,
      queueBackend: 'postgres',
      connection: { ...connection, schema: 'private_target' },
      queues: {
        denied: {
          connection: {
            ...connection,
            user: 'queue_restricted',
            password: 'restricted-test-only',
            schema: 'private_target',
          },
        },
      },
    });
    try {
      await admin.query(
        "CREATE ROLE queue_restricted LOGIN PASSWORD 'restricted-test-only'",
      );
      await expect(service.setup()).rejects.toThrow();
    } finally {
      await service.shutdown().catch(() => {});
      await admin.end();
    }
  },
);

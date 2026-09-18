import { randomUUID } from 'node:crypto';
import { BULLMQ_MAJOR_VERSION, SchemaVersionMismatchError } from 'bullmq';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import type { QueueService } from '../../src/service.js';

const connection = {
  host: '127.0.0.1',
  port: Number(process.env.QUEUE_TEST_PG_PORT),
  user: 'postgres',
  password: 'queue-test-only',
};

/** Every case owns a database, including its database-wide event triggers. */
async function fixture() {
  if (
    !['postgres', 'postgres13'].includes(
      process.env.QUEUE_TEST_BACKEND ?? '',
    ) ||
    !process.env.QUEUE_TEST_RUN ||
    !Number.isInteger(connection.port)
  ) {
    throw new Error(
      'Run migration acceptance through the isolated queue runner',
    );
  }
  const database = `migration_${randomUUID().replaceAll('-', '')}`;
  const control = new Pool({ ...connection, database: 'postgres' });
  await control.query(`CREATE DATABASE ${database}`);
  const admin = new Pool({ ...connection, database });
  const services: QueueService[] = [];
  return {
    database,
    control,
    admin,
    service(setupTimeoutMs = 2000, user = connection.user) {
      const service = createQueueService({
        namespace: database,
        queueBackend: 'postgres',
        setupTimeoutMs,
        connection: {
          ...connection,
          database,
          user,
          schema: 'acceptance',
          application_name: database,
        },
      });
      services.push(service);
      return service;
    },
    async close() {
      try {
        // Rejection is expected for a failed setup; physical retirement is
        // asserted independently before this best-effort final cleanup.
        await Promise.allSettled(services.map((service) => service.shutdown()));
      } finally {
        try {
          await admin.end();
        } finally {
          try {
            // FORCE is only failure-path hygiene, never the retirement oracle.
            await control.query(`DROP DATABASE ${database} WITH (FORCE)`);
          } finally {
            await control.end();
          }
        }
      }
    },
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function errors(error: unknown): unknown[] {
  if (!(error instanceof Error)) return [error];
  return [
    error,
    ...(error instanceof AggregateError ? error.errors.flatMap(errors) : []),
    ...(error.cause === undefined ? [] : errors(error.cause)),
  ];
}

async function rejected(setup: Promise<void>): Promise<unknown> {
  try {
    await setup;
  } catch (error) {
    return error;
  }
  throw new Error('Expected migration setup to reject');
}

async function retired(test: Fixture): Promise<void> {
  // The admin session is separate from all production pools. A missing session
  // also proves no idle transaction, active DDL, LISTEN or advisory lock remains.
  await expect
    .poll(
      async () =>
        (
          await test.admin.query(
            'SELECT pid, state, wait_event, query FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [test.database],
          )
        ).rows,
      { timeout: 2000 },
    )
    .toEqual([]);
}

async function absent(test: Fixture): Promise<void> {
  expect(
    (
      await test.admin.query(
        "SELECT to_regnamespace('acceptance')::text AS schema, to_regclass('acceptance.migration')::text AS ledger, to_regclass('acceptance.job')::text AS jobs",
      )
    ).rows,
  ).toEqual([{ schema: null, ledger: null, jobs: null }]);
}

function admission(service: QueueService) {
  const calls: unknown[] = [];
  service.consumer('jobs').consume(async (_channel, message) => {
    calls.push(message);
  });
  const producer = service.producer('jobs');
  return async () => {
    await expect(
      producer.publish('event', 'must-not-be-admitted'),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  };
}

it('preserves fresh CREATE permission denial without queues, fallback or leaked sessions', async () => {
  const test = await fixture();
  const role = `restricted_${randomUUID().replaceAll('-', '')}`;
  try {
    await test.control.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'queue-test-only'`,
    );
    await test.admin.query(
      `REVOKE CREATE ON DATABASE ${test.database} FROM PUBLIC`,
    );
    expect(
      (
        await test.admin.query(
          "SELECT has_database_privilege($1, current_database(), 'CREATE') AS allowed",
          [role],
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
    await absent(test);
    const service = test.service(2000, role);
    const checkAdmission = admission(service);
    const failure = errors(await rejected(service.setup()));
    expect(failure).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: '42501',
          message: `permission denied for database ${test.database}`,
        }),
      ]),
    );
    await checkAdmission();
    await retired(test);
    await absent(test);
  } finally {
    try {
      await test.close();
    } finally {
      const cleanup = new Pool({ ...connection, database: 'postgres' });
      try {
        await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
      } finally {
        await cleanup.end();
      }
    }
  }
});

it('rejects a newer-major ledger without downgrading or changing existing migrations', async () => {
  const test = await fixture();
  try {
    // Seed the real official schema through the same production service path.
    const seed = test.service();
    await seed.setup();
    await seed.shutdown();
    await retired(test);
    await test.admin.query(
      `INSERT INTO acceptance.migration (version, name, min_client_version)
       SELECT MAX(version) + 1, 'future-client-fixture', $1 FROM acceptance.migration`,
      [BULLMQ_MAJOR_VERSION + 1],
    );
    const ledger = async () =>
      (
        await test.admin.query(
          'SELECT version, name, min_client_version, applied_at::text FROM acceptance.migration ORDER BY version',
        )
      ).rows;
    const before = await ledger();
    expect(before.length).toBeGreaterThan(1);
    const service = test.service();
    const checkAdmission = admission(service);
    const failure = errors(await rejected(service.setup()));
    const original = failure.find(
      (error) => error instanceof SchemaVersionMismatchError,
    );
    expect(original).toMatchObject({
      minimumClientVersion: BULLMQ_MAJOR_VERSION + 1,
      clientVersion: BULLMQ_MAJOR_VERSION,
    });
    await checkAdmission();
    await retired(test);
    expect(await ledger()).toEqual(before);
    expect(
      (
        await test.admin.query(
          'SELECT count(*)::int AS count FROM acceptance.job',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await test.close();
  }
});

it.each([
  { name: 'one slow DDL statement', sleep: 4, budget: 800, completed: 0 },
  {
    name: 'cumulative individually sub-budget DDL',
    sleep: 0.35,
    budget: 900,
    completed: 2,
  },
])(
  'cancels $name and rolls back the complete fresh migration',
  async ({ sleep, budget, completed }) => {
    const test = await fixture();
    try {
      // Sequence advancement survives rollback, unlike a transactional audit
      // table. Separate entered/finished counters prove cancellation inside DDL.
      await test.admin.query(
        'CREATE SEQUENCE public.ddl_entered; CREATE SEQUENCE public.ddl_finished',
      );
      await test.admin.query(`
      CREATE FUNCTION public.delay_migration() RETURNS event_trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('application_name') = '${test.database}' THEN
          PERFORM nextval('public.ddl_entered');
          PERFORM pg_sleep(${sleep});
          PERFORM nextval('public.ddl_finished');
        END IF;
      END $$
    `);
      await test.admin.query(`
      CREATE EVENT TRIGGER delay_migration ON ddl_command_start
      WHEN TAG IN ('CREATE SCHEMA', 'CREATE TABLE', 'ALTER TABLE')
      EXECUTE FUNCTION public.delay_migration()
    `);
      const service = test.service(budget);
      const checkAdmission = admission(service);
      const started = performance.now();
      // Attach rejection handling before polling so the deadline cannot produce
      // an unhandled rejection while the independent observer is querying.
      const outcome = rejected(service.setup());
      await expect
        .poll(
          async () =>
            (
              await test.admin.query(
                "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND application_name = $1 AND state = 'active' AND wait_event = 'PgSleep' AND query LIKE '%CREATE SCHEMA%'",
                [test.database],
              )
            ).rows,
          { timeout: 600, interval: 10 },
        )
        .toEqual([{ count: 1 }]);
      const failure = errors(await outcome);
      expect(
        failure.some(
          (error) =>
            error instanceof Error &&
            /deadline|timeout|canceling statement/i.test(error.message),
        ),
      ).toBe(true);
      expect(performance.now() - started).toBeLessThan(budget + 1500);
      await checkAdmission();
      await retired(test);
      await absent(test);
      const progress = async () =>
        (
          await test.admin.query(
            'SELECT (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.ddl_entered)::int AS entered, (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.ddl_finished)::int AS finished',
          )
        ).rows;
      expect(await progress()).toEqual([
        { entered: completed + 1, finished: completed },
      ]);
      // Remove the database-wide trigger before retrying. Fresh setup must really
      // migrate, not reuse a falsely cached success from the cancelled attempt.
      await test.admin.query('DROP EVENT TRIGGER delay_migration');
      const recovered = test.service();
      await recovered.setup();
      await recovered.shutdown();
      await retired(test);
      expect(
        (
          await test.admin.query(
            'SELECT count(*)::int AS count FROM acceptance.migration',
          )
        ).rows[0]?.count,
      ).toBeGreaterThan(0);
      expect(await progress()).toEqual([
        { entered: completed + 1, finished: completed },
      ]);
    } finally {
      try {
        await test.admin.query('DROP EVENT TRIGGER IF EXISTS delay_migration');
        await test.admin.query(
          'DROP FUNCTION IF EXISTS public.delay_migration()',
        );
        await test.admin.query(
          'DROP SEQUENCE IF EXISTS public.ddl_entered, public.ddl_finished',
        );
        expect(
          (
            await test.admin.query(
              "SELECT evtname FROM pg_event_trigger WHERE evtname = 'delay_migration'",
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await test.close();
      }
    }
  },
);

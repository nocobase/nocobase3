import type { Knex } from 'knex';
import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010000_queue_create_tables',
  shouldRun({ configuration }) {
    return configuration?.some((entry) => entry.driver === 'database') ?? false;
  },
  async up({ connection, parameters }) {
    const jobsTable = parameters?.jobsTable;
    const schedulesTable = parameters?.schedulesTable;
    if (!jobsTable || !schedulesTable)
      throw new Error('Queue migration requires physical table names.');
    // Physical schema snapshot from @boringnode/queue 0.7.1 QueueSchemaService.
    // Keep this migration self-contained when the upstream dependency changes.
    const client = await connection.client<Knex>();
    await client.schema.createTable(jobsTable, (table) => {
      table.string('id', 255).notNullable();
      table.string('queue', 255).notNullable();
      table
        .enu('status', ['pending', 'active', 'delayed', 'completed', 'failed'])
        .notNullable();
      table.text('data').notNullable();
      table.bigint('score').unsigned().nullable();
      table.string('worker_id', 255).nullable();
      table.bigint('acquired_at').unsigned().nullable();
      table.bigint('execute_at').unsigned().nullable();
      table.bigint('finished_at').unsigned().nullable();
      table.text('error').nullable();
      table.string('dedup_id', 510).nullable();
      table.bigint('dedup_at').unsigned().nullable();
      table.bigint('dedup_ttl').unsigned().nullable();
      table.primary(['id', 'queue']);
      table.index(['queue', 'status', 'score']);
      table.index(['queue', 'status', 'execute_at']);
      table.index(['queue', 'status', 'finished_at']);
      table.index(['queue', 'dedup_id']);
    });
    const knexClient = client.client as { config: Knex.Config };
    if (
      ['pg', 'better-sqlite3', 'sqlite3'].includes(
        String(knexClient.config.client),
      )
    ) {
      await client.raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ?? ("queue", "dedup_id") WHERE "dedup_id" IS NOT NULL AND "status" IN ('pending', 'delayed')`,
        [`${jobsTable}_dedup_active_uidx`, jobsTable],
      );
    }
    await client.schema.createTable(schedulesTable, (table) => {
      table.string('id', 255).primary();
      table.string('status', 50).notNullable().defaultTo('active');
      table.string('name', 255).notNullable();
      table.text('payload').notNullable();
      table.string('cron_expression', 255).nullable();
      table.bigint('every_ms').unsigned().nullable();
      table.string('timezone', 100).notNullable().defaultTo('UTC');
      table.timestamp('from_date').nullable();
      table.timestamp('to_date').nullable();
      table.integer('run_limit').unsigned().nullable();
      table.integer('run_count').unsigned().notNullable().defaultTo(0);
      table.timestamp('next_run_at').nullable();
      table.timestamp('last_run_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(client.fn.now());
      table.index(['status', 'next_run_at']);
    });
  },
  async down({ connection, parameters }) {
    const jobsTable = parameters?.jobsTable;
    const schedulesTable = parameters?.schedulesTable;
    if (!jobsTable || !schedulesTable)
      throw new Error('Queue migration requires physical table names.');
    const client = await connection.client<Knex>();
    await client.schema.dropTableIfExists(schedulesTable);
    await client.schema.dropTableIfExists(jobsTable);
  },
});
export default migration;

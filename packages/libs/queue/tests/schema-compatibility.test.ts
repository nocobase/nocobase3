import { QueueSchemaService } from '@boringnode/queue';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';

import { queueMigrationSource } from '../src/database/index.js';

it('keeps the queue migration identical to the upstream internal table schema', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const connection = await database.connect();
    const client = await connection.client<Knex>();
    const schema = new QueueSchemaService(client);
    const snapshot = async () => {
      const rows = await client('sqlite_master')
        .select('type', 'name', 'tbl_name', 'sql')
        .whereIn('tbl_name', ['queue_jobs', 'queue_schedules'])
        .orderBy('name');
      return rows;
    };
    await schema.createJobsTable('queue_jobs');
    await schema.createSchedulesTable('queue_schedules');
    const upstream = await snapshot();
    await schema.dropSchedulesTable('queue_schedules');
    await schema.dropJobsTable('queue_jobs');
    const migrator = database.createMigrator({
      sources: [
        {
          ...queueMigrationSource,
          parameters: {
            jobsTable: 'queue_jobs',
            schedulesTable: 'queue_schedules',
          },
          configuration: [{ driver: 'database' }],
        },
      ],
    });
    await migrator.latest();
    expect(await snapshot()).toEqual(upstream);
    expect((await migrator.latest()).executed).toEqual([]);
    await migrator.rollback();
    expect(await snapshot()).toEqual([]);
  } finally {
    await database.destroy();
  }
});

// @vitest-environment node
import path from 'node:path';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';

it('creates the quotation review tasks with their claim columns and rolls back', async () => {
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      connection: 'main',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
      packageName: 'quotation-review-test',
    });
    await migrator.upTo('202609300002_create_quotation_review_tasks');
    const connection = database.connection('main');
    const client = await connection.client<Knex>();
    expect(await client('quotation_review_tasks').columnInfo()).toMatchObject({
      run_id: { nullable: false },
      quotation_id: { nullable: false },
      total_cents: { nullable: false },
      created_at: { nullable: false },
      submitted_at: { nullable: true },
      reviewer_id: { nullable: true },
    });
    expect(
      await connection.collectionMetadata.get('quotationReviewTasks'),
    ).toBeDefined();

    const tasks = database.repository('quotationReviewTasks');
    await tasks.createOne({
      values: {
        runId: 'run-1',
        quotationId: 'Q-100',
        totalCents: 50000,
        route: 'standard',
        status: 'pending',
        createdAt: new Date(),
      },
    });
    await tasks.updateOne({
      filter: { runId: 'run-1' },
      values: { status: 'submitting', reviewerId: 'reviewer-1' },
    });
    expect(await tasks.findOne({ filter: { runId: 'run-1' } })).toMatchObject({
      status: 'submitting',
      reviewerId: 'reviewer-1',
    });
    await expect(
      tasks.createOne({
        values: {
          runId: 'run-1',
          quotationId: 'Q-200',
          totalCents: 100000,
          route: 'manual-follow-up',
          status: 'pending',
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await migrator.upTo('202610020001_quotation_review_resume_request');
    expect(await client('quotation_review_tasks').columnInfo()).toMatchObject({
      resume_request_id: { nullable: true },
    });
    await database.repository('quotationReviewTasks').updateOne({
      filter: { runId: 'run-1' },
      values: { resumeRequestId: '12345' },
    });
    expect(
      await database.repository('quotationReviewTasks').findOne({
        filter: { runId: 'run-1' },
      }),
    ).toMatchObject({ resumeRequestId: '12345', reviewerId: 'reviewer-1' });
    await migrator.rollback();
    expect(
      await client('quotation_review_tasks').columnInfo(),
    ).not.toHaveProperty('resume_request_id');
    expect(
      await database.repository('quotationReviewTasks').findOne({
        filter: { runId: 'run-1' },
      }),
    ).toMatchObject({ reviewerId: 'reviewer-1' });
    await migrator.rollback();
    expect(await client.schema.hasTable('quotation_review_tasks')).toBe(false);
    expect(
      await connection.collectionMetadata.get('quotationReviewTasks'),
    ).toBeUndefined();
  } finally {
    await database.destroy();
  }
});

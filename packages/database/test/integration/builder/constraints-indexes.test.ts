import { describe, expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  expectUniqueViolation,
  listIndexes,
} from '../helpers.js';

describeIntegrationDatabases('constraints and indexes', (context) => {
  it('creates primary, unique, and regular indexes with real DDL', async () => {
    const compositeUniqueName = context.identifier('job_composite_unique');
    const statusIndexName = context.identifier('idx_jobs_status');

    await context.builder.createCollection('jobs', (collection) => {
      collection.string('email');
      collection.integer('accountId');
      collection.integer('programId');
      collection.string('status');
      collection.primary('email');
      collection.unique(['accountId', 'programId'], {
        name: compositeUniqueName,
      });
      collection.index(['status'], {
        name: statusIndexName,
      });
    });

    const indexes = await listIndexes(context, context.table('jobs'));
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([compositeUniqueName, statusIndexName]),
    );

    await context.db(context.table('jobs')).insert({
      email: 'a@example.com',
      account_id: 1,
      program_id: 1,
      status: 'queued',
    });
    await expectUniqueViolation(
      context.db(context.table('jobs')).insert({
        email: 'b@example.com',
        account_id: 1,
        program_id: 1,
        status: 'queued',
      }),
    );
    await expectUniqueViolation(
      context.db(context.table('jobs')).insert({
        email: 'a@example.com',
        account_id: 2,
        program_id: 2,
        status: 'queued',
      }),
    );
  });
});

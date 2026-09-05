import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository createMany contracts', (context) => {
  it.each([
    ['empty array', []],
    [
      'invalid later row',
      [
        { id: 'new-a', name: 'A' },
        { id: 'new-b', name: 'B', missingField: 1 },
      ],
    ],
  ])('rejects %s without inserting earlier rows', async (_label, values) => {
    await createDocumentationFixture(context);
    const repository = context.database.repository('projects');
    await expect(
      // Invalid external input must also be rejected at runtime.
      repository.createMany({ values: values as never }),
    ).rejects.toMatchObject({
      code:
        Array.isArray(values) && values.length
          ? 'FIELD_NOT_FOUND'
          : 'INVALID_MUTATION',
    });
    expect(await context.db(context.table('projects'))).toEqual([]);
  });

  it('rolls back earlier inserts on a later database constraint failure', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'safe');
    const table = context.table('projects');
    const before = await context.db(table).orderBy('id');
    await expect(
      context.database.repository('projects').createMany({
        values: [
          { id: 'new-a', name: 'New' },
          { id: 'safe-a', name: 'Duplicate' },
        ],
      }),
    ).rejects.toThrow();
    expect(await context.db(table).orderBy('id')).toEqual(before);
  });

  it('initializes managed defaults and returns only selected fields with context values', async () => {
    await createDocumentationFixture(context);
    expect(
      await context.database.repository('projects').createMany({
        values: (v) => [
          { id: 'new-a', name: v.variable('$input.name') },
          { id: 'new-b', name: 'B' },
        ],
        context: { input: { name: 'A' } },
        select: (s) => s.fields('id', 'name'),
      }),
    ).toEqual({
      createdCount: 2,
      records: [
        { id: 'new-a', name: 'A' },
        { id: 'new-b', name: 'B' },
      ],
    });
    expect(
      await context
        .db(context.table('projects'))
        .select('id', 'name', 'status', 'version')
        .orderBy('id'),
    ).toEqual([
      { id: 'new-a', name: 'A', status: 'draft', version: 1 },
      { id: 'new-b', name: 'B', status: 'draft', version: 1 },
    ]);
  });
});

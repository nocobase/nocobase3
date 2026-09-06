import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository GroupBy boundaries', (context) => {
  it('groups nullable multi-field keys and resolves independent filter/having variables', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await tasks.createMany({
      values: [
        { id: 'A', title: 'A', status: 'draft', priority: null, points: 2 },
        { id: 'B', title: 'B', status: 'draft', priority: null, points: 4 },
        { id: 'C', title: 'C', status: 'draft', priority: 1, points: 8 },
        { id: 'D', title: 'D', status: 'done', priority: null, points: 16 },
        { id: 'E', title: 'E', status: 'done', priority: 1, points: 32 },
      ],
    });
    const by = Object.freeze(['status', 'priority'] as const);
    const rows = await tasks.groupBy({
      by,
      aggregate: (a) => ({ n: a.count(), total: a.sum('points') }),
      sort: (s) => [
        s.field('status').asc(),
        s.field('priority').asc().nullsFirst(),
      ],
    });
    expect(rows.map((row) => ({ ...row, total: Number(row.total) }))).toEqual([
      { status: 'done', priority: null, n: 1, total: 16 },
      { status: 'done', priority: 1, n: 1, total: 32 },
      { status: 'draft', priority: null, n: 2, total: 6 },
      { status: 'draft', priority: 1, n: 1, total: 8 },
    ]);
    expect(
      await tasks.groupBy({
        by,
        aggregate: (a) => ({ n: a.count() }),
        filter: (f) => f.string('status').eq(f.variable('$status')),
        having: (f) => f.number('n').gte(f.variable('$minimum')),
        context: Object.freeze({ status: 'draft', minimum: 2 }),
      }),
    ).toEqual([{ status: 'draft', priority: null, n: 2 }]);
    expect(
      await tasks.groupBy({
        by,
        aggregate: (a) => ({ n: a.count() }),
        filter: { status: 'absent' },
      }),
    ).toEqual([]);
    expect(by).toEqual(['status', 'priority']);
  });

  it.each([null, 'status', [], ['status', 'status']])(
    'rejects malformed or duplicate by %j',
    async (by) => {
      await createDocumentationFixture(context);
      await expect(
        context.database
          .repository('tasks')
          .groupBy({ by: by as never, aggregate: (a) => ({ n: a.count() }) }),
      ).rejects.toMatchObject({ code: 'INVALID_GROUP_BY' });
    },
  );

  it('limits having and sort to grouped fields and aggregate aliases', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await expect(
      tasks.groupBy({
        by: ['status'],
        aggregate: (a) => ({ n: a.count() }),
        having: { points: 1 },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'points' });
    await expect(
      tasks.groupBy({
        by: ['status'],
        aggregate: (a) => ({ n: a.count() }),
        sort: (s) => s.field('points').desc(),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'points' });
    await expect(
      tasks.groupBy({
        by: ['status'],
        aggregate: (a) => ({ status: a.count() }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_GROUP_BY' });
  });
});

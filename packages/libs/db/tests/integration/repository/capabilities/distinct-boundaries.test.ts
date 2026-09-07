import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository Distinct boundaries', (context) => {
  it.each([null, false, 'status', [], ['status', 'status']])(
    'rejects malformed or duplicate distinct %j',
    async (distinct) => {
      await createDocumentationFixture(context);
      await expect(
        context.database
          .repository('tasks')
          .findMany({ distinct: distinct as never }),
      ).rejects.toMatchObject({ code: 'INVALID_DISTINCT' });
    },
  );

  it('groups null tuples before offset and cursor without leaking unselected fields', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await tasks.createMany({
      values: [
        { id: 'A', title: 'A', status: 'draft', priority: null },
        { id: 'B', title: 'B', status: 'draft', priority: null },
        { id: 'C', title: 'C', status: 'draft', priority: 1 },
        { id: 'D', title: 'D', status: 'done', priority: null },
        { id: 'E', title: 'E', status: 'done', priority: null },
      ],
    });
    const distinct = Object.freeze(['status', 'priority'] as const);
    const base = {
      distinct,
      sort: {
        kind: 'sort',
        version: 1,
        items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
      },
    } as const;
    expect(
      await tasks.findMany({ ...base, select: (s) => s.fields('title') }),
    ).toEqual([{ title: 'A' }, { title: 'C' }, { title: 'D' }]);
    expect(
      await tasks.findMany({
        ...base,
        offset: 1,
        limit: 1,
        select: (s) => s.fields('title'),
      }),
    ).toEqual([{ title: 'C' }]);
    expect(
      await tasks.findMany({
        ...base,
        cursor: { id: 'B' },
        limit: 1,
        select: (s) => s.fields('title'),
      }),
    ).toEqual([{ title: 'C' }]);
    expect(
      await tasks.findMany({
        ...base,
        cursor: { id: 'D' },
        direction: 'backward',
        limit: 1,
        select: (s) => s.fields('title'),
      }),
    ).toEqual([{ title: 'C' }]);
    expect(
      await tasks.findMany({
        ...base,
        filter: { status: 'draft' },
        select: (s) => s.fields(),
      }),
    ).toEqual([{}, {}]);
    expect(distinct).toEqual(['status', 'priority']);
  });
});

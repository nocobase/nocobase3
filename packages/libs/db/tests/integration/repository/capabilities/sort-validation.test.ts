import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository Sort validation', (context) => {
  const field = { kind: 'field', path: ['title'], direction: 'asc' };
  const malformed: unknown[] = [
    null,
    false,
    [],
    {},
    { kind: 'sort', version: 2, items: [] },
    { kind: 'sort', version: 1, items: null },
    ...[
      null,
      false,
      {},
      { ...field, path: [] },
      { ...field, path: 'title' },
      { ...field, path: [null] },
      { ...field, path: [''] },
      { ...field, direction: 'up' },
      { ...field, nulls: 'auto' },
      { kind: 'aggregate', relation: [], aggregate: 'count', direction: 'asc' },
      {
        kind: 'aggregate',
        relation: ['tasks'],
        aggregate: 'median',
        direction: 'asc',
      },
    ].map((item) => ({ kind: 'sort', version: 1, items: [item] })),
    { kind: 'sort', version: 1, collection: 'other', items: [field] },
    {
      kind: 'sort',
      version: 1,
      items: [field, { ...field, direction: 'desc' }],
    },
  ];
  it.each(malformed.map((sort, index) => ({ sort, index })))(
    'rejects malformed AST $index for findMany and sort-only findOne',
    async ({ sort }) => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      await expect(
        tasks.findMany({ sort: sort as never }),
      ).rejects.toMatchObject({ code: 'INVALID_SORT' });
      await expect(
        tasks.findOne({ sort: sort as never }),
      ).rejects.toMatchObject({ code: 'INVALID_SORT' });
    },
  );

  it.each([null, false, {}, []])(
    'rejects forged callback result %j when a nonempty sort is required',
    async (result) => {
      await createDocumentationFixture(context);
      await expect(
        context.database
          .repository('tasks')
          .findOne({ sort: () => result as never }),
      ).rejects.toMatchObject({
        code: Array.isArray(result) ? 'INVALID_FILTER' : 'INVALID_SORT',
      });
    },
  );
});

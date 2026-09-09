import { expect, it } from 'vitest';
import type { FilterBuilder } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases(
  'Repository stream parameter composition',
  (context) => {
    it('matches findMany for filter, distinct, forward cursor and projected limit', async () => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      await tasks.createMany({
        values: [
          { id: 'A', title: 'A', status: 'draft' },
          { id: 'B', title: 'B', status: 'draft' },
          { id: 'C', title: 'C', status: 'done' },
          { id: 'D', title: 'D', status: 'archived' },
        ],
      });
      const options = {
        distinct: ['status'],
        cursor: { id: 'B' },
        direction: 'forward',
        limit: 1,
        filter: (f: FilterBuilder) =>
          f.string('status').ne(f.variable('$excluded')),
        context: Object.freeze({ excluded: 'archived' }),
        sort: {
          kind: 'sort',
          version: 1,
          items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
        },
      } as const;
      const expected = await tasks.findMany({
        ...options,
        select: (s) => s.fields('title'),
      });
      expect(expected).toEqual([{ title: 'C' }]);
      const rows = [];
      for await (const row of tasks.findMany({
        ...options,
        select: (s) => s.fields('title'),
      }))
        rows.push(row);
      expect(rows).toEqual(expected);
      for (const limit of [0, 1]) {
        const empty = [];
        for await (const row of tasks.findMany({
          filter: { status: 'missing' },
          limit,
        }))
          empty.push(row);
        expect(empty).toEqual([]);
      }
      expect(await tasks.count()).toBe(4);
    });

    it.each([
      [{ limit: -1 }, 'INVALID_PAGINATION'],
      [{ sort: { kind: 'sort', version: 1, items: [null] } }, 'INVALID_SORT'],
      [{ distinct: [] }, 'INVALID_DISTINCT'],
      [
        {
          sort: {
            kind: 'sort',
            version: 1,
            items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
          },
          cursor: {},
        },
        'INVALID_PAGINATION',
      ],
    ] as const)(
      'rejects invalid options during iteration: %j',
      async (options, code) => {
        await createDocumentationFixture(context);
        const tasks = context.database.repository('tasks');
        const iterator = tasks
          .findMany(options as never)
          [Symbol.asyncIterator]();
        await expect(iterator.next()).rejects.toMatchObject({ code });
        expect(await tasks.count()).toBe(0);
      },
    );
  },
);

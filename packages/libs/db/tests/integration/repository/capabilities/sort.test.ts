import { expect, it } from 'vitest';
import type { SortAst } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository scalar Sort', (context) => {
  for (const direction of ['asc', 'desc'] as const) {
    it.each(['first', 'last'] as const)(
      `${direction} nulls %s has Builder/AST parity and explicit string-key ties`,
      async (nulls) => {
        await createDocumentationFixture(context);
        const tasks = context.database.repository('tasks');
        await tasks.createMany({
          values: [
            { id: 'D', title: 'D', priority: 2 },
            { id: 'C', title: 'C', priority: 1 },
            { id: 'B', title: 'B', priority: 1 },
            { id: 'A', title: 'A', priority: null },
          ],
        });
        const ordered = direction === 'asc' ? ['B', 'C', 'D'] : ['D', 'B', 'C'];
        const expected = (
          nulls === 'first' ? ['A', ...ordered] : [...ordered, 'A']
        ).map((id) => ({ id }));
        const sort: SortAst = Object.freeze({
          kind: 'sort',
          version: 1,
          items: Object.freeze([
            Object.freeze({
              kind: 'field',
              path: Object.freeze(['priority']),
              direction,
              nulls,
            }),
            Object.freeze({
              kind: 'field',
              path: Object.freeze(['id']),
              direction: 'asc',
            }),
          ]),
        });
        for (let run = 0; run < 2; run++) {
          expect(
            await tasks.findMany({ sort, select: (s) => s.fields('id') }),
          ).toEqual(expected);
        }
        expect(
          await tasks.findMany({
            sort: (s) => [
              s
                .field('priority')
                [direction]()
                [nulls === 'first' ? 'nullsFirst' : 'nullsLast'](),
              s.field('id').asc(),
            ],
            select: (s) => s.fields('id'),
          }),
        ).toEqual(expected);
        expect(sort.items).toHaveLength(2);
      },
    );
  }
});

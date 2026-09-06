import { expect, it } from 'vitest';
import type {
  FilterAst,
  FilterBuilder,
  FilterNode,
} from '../../../../src/index.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createFilterFixture } from '../fixtures/filter.js';

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

describeIntegrationDatabases(
  'Repository Filter variable isolation',
  (context) => {
    it('reuses frozen AST and callbacks across contexts including null and zero', async () => {
      await createFilterFixture(context);
      const repository = context.database.repository('filterSamples');
      const predicate = (f: FilterBuilder): FilterNode =>
        f.number('amount').eq(f.variable('$search.amount'));
      const ast: FilterAst = JSON.parse(
        JSON.stringify({
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [predicate(new DefaultFilterBuilder())],
          },
        }),
      );
      const original = JSON.stringify(ast);
      freeze(ast);
      for (const filter of [predicate, ast]) {
        for (const [amount, code] of [
          [0, 'B'],
          [null, 'D'],
          [-1, 'A'],
          [0, 'B'],
        ] as const) {
          const inputContext = { search: { amount } };
          freeze(inputContext);
          expect(
            await repository.findMany({
              filter,
              context: inputContext,
              select: (s) => s.fields('code'),
            }),
          ).toEqual([{ code }]);
        }
      }
      expect(JSON.stringify(ast)).toBe(original);
    });

    it.each([
      ['missing context', undefined, 'VARIABLE_NOT_FOUND'],
      ['missing property', { search: {} }, 'VARIABLE_NOT_FOUND'],
      ['wrong type', { search: { amount: '0' } }, 'INVALID_FILTER'],
      ['undefined value', { search: { amount: undefined } }, 'INVALID_FILTER'],
      ['non-finite value', { search: { amount: Infinity } }, 'INVALID_FILTER'],
    ] as const)(
      'rejects %s before updating any records',
      async (_name, inputContext, code) => {
        await createFilterFixture(context);
        const before = await context
          .db(context.table('filterSamples'))
          .orderBy('code');
        await expect(
          context.database.repository('filterSamples').updateMany({
            filter: (f) => f.number('amount').eq(f.variable('$search.amount')),
            context: inputContext,
            values: { label: 'Forbidden' },
          }),
        ).rejects.toMatchObject({ code });
        expect(
          await context.db(context.table('filterSamples')).orderBy('code'),
        ).toEqual(before);
      },
    );

    it('binds both date range endpoints without changing their variable nodes', async () => {
      await createFilterFixture(context);
      const filter = (f: FilterBuilder): FilterNode =>
        f.date('day').between([f.variable('$start'), f.variable('$end')]);
      const repository = context.database.repository('filterSamples');
      for (const [start, end, expected] of [
        ['2026-09-01', '2026-09-03', ['A', 'B']],
        ['2026-09-02', '2026-09-03', ['B']],
      ] as const) {
        expect(
          await repository.findMany({
            filter,
            context: { start, end },
            sort: (s) => s.field('code').asc(),
            select: (s) => s.fields('code'),
          }),
        ).toEqual(expected.map((code) => ({ code })));
      }
    });
  },
);

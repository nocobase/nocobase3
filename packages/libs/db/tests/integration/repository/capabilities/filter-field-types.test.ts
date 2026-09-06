import { expect, it } from 'vitest';
import type {
  FilterAst,
  FilterBuilder,
  FilterNode,
} from '../../../../src/index.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';

type Predicate = (f: FilterBuilder) => FilterNode;

describeIntegrationDatabases('Repository Filter field types', (context) => {
  it.each(['integer', 'bigInt', 'decimal', 'float', 'double'])(
    '%s compares exact small numeric boundaries in Builder and AST',
    async (type) => {
      await context.builder.createCollection('filterNumbers', (c) => {
        c.string('key').primary().notNull();
        c.field({
          name: 'value',
          type,
          ...(type === 'decimal' ? { precision: 12, scale: 2 } : {}),
        }).nullable();
      });
      // Binary-exact fractions avoid making a driver-specific rounding policy a contract.
      const fractional = ['decimal', 'float', 'double'].includes(type);
      const low = fractional ? -1.5 : -1;
      const high = fractional ? 1.5 : 1;
      await context.db(context.table('filterNumbers')).insert([
        { key: 'A', value: low },
        { key: 'B', value: 0 },
        { key: 'C', value: high },
        { key: 'D', value: null },
      ]);
      const repository = context.database.repository('filterNumbers');
      const cases: readonly [Predicate, readonly string[]][] = [
        [(f) => f.number('value').eq(low), ['A']],
        [(f) => f.number('value').gte(0), ['B', 'C']],
        [(f) => f.number('value').lt(high), ['A', 'B']],
        [(f) => f.number('value').ne(null), ['A', 'B', 'C']],
        [(f) => f.number('value').empty(), ['D']],
      ];
      for (const [predicate, expected] of cases) {
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
        for (const filter of [predicate, ast]) {
          expect(
            await repository.findMany({
              filter,
              sort: (s) => s.field('key').asc(),
              select: (s) => s.fields('key'),
            }),
          ).toEqual(expected.map((key) => ({ key })));
        }
      }
    },
  );

  it('filters time equality and nulls without treating them as dates', async () => {
    await context.builder.createCollection('filterTimes', (c) => {
      c.string('key').primary().notNull();
      c.field({ name: 'clock', type: 'time' }).nullable();
    });
    await context.db(context.table('filterTimes')).insert([
      { key: 'A', clock: '00:00:00' },
      { key: 'B', clock: '12:30:00' },
      { key: 'C', clock: '23:59:59' },
      { key: 'D', clock: null },
    ]);
    const repository = context.database.repository('filterTimes');
    const cases: readonly [Predicate, readonly string[]][] = [
      [(f) => f.time('clock').eq('12:30:00'), ['B']],
      [(f) => f.time('clock').ne('12:30:00'), ['A', 'C']],
      [(f) => f.time('clock').eq(null), ['D']],
      [(f) => f.time('clock').notEmpty(), ['A', 'B', 'C']],
    ];
    for (const [filter, expected] of cases)
      expect(
        await repository.findMany({
          filter,
          sort: (s) => s.field('key').asc(),
          select: (s) => s.fields('key'),
        }),
      ).toEqual(expected.map((key) => ({ key })));
    await expect(
      repository.findMany({
        filter: (f) => f.date('clock').before('2026-09-01'),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
  });

  it('uses half-open datetime bounds with ISO literals and Date operands', async () => {
    await context.builder.createCollection('filterInstants', (c) => {
      c.string('key').primary().notNull();
      c.datetime('instant').nullable();
    });
    const first = '2026-09-01T00:00:00.000Z';
    const middle = '2026-09-01T12:00:00.000Z';
    const last = '2026-09-02T00:00:00.000Z';
    await context.db(context.table('filterInstants')).insert([
      { key: 'A', instant: first },
      { key: 'B', instant: middle },
      { key: 'C', instant: last },
      { key: 'D', instant: null },
    ]);
    const repository = context.database.repository('filterInstants');
    const cases: readonly [Predicate, readonly string[]][] = [
      [(f) => f.date('instant').before(new Date(middle)), ['A']],
      [(f) => f.date('instant').after(middle), ['C']],
      [(f) => f.date('instant').notBefore(middle), ['B', 'C']],
      [(f) => f.date('instant').notAfter(middle), ['A', 'B']],
      [
        (f) => f.date('instant').between([new Date(first), new Date(last)]),
        ['A', 'B'],
      ],
      [(f) => f.date('instant').empty(), ['D']],
    ];
    for (const [predicate, expected] of cases) {
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
      for (const filter of [predicate, ast])
        expect(
          await repository.findMany({
            filter,
            sort: (s) => s.field('key').asc(),
            select: (s) => s.fields('key'),
          }),
        ).toEqual(expected.map((key) => ({ key })));
    }
    await expect(
      repository.findMany({
        filter: (f) => f.date('instant').on('2026-09-01'),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' });
  });
});

import { expect, it } from 'vitest';
import type {
  FilterAst,
  FilterBuilder,
  FilterNode,
  FilterLiteral,
} from '../../../../src/index.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';

type Predicate = (f: FilterBuilder) => FilterNode;
const cases: readonly [string, Predicate, readonly string[]][] = [
  [
    'typed number membership',
    (f) => f.json('payload').path(['members']).has(1),
    ['A'],
  ],
  [
    'typed string membership',
    (f) => f.json('payload').path(['members']).has('1'),
    ['B'],
  ],
  [
    'typed boolean membership',
    (f) => f.json('payload').path(['members']).has(true),
    ['A'],
  ],
  [
    'duplicate requested members',
    (f) => f.json('payload').path(['members']).hasEvery([1, 1]),
    ['A'],
  ],
  [
    'empty every only accepts arrays',
    (f) => f.json('payload').path(['members']).hasEvery([]),
    ['A', 'B', 'C'],
  ],
  [
    'empty some never matches',
    (f) => f.json('payload').path(['members']).hasSome([]),
    [],
  ],
  [
    'missing paths are not JSON null',
    (f) => f.json('payload').path(['members']).isJsonNull(),
    ['D'],
  ],
  [
    'any null includes database null but not missing paths',
    (f) => f.json('payload').path(['members']).isAnyNull(),
    ['D', 'F'],
  ],
  [
    'array order matters',
    (f) => f.json('payload').path(['members']).eq([true, 1]),
    [],
  ],
  [
    'nested object key order does not matter',
    (f) => f.json('payload').path(['meta']).eq({ b: 2, a: 1 }),
    ['A'],
  ],
  [
    'OR with scalar scope',
    (f) =>
      f.and([
        f.string('status').eq('open'),
        f.or([
          f.json('payload').path(['members']).has(1),
          f.json('payload').path(['members']).has('1'),
        ]),
      ]),
    ['A'],
  ],
];

describeIntegrationDatabases(
  'Repository JSON Filter combinations',
  (context) => {
    async function prepare(): Promise<void> {
      await context.builder.createCollection('jsonFilterCases', (c) => {
        c.string('key').primary().notNull();
        c.string('status').notNull();
        c.json('payload').nullable();
      });
      const rows: readonly [string, FilterLiteral][] = [
        ['A', { members: [1, true], meta: { a: 1, b: 2 } }],
        ['B', { members: ['1', null] }],
        ['C', { members: [] }],
        ['D', { members: null }],
        ['E', {}],
      ];
      for (const [key, payload] of rows)
        await context.db(context.table('jsonFilterCases')).insert({
          key,
          status: key === 'B' ? 'closed' : 'open',
          payload: JSON.stringify(payload),
        });
      await context
        .db(context.table('jsonFilterCases'))
        .insert({ key: 'F', status: 'open', payload: null });
    }

    it.each(cases)(
      '%s in Builder and AST',
      async (_name, predicate, expected) => {
        await prepare();
        const repository = context.database.repository('jsonFilterCases');
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
          const query = repository.findMany({
            filter,
            sort: (s) => s.field('key').asc(),
            select: (s) => s.fields('key'),
          });
          if (
            context.spec.dialect === 'oracle' ||
            context.spec.dialect === 'mssql'
          )
            await expect(query).rejects.toMatchObject({
              code: 'FIELD_CAPABILITY_NOT_SUPPORTED',
            });
          else expect(await query).toEqual(expected.map((key) => ({ key })));
        }
      },
    );

    it('resolves array variable operands and updates only the selected JSON scope', async () => {
      await prepare();
      const repository = context.database.repository('jsonFilterCases');
      const filter: Predicate = (f) =>
        f.json('payload').path(['members']).hasEvery(f.variable('$members'));
      const before = await context
        .db(context.table('jsonFilterCases'))
        .orderBy('key');
      const write = repository.updateMany({
        filter,
        context: { members: [1, true] },
        values: { status: 'matched' },
      });
      if (
        context.spec.dialect === 'oracle' ||
        context.spec.dialect === 'mssql'
      ) {
        await expect(write).rejects.toMatchObject({
          code: 'FIELD_CAPABILITY_NOT_SUPPORTED',
        });
        expect(
          await context.db(context.table('jsonFilterCases')).orderBy('key'),
        ).toEqual(before);
        return;
      }
      expect(await write).toEqual({ updatedCount: 1 });
      expect(
        await context.db(context.table('jsonFilterCases')).orderBy('key'),
      ).toEqual(
        before.map((row) =>
          row.key === 'A' ? { ...row, status: 'matched' } : row,
        ),
      );
      expect(
        await repository.findMany({
          filter,
          context: { members: ['1', null] },
          select: (s) => s.fields('key'),
        }),
      ).toEqual([{ key: 'B' }]);
    });

    it.each(
      [[[1]], [{}], [undefined], [NaN], [Infinity]].map((value) => [value]),
    )(
      'rejects invalid array member operands %j before writes',
      async (members) => {
        await prepare();
        const before = await context
          .db(context.table('jsonFilterCases'))
          .orderBy('key');
        await expect(
          context.database.repository('jsonFilterCases').deleteMany({
            filter: (f) =>
              f
                .json('payload')
                .path(['members'])
                .hasSome(f.variable('$members')),
            context: { members },
          }),
        ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
        expect(
          await context.db(context.table('jsonFilterCases')).orderBy('key'),
        ).toEqual(before);
      },
    );
  },
);

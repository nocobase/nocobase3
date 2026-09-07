import { expect, it } from 'vitest';
import type {
  FilterAst,
  FilterBuilder,
  FilterNode,
} from '../../../../src/index.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createFilterFixture } from '../fixtures/filter.js';

type Predicate = (filter: FilterBuilder) => FilterNode;
const cases: readonly [string, Predicate, readonly string[]][] = [
  ['number eq', (f) => f.number('amount').eq(0), ['B']],
  ['number ne excludes null', (f) => f.number('amount').ne(0), ['A', 'C']],
  ['number gt', (f) => f.number('amount').gt(0), ['C']],
  ['number gte', (f) => f.number('amount').gte(0), ['B', 'C']],
  ['number lt', (f) => f.number('amount').lt(0), ['A']],
  ['number lte', (f) => f.number('amount').lte(0), ['A', 'B']],
  ['number eq null', (f) => f.number('amount').eq(null), ['D']],
  ['number ne null', (f) => f.number('amount').ne(null), ['A', 'B', 'C']],
  ['number empty', (f) => f.number('amount').empty(), ['D']],
  [
    'number notEmpty retains zero',
    (f) => f.number('amount').notEmpty(),
    ['A', 'B', 'C'],
  ],
  ['string eq', (f) => f.string('label').eq('Beta'), ['B']],
  ['string ne excludes null', (f) => f.string('label').ne('Beta'), ['A', 'C']],
  ['string eq null', (f) => f.string('label').eq(null), ['D']],
  ['string ne null', (f) => f.string('label').ne(null), ['A', 'B', 'C']],
  ['string includes', (f) => f.string('label').includes('mm'), ['C']],
  [
    'string notIncludes excludes null',
    (f) => f.string('label').notIncludes('mm'),
    ['A', 'B'],
  ],
  ['string startsWith', (f) => f.string('label').startsWith('Al'), ['A']],
  ['string endsWith', (f) => f.string('label').endsWith('ta'), ['B']],
  ['text includes', (f) => f.text('description').includes('mm'), ['C']],
  ['text empty', (f) => f.text('description').empty(), ['D']],
  ['boolean true', (f) => f.boolean('enabled').isTrue(), ['A']],
  ['boolean false is not null', (f) => f.boolean('enabled').isFalse(), ['B']],
  ['boolean empty', (f) => f.boolean('enabled').empty(), ['C', 'D']],
  [
    'boolean notEmpty retains false',
    (f) => f.boolean('enabled').notEmpty(),
    ['A', 'B'],
  ],
  ['date on', (f) => f.date('day').on('2026-09-02'), ['B']],
  [
    'date notOn excludes null',
    (f) => f.date('day').notOn('2026-09-02'),
    ['A', 'C'],
  ],
  ['date before', (f) => f.date('day').before('2026-09-02'), ['A']],
  ['date after', (f) => f.date('day').after('2026-09-02'), ['C']],
  ['date notBefore', (f) => f.date('day').notBefore('2026-09-02'), ['B', 'C']],
  ['date notAfter', (f) => f.date('day').notAfter('2026-09-02'), ['A', 'B']],
  [
    'date between includes start but excludes end',
    (f) => f.date('day').between(['2026-09-01', '2026-09-03']),
    ['A', 'B'],
  ],
  ['date empty', (f) => f.date('day').empty(), ['D']],
  ['date notEmpty', (f) => f.date('day').notEmpty(), ['A', 'B', 'C']],
];

describeIntegrationDatabases('Repository scalar Filter matrix', (context) => {
  it.each(cases)(
    '%s has the same exact result in Builder and serialized AST',
    async (_name, predicate, codes) => {
      await createFilterFixture(context);
      const repository = context.database.repository('filterSamples');
      const node = predicate(new DefaultFilterBuilder());
      const ast: FilterAst = JSON.parse(
        JSON.stringify({
          kind: 'filter',
          version: 1,
          collection: 'filterSamples',
          root: { kind: 'group', logic: 'and', items: [node] },
        }),
      );
      for (const filter of [predicate, ast]) {
        expect(
          await repository.findMany({
            filter,
            sort: (s) => s.field('code').asc(),
            select: (s) => s.fields('code'),
          }),
        ).toEqual(codes.map((code) => ({ code })));
      }
    },
  );

  it('treats empty textual values separately from strict null equality where supported', async () => {
    await createFilterFixture(context);
    await context
      .db(context.table('filterSamples'))
      .insert({ code: 'E', label: '', description: '', version: 1 });
    const repository = context.database.repository('filterSamples');
    for (const field of ['label', 'description']) {
      const ids = async (filter: Predicate): Promise<string[]> =>
        (
          await repository.findMany({
            filter,
            sort: (s) => s.field('code').asc(),
            select: (s) => s.fields('code'),
          })
        ).map((r) => String(r.code));
      const predicate = (f: FilterBuilder) =>
        field === 'label' ? f.string(field) : f.text(field);
      expect(await ids((f) => predicate(f).empty())).toEqual(['D', 'E']);
      expect(await ids((f) => predicate(f).notEmpty())).toEqual([
        'A',
        'B',
        'C',
      ]);
      // Oracle stores empty strings as SQL NULL.
      expect(await ids((f) => predicate(f).eq(null))).toEqual(
        context.spec.dialect === 'oracle' ? ['D', 'E'] : ['D'],
      );
    }
  });
});

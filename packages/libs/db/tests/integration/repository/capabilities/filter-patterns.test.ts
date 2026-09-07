import { expect, it } from 'vitest';
import type {
  FilterAst,
  FilterBuilder,
  FilterNode,
} from '../../../../src/index.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases(
  'Repository Filter literal patterns',
  (context) => {
    it.each(['%', '_', '!', '[', "' OR 1=1 --", '\\'])(
      'binds and escapes the literal pattern %j',
      async (needle) => {
        await context.builder.createCollection('patternCases', (c) => {
          c.string('key').primary().notNull();
          c.string('label').nullable();
        });
        await context.db(context.table('patternCases')).insert([
          { key: 'A', label: `prefix${needle}suffix` },
          { key: 'B', label: 'prefixXsuffix' },
          { key: 'C', label: null },
        ]);
        const repository = context.database.repository('patternCases');
        const predicates: readonly [
          (f: FilterBuilder) => FilterNode,
          readonly string[],
        ][] = [
          [(f) => f.string('label').includes(needle), ['A']],
          [(f) => f.string('label').notIncludes(needle), ['B']],
          [(f) => f.string('label').startsWith(`prefix${needle}`), ['A']],
          [(f) => f.string('label').endsWith(`${needle}suffix`), ['A']],
        ];
        for (const [predicate, expected] of predicates) {
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
                select: (s) => s.fields('key'),
                sort: (s) => s.field('key').asc(),
              }),
            ).toEqual(expected.map((key) => ({ key })));
        }
      },
    );

    it('case-insensitive inequality excludes SQL NULL unless it is explicitly included', async () => {
      await context.builder.createCollection('patternCases', (c) => {
        c.string('key').primary().notNull();
        c.string('label').nullable();
      });
      await context.db(context.table('patternCases')).insert([
        { key: 'A', label: 'Alpha' },
        { key: 'B', label: 'ALPHA' },
        { key: 'C', label: 'Beta' },
        { key: 'D', label: null },
      ]);
      const repository = context.database.repository('patternCases');
      expect(
        await repository.findMany({
          filter: (f) => f.string('label').ne('alpha', { mode: 'insensitive' }),
          select: (s) => s.fields('key'),
        }),
      ).toEqual([{ key: 'C' }]);
      expect(
        await repository.findMany({
          filter: (f) =>
            f.or([
              f.string('label').ne('alpha', { mode: 'insensitive' }),
              f.string('label').eq(null),
            ]),
          sort: (s) => s.field('key').asc(),
          select: (s) => s.fields('key'),
        }),
      ).toEqual([{ key: 'C' }, { key: 'D' }]);
    });
  },
);

import { expect, it } from 'vitest';
import type { FilterBuilder, FilterNode } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

describeIntegrationDatabases(
  'Repository Filter direct relation paths',
  (context) => {
    it('traverses multiple to-one edges and distinguishes absent targets from null fields', async () => {
      await createRelationFixture(context);
      const repository = context.database.repository('repositoryBooks');
      const cases: readonly [
        (f: FilterBuilder) => FilterNode,
        readonly string[],
      ][] = [
        [
          (f) => f.string('author.profile.bio').eq('compiler engineer'),
          ['Alpha', 'Beta'],
        ],
        [
          (f) => f.string(['author', 'profile', 'bio']).ne('compiler engineer'),
          [],
        ],
        [(f) => f.string('publisher.name').eq(null), []],
        [(f) => f.relation('publisher').empty(), ['Beta']],
      ];
      for (const [filter, titles] of cases)
        expect(
          await repository.findMany({
            filter,
            sort: (s) => s.field('title').asc(),
            select: (s) => s.fields('title'),
          }),
        ).toEqual(titles.map((title) => ({ title })));
      expect(
        await repository.findMany({
          filter: (f) =>
            f
              .relation('author')
              .some((a) =>
                a
                  .relation('profile')
                  .none((p) => p.string('bio').eq('compiler engineer')),
              ),
          select: (s) => s.fields('title'),
        }),
      ).toEqual([{ title: 'Gamma' }]);
    });

    it.each([
      [
        'to-many direct path',
        (f: FilterBuilder) => f.string('tags.label').eq('database'),
        'INVALID_FILTER',
      ],
      [
        'wrong builder at nested field',
        (f: FilterBuilder) => f.number('author.name').eq(1),
        'FIELD_CAPABILITY_NOT_SUPPORTED',
      ],
      [
        'unknown nested field',
        (f: FilterBuilder) => f.string('author.missing').eq('x'),
        'FIELD_NOT_FOUND',
      ],
      [
        'quantifier multi-hop path',
        (f: FilterBuilder) => f.relation('author.profile').notEmpty(),
        'INVALID_FILTER',
      ],
    ] as const)('rejects %s before writing', async (_name, filter, code) => {
      await createRelationFixture(context);
      const before = await context
        .db(context.table('repositoryBooks'))
        .orderBy('id');
      await expect(
        context.database
          .repository('repositoryBooks')
          .updateMany({ filter, values: { pages: 0 } }),
      ).rejects.toMatchObject({ code });
      expect(
        await context.db(context.table('repositoryBooks')).orderBy('id'),
      ).toEqual(before);
    });
  },
);

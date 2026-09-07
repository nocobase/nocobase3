import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

describeIntegrationDatabases(
  'Repository relation sort boundaries',
  (context) => {
    for (const aggregate of ['sum', 'avg', 'min', 'max'] as const) {
      it.each(['asc', 'desc'] as const)(
        `${aggregate} %s honors empty aggregate values and null placement`,
        async (direction) => {
          await createRelationFixture(context);
          const rows = await context.database
            .repository('repositoryAuthors')
            .findMany({
              select: (s) => s.fields('name'),
              sort: (s) => [
                s
                  .relation('books')
                  [aggregate]('pages')
                  [direction]()
                  .nullsFirst(),
                s.field('name').asc(),
              ],
            });
          expect(rows).toEqual(
            (direction === 'asc'
              ? ['Cara', 'Bob', 'Ada']
              : aggregate === 'sum'
                ? ['Ada', 'Bob', 'Cara']
                : ['Cara', 'Ada', 'Bob']
            ).map((name) => ({ name })),
          );
        },
      );
    }

    it('breaks tied belongsToMany counts before paginating root records', async () => {
      await createRelationFixture(context);
      const tags = context.database.repository('repositoryTags');
      const books = context.database.repository('repositoryBooks');
      const extra = await tags.createOne({ values: { label: 'extra' } });
      const gamma = await books.findOne({ filter: { title: 'Gamma' } });
      await context
        .db(context.table('repositoryBookTags'))
        .insert({ book_id: gamma!.id, tag_id: extra.record.id });
      expect(
        await books.findMany({
          select: (s) => s.fields('title'),
          sort: (s) => [
            s.relation('tags').count().desc(),
            s.field('title').asc(),
          ],
          limit: 1,
          offset: 1,
        }),
      ).toEqual([{ title: 'Gamma' }]);
    });

    it('places missing to-one targets first without selecting the relation', async () => {
      await createRelationFixture(context);
      expect(
        await context.database.repository('repositoryBooks').findMany({
          select: (s) => s.fields('title'),
          sort: (s) => s.field('publisher.name').desc().nullsFirst(),
        }),
      ).toEqual([{ title: 'Beta' }, { title: 'Gamma' }, { title: 'Alpha' }]);
    });
  },
);

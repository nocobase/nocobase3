import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createRelationFixture,
  selection,
  selectionNode,
  relation,
  relationFieldSort,
  relationCountSort,
} from '../fixtures/relations.js';

describeIntegrationDatabases('Repository relations/sort', (context) => {
  it('sorts with Field paths and relation aggregates from Sort Builder input', async () => {
    await createRelationFixture(context);
    const books = context.database.repository('repositoryBooks');
    const authors = context.database.repository('repositoryAuthors');

    await expect(
      books.findMany({
        select: selection(['title']),
        sort: (sort) => sort.field('publisher.name').asc().nullsLast(),
      }),
    ).resolves.toEqual([
      { title: 'Alpha' },
      { title: 'Gamma' },
      { title: 'Beta' },
    ]);

    await expect(
      authors.findMany({
        select: selection(['name']),
        sort: (sort) => [
          sort.relation('books').count().desc(),
          sort.field('name').asc(),
        ],
      }),
    ).resolves.toEqual([{ name: 'Ada' }, { name: 'Bob' }, { name: 'Cara' }]);

    await expect(
      authors.findMany({
        select: selection(['name']),
        sort: (sort) => sort.relation('books').max('pages').desc().nullsLast(),
      }),
    ).resolves.toEqual([{ name: 'Ada' }, { name: 'Bob' }, { name: 'Cara' }]);
  });

  it('validates invalid and duplicate Sort Builder expressions', async () => {
    await createRelationFixture(context);
    const authors = context.database.repository('repositoryAuthors');

    await expect(
      authors.findMany({
        sort: (sort) => sort.field('books.title').asc(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SORT', relation: 'books' });
    await expect(
      authors.findMany({
        sort: (sort) => sort.relation('profile').count().desc(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SORT', relation: 'profile' });
    await expect(
      authors.findMany({
        sort: (sort) => sort.relation('books').sum('title').desc(),
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_CAPABILITY_NOT_SUPPORTED',
      field: 'title',
    });
    await expect(
      authors.findMany({
        sort: (sort) => [sort.field('name').asc(), sort.field('name').desc()],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SORT' });
  });

  it('sorts by to-one fields and to-many aggregates before root pagination', async () => {
    await createRelationFixture(context);
    const books = context.database.repository('repositoryBooks');
    const authors = context.database.repository('repositoryAuthors');

    await expect(
      books.findMany({
        select: selection(['title']),
        sort: relationFieldSort(['publisher'], 'name', 'asc'),
      }),
    ).resolves.toEqual([
      { title: 'Alpha' },
      { title: 'Gamma' },
      { title: 'Beta' },
    ]);
    await expect(
      authors.findMany({
        select: selection(
          ['name'],
          [relation('books', selectionNode(['title']))],
        ),
        sort: relationCountSort(['books'], 'desc'),
        limit: 2,
        offset: 1,
      }),
    ).resolves.toEqual([
      { name: 'Bob', books: [{ title: 'Gamma' }] },
      { name: 'Cara', books: [] },
    ]);
  });
});

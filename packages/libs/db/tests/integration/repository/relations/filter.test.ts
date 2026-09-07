import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createRelationFixture,
  selection,
  sorting,
} from '../fixtures/relations.js';

describeIntegrationDatabases('Repository relations/filter', (context) => {
  it('filters through relation quantifiers and direct to-one paths', async () => {
    await createRelationFixture(context);
    const authors = context.database.repository('repositoryAuthors');
    const books = context.database.repository('repositoryBooks');

    await expect(
      authors.findMany({
        select: selection(['name']),
        filter: (filter) =>
          filter.relation('books').some((book) => book.number('pages').gt(200)),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([{ name: 'Ada' }]);
    await expect(
      authors.findMany({
        select: selection(['name']),
        filter: (filter) =>
          filter.relation('books').none((book) => book.number('pages').gt(200)),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([{ name: 'Bob' }, { name: 'Cara' }]);
    await expect(
      authors.findMany({
        select: selection(['name']),
        filter: (filter) => filter.relation('books').empty(),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([{ name: 'Cara' }]);
    await expect(
      authors.findMany({
        select: selection(['name']),
        filter: (filter) => filter.relation('books').notEmpty(),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([{ name: 'Ada' }, { name: 'Bob' }]);
    await expect(
      books.findMany({
        select: selection(['title']),
        filter: (filter) => filter.string(['publisher', 'name']).eq('South'),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([{ title: 'Gamma' }]);
  });
});

import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createRelationFixture,
  selection,
  selectionNode,
  relation,
  sorting,
  filterAst,
} from '../fixtures/relations.js';

describeIntegrationDatabases('Repository relations/select', (context) => {
  it('loads every relation cardinality in batches and preserves empty shapes', async () => {
    await createRelationFixture(context);

    await expect(
      context.database.repository('repositoryBooks').findMany({
        select: selection(
          ['id', 'title'],
          [
            relation('author', selectionNode(['id', 'name'])),
            relation('publisher', selectionNode(['id', 'name'])),
            relation(
              'tags',
              selectionNode(['id', 'label']),
              undefined,
              sorting('label', 'desc'),
            ),
          ],
        ),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([
      {
        id: 1,
        title: 'Alpha',
        author: { id: 1, name: 'Ada' },
        publisher: { id: 1, name: 'North' },
        tags: [
          { id: 2, label: 'typescript' },
          { id: 1, label: 'database' },
        ],
      },
      {
        id: 2,
        title: 'Beta',
        author: { id: 1, name: 'Ada' },
        publisher: null,
        tags: [],
      },
      {
        id: 3,
        title: 'Gamma',
        author: { id: 2, name: 'Bob' },
        publisher: { id: 2, name: 'South' },
        tags: [{ id: 1, label: 'database' }],
      },
    ]);

    await expect(
      context.database.repository('repositoryAuthors').findMany({
        select: selection(
          ['id', 'name'],
          [
            relation('profile', selectionNode(['bio'])),
            relation(
              'books',
              selectionNode(['title']),
              undefined,
              sorting('id', 'asc'),
            ),
          ],
        ),
        sort: sorting('id', 'asc'),
      }),
    ).resolves.toEqual([
      {
        id: 1,
        name: 'Ada',
        profile: { bio: 'compiler engineer' },
        books: [{ title: 'Alpha' }, { title: 'Beta' }],
      },
      {
        id: 2,
        name: 'Bob',
        profile: null,
        books: [{ title: 'Gamma' }],
      },
      { id: 3, name: 'Cara', profile: null, books: [] },
    ]);
  });

  it('loads nested relations and applies relation-local filters and sorts', async () => {
    await createRelationFixture(context);
    const result = await context.database
      .repository('repositoryAuthors')
      .findMany({
        select: selection(
          ['name'],
          [
            relation(
              'books',
              selectionNode(
                ['title'],
                [relation('publisher', selectionNode(['name']))],
              ),
              filterAst('pages', '$gt', 100),
              sorting('pages', 'desc'),
            ),
          ],
        ),
        sort: sorting('id', 'asc'),
      });

    expect(result).toEqual([
      {
        name: 'Ada',
        books: [
          { title: 'Beta', publisher: null },
          { title: 'Alpha', publisher: { name: 'North' } },
        ],
      },
      { name: 'Bob', books: [] },
      { name: 'Cara', books: [] },
    ]);
  });

  it('normalizes Select Builder input to the same relation graph as Select AST', async () => {
    await createRelationFixture(context);
    const authors = context.database.repository('repositoryAuthors');
    const selectAst = selection(
      ['name'],
      [
        relation(
          'books',
          selectionNode(
            ['title'],
            [relation('publisher', selectionNode(['name']))],
          ),
          filterAst('pages', '$gt', 100),
          sorting('pages', 'desc'),
        ),
      ],
    );
    const astResult = await authors.findMany({
      select: selectAst,
      sort: sorting('id', 'asc'),
    });
    const builderResult = await authors.findMany({
      select: (select) =>
        select.fields('name').include('books', (books) =>
          books
            .fields('title')
            .filter((filter) => filter.number('pages').gt(100))
            .sort((sort) => sort.field('pages').desc())
            .include('publisher', (publisher) => publisher.fields('name')),
        ),
      sort: sorting('id', 'asc'),
    });

    expect(builderResult).toEqual(astResult);
  });

  it('supports shorthand filters and default scalar fields in included selections', async () => {
    await createRelationFixture(context);
    const result = await context.database
      .repository('repositoryAuthors')
      .findMany({
        select: (select) =>
          select
            .fields('name')
            .include('books', (books) =>
              books.filter({ pages: 180 }).include('publisher'),
            ),
        sort: sorting('id', 'asc'),
      });

    expect(result).toEqual([
      {
        name: 'Ada',
        books: [
          {
            id: 1,
            title: 'Alpha',
            pages: 180,
            authorId: 1,
            publisherId: 1,
            publisher: { id: 1, name: 'North' },
          },
        ],
      },
      { name: 'Bob', books: [] },
      { name: 'Cara', books: [] },
    ]);
  });

  it('validates duplicate and unknown Select Builder entries', async () => {
    await createRelationFixture(context);
    const authors = context.database.repository('repositoryAuthors');

    await expect(
      authors.findMany({
        select: (select) => select.fields('name', 'name'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT', field: 'name' });
    await expect(
      authors.findMany({
        select: (select) => select.include('books').include('books'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT', relation: 'books' });
    await expect(
      authors.findMany({
        select: (select) => select.fields('missing'),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
    await expect(
      authors.findMany({
        select: (select) => select.include('missing'),
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
  });
});

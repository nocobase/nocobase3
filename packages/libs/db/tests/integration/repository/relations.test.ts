import { expect, it } from 'vitest';
import type {
  FilterAst,
  SelectAst,
  SelectRelationNode,
  SortAst,
} from '../../../src/index.js';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../helpers.js';

describeIntegrationDatabases('Repository relation reads', (context) => {
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

async function createRelationFixture(
  context: IntegrationTestContext,
): Promise<void> {
  await context.builder.createCollections([
    {
      name: 'repositoryAuthors',
      definition: (collection) => {
        collection.increments('id');
        collection.string('name').notNull();
        collection
          .hasOne('profile', 'repositoryProfiles')
          .foreignKey('authorId');
        collection.hasMany('books', 'repositoryBooks').foreignKey('authorId');
      },
    },
    {
      name: 'repositoryProfiles',
      definition: (collection) => {
        collection.increments('id');
        collection.integer('authorId').notNull();
        collection.string('bio').notNull();
      },
    },
    {
      name: 'repositoryPublishers',
      definition: (collection) => {
        collection.increments('id');
        collection.string('name').notNull();
      },
    },
    {
      name: 'repositoryTags',
      definition: (collection) => {
        collection.increments('id');
        collection.string('label').notNull();
      },
    },
    {
      name: 'repositoryBookTags',
      definition: (collection) => {
        collection.increments('id');
        collection.integer('bookId').notNull();
        collection.integer('tagId').notNull();
      },
    },
    {
      name: 'repositoryBooks',
      definition: (collection) => {
        collection.increments('id');
        collection.string('title').notNull();
        collection.integer('pages').notNull();
        collection.integer('authorId').notNull();
        collection
          .belongsTo('author', 'repositoryAuthors')
          .foreignKey('authorId')
          .constraints(false);
        collection
          .belongsTo('publisher', 'repositoryPublishers')
          .constraints(false);
        collection
          .belongsToMany('tags', 'repositoryTags')
          .through('repositoryBookTags')
          .foreignKey('bookId')
          .otherKey('tagId');
      },
    },
  ]);

  await context.db(context.table('repositoryAuthors')).insert([
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Cara' },
  ]);
  await context.db(context.table('repositoryProfiles')).insert({
    id: 1,
    author_id: 1,
    bio: 'compiler engineer',
  });
  await context.db(context.table('repositoryPublishers')).insert([
    { id: 1, name: 'North' },
    { id: 2, name: 'South' },
  ]);
  await context.db(context.table('repositoryBooks')).insert([
    { id: 1, title: 'Alpha', pages: 180, author_id: 1, publisher_id: 1 },
    { id: 2, title: 'Beta', pages: 260, author_id: 1, publisher_id: null },
    { id: 3, title: 'Gamma', pages: 90, author_id: 2, publisher_id: 2 },
  ]);
  await context.db(context.table('repositoryTags')).insert([
    { id: 1, label: 'database' },
    { id: 2, label: 'typescript' },
  ]);
  await context.db(context.table('repositoryBookTags')).insert([
    { id: 1, book_id: 1, tag_id: 1 },
    { id: 2, book_id: 1, tag_id: 2 },
    { id: 3, book_id: 3, tag_id: 1 },
  ]);
}

function selection(
  fields: readonly string[],
  relations?: readonly SelectRelationNode[],
): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: selectionNode(fields, relations),
  };
}

function selectionNode(
  fields: readonly string[],
  relations?: readonly SelectRelationNode[],
): SelectAst['root'] {
  return { kind: 'selection', fields, relations };
}

function relation(
  field: string,
  select: SelectAst['root'],
  filter?: FilterAst,
  sort?: SortAst,
): SelectRelationNode {
  return { kind: 'relation', field, select, filter, sort };
}

function sorting(field: string, direction: 'asc' | 'desc'): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [{ by: { kind: 'field', field }, direction }],
  };
}

function relationFieldSort(
  relationPath: readonly string[],
  field: string,
  direction: 'asc' | 'desc',
): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [
      {
        by: { kind: 'relationField', relation: relationPath, field },
        direction,
      },
    ],
  };
}

function relationCountSort(
  relationPath: readonly string[],
  direction: 'asc' | 'desc',
): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [
      {
        by: {
          kind: 'relationAggregate',
          relation: relationPath,
          aggregate: 'count',
        },
        direction,
      },
    ],
  };
}

function filterAst(field: string, operator: '$gt', value: number): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: [{ kind: 'condition', path: [field], operator, value }],
    },
  };
}

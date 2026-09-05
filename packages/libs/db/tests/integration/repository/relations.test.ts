import { expect, it } from 'vitest';
import type {
  FilterAst,
  SelectAst,
  SelectIncludeNode,
  SortAst,
} from '../../../src/index.js';
import {
  describeIntegrationDatabases,
  type IntegrationTestContext,
} from '../helpers.js';

describeIntegrationDatabases('Repository relation reads', (context) => {
  it('combines independent record and aggregate branches per parent', async () => {
    await createRelationFixture(context);
    const repository = context.database.repository('repositoryAuthors');
    const rows = await repository.findMany({
      select: (s) =>
        s.fields('id').include('books', (books) =>
          books.combine({
            records: books
              .fields('title')
              .sort((s) => [s.field('id').asc()])
              .limit(1),
            count: books.count(),
            sum: books.sum('pages'),
            avg: books.avg('pages'),
            min: books.min('pages'),
            max: books.max('pages'),
            pageCount: books
              .sort((s) => [s.field('id').asc()])
              .limit(1)
              .count(),
            unique: books
              .sort((s) => [s.field('id').asc()])
              .distinct(['authorId'])
              .count(),
          }),
        ),
      sort: (s) => [s.field('id').asc()],
    });
    expect(rows[0]).toMatchObject({
      id: 1,
      books: {
        records: [{ title: 'Alpha' }],
        count: 2,
        pageCount: 1,
        unique: 1,
      },
    });
    expect(rows[1]).toMatchObject({
      id: 2,
      books: { records: [{ title: 'Gamma' }], count: 1 },
    });
    expect(rows[2]).toEqual({
      id: 3,
      books: {
        records: [],
        count: 0,
        sum: null,
        avg: null,
        min: null,
        max: null,
        pageCount: 0,
        unique: 0,
      },
    });
    const aggregates = rows[0].books as Record<string, unknown>;
    expect(Number(aggregates.sum)).toBe(
      Number(aggregates.min) + Number(aggregates.max),
    );
    expect(Number(aggregates.avg) * 2).toBe(Number(aggregates.sum));
    const filtered = await repository.findMany({
      select: (s) =>
        s.fields('id').include('books', (books) =>
          books.filter({ title: 'Alpha' }).combine({
            count: books.count(),
            impossible: books.filter({ title: 'Beta' }).count(),
          }),
        ),
      sort: (s) => [s.field('id').asc()],
    });
    expect(filtered[0]).toEqual({ id: 1, books: { count: 1, impossible: 0 } });
    const tags = await context.database.repository('repositoryBooks').findMany({
      select: (s) => s.fields('id').include('tags', (tags) => tags.count()),
      sort: (s) => [s.field('id').asc()],
    });
    expect(tags).toEqual([
      { id: 1, tags: 2 },
      { id: 2, tags: 0 },
      { id: 3, tags: 1 },
    ]);
    const distinctRows = await repository.findMany({
      select: (s) =>
        s.fields('id').include('books', (books) =>
          books
            .sort((s) => [s.field('id').asc()])
            .distinct(['authorId'])
            .fields('title'),
        ),
      sort: (s) => [s.field('id').asc()],
    });
    expect(distinctRows[0]).toEqual({ id: 1, books: [{ title: 'Alpha' }] });
    const astRows = await repository.findMany({
      select: {
        kind: 'select',
        version: 1,
        root: {
          kind: 'selection',
          fields: ['id'],
          includes: [
            {
              kind: 'include',
              relation: 'books',
              select: { kind: 'selection' },
              result: {
                kind: 'combine',
                branches: {
                  count: {
                    select: { kind: 'selection' },
                    result: { kind: 'count' },
                  },
                  previous: {
                    select: { kind: 'selection' },
                    result: { kind: 'sum', field: 'pages' },
                    sort: sorting('id', 'asc'),
                    cursor: { id: 2 },
                    direction: 'backward',
                    limit: 1,
                  },
                },
              },
            },
          ],
        },
      },
      sort: (s) => [s.field('id').asc()],
    });
    expect(astRows[0]).toMatchObject({ id: 1, books: { count: 2 } });
    expect(Number((astRows[0].books as Record<string, unknown>).previous)).toBe(
      180,
    );
    await expect(
      repository.findMany({
        select: (s) =>
          s.include('books', (books) => books.fields('title').count()),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
    await expect(
      repository.findMany({
        select: (s) => s.include('profile', (profile) => profile.count()),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
  });
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

  const authors = context.database.repository('repositoryAuthors');
  const profiles = context.database.repository('repositoryProfiles');
  const publishers = context.database.repository('repositoryPublishers');
  const books = context.database.repository('repositoryBooks');
  const tags = context.database.repository('repositoryTags');
  const bookTags = context.database.repository('repositoryBookTags');
  const ada = await authors.createOne({ values: { name: 'Ada' } });
  const bob = await authors.createOne({ values: { name: 'Bob' } });
  await authors.createOne({ values: { name: 'Cara' } });
  await profiles.createOne({
    values: { authorId: ada.record.id, bio: 'compiler engineer' },
  });
  const north = await publishers.createOne({ values: { name: 'North' } });
  const south = await publishers.createOne({ values: { name: 'South' } });
  const alpha = await books.createOne({
    values: {
      title: 'Alpha',
      pages: 180,
      authorId: ada.record.id,
      publisherId: north.record.id,
    },
  });
  await books.createOne({
    values: {
      title: 'Beta',
      pages: 260,
      authorId: ada.record.id,
      publisherId: null,
    },
  });
  const gamma = await books.createOne({
    values: {
      title: 'Gamma',
      pages: 90,
      authorId: bob.record.id,
      publisherId: south.record.id,
    },
  });
  const databaseTag = await tags.createOne({ values: { label: 'database' } });
  const typescriptTag = await tags.createOne({
    values: { label: 'typescript' },
  });
  await bookTags.createMany({
    values: [
      { bookId: alpha.record.id, tagId: databaseTag.record.id },
      { bookId: alpha.record.id, tagId: typescriptTag.record.id },
      { bookId: gamma.record.id, tagId: databaseTag.record.id },
    ],
  });
}

function selection(
  fields: readonly string[],
  includes?: readonly SelectIncludeNode[],
): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: selectionNode(fields, includes),
  };
}

function selectionNode(
  fields: readonly string[],
  includes?: readonly SelectIncludeNode[],
): SelectAst['root'] {
  return { kind: 'selection', fields, includes };
}

function relation(
  relation: string,
  select: SelectAst['root'],
  filter?: FilterAst,
  sort?: SortAst,
): SelectIncludeNode {
  return { kind: 'include', relation, select, filter, sort };
}

function sorting(field: string, direction: 'asc' | 'desc'): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [{ kind: 'field', path: [field], direction }],
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
        kind: 'field',
        path: [...relationPath, field],
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
        kind: 'aggregate',
        relation: relationPath,
        aggregate: 'count',
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

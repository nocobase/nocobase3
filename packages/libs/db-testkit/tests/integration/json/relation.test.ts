import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('JSON relation select', (context) => {
  it('reads JSON values through Repository relation selections', async () => {
    await context.builder.createCollections([
      {
        name: 'jsonRelationAuthors',
        definition: (collection) => {
          collection.increments('id');
          collection.string('name').notNull();
          collection
            .hasMany('books', 'jsonRelationBooks')
            .sourceKey('id')
            .foreignKey('authorId');
        },
      },
      {
        name: 'jsonRelationBooks',
        definition: (collection) => {
          collection.increments('id');
          collection.integer('authorId').notNull();
          collection.string('title').notNull();
          collection.json('payload').nullable();
          collection
            .belongsTo('author', 'jsonRelationAuthors')
            .targetKey('id')
            .foreignKey('authorId')
            .constraints(false);
        },
      },
    ]);

    const authors = context.database.repository('jsonRelationAuthors');
    const books = context.database.repository('jsonRelationBooks');
    const ada = await authors.createOne({ values: { name: 'Ada' } });
    const bob = await authors.createOne({ values: { name: 'Bob' } });

    await books.createMany({
      values: [
        {
          authorId: ada.record.id,
          title: 'Alpha',
          payload: { chapters: [1, 2], published: true },
        },
        {
          authorId: ada.record.id,
          title: 'Beta',
          payload: ['draft', { reviewed: false }],
        },
        {
          authorId: bob.record.id,
          title: 'Gamma',
          payload: null,
        },
      ],
    });

    await expect(
      authors.findMany({
        select: (select) =>
          select
            .fields('name')
            .include('books', (book) => book.fields('title', 'payload')),
        sort: (sort) => sort.field('id').asc(),
      }),
    ).resolves.toEqual([
      {
        name: 'Ada',
        books: [
          {
            title: 'Alpha',
            payload: { chapters: [1, 2], published: true },
          },
          {
            title: 'Beta',
            payload: ['draft', { reviewed: false }],
          },
        ],
      },
      {
        name: 'Bob',
        books: [{ title: 'Gamma', payload: null }],
      },
    ]);
  });
});

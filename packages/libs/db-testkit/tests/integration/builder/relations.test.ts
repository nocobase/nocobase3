import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  expectForeignKeyViolation,
  listForeignKeys,
  listIndexes,
} from '../helpers.js';

describeIntegrationDatabases('relation fields', (context) => {
  it('creates collections with cyclic logical relations in one batch', async () => {
    await context.builder.createCollections([
      {
        name: 'authors',
        definition: (collection) => {
          collection.increments('id');
          collection
            .hasMany('books', 'books')
            .sourceKey('id')
            .foreignKey('authorId');
        },
      },
      {
        name: 'books',
        definition: (collection) => {
          collection.increments('id');
          collection.bigInt('authorId');
          collection
            .belongsTo('author', 'authors')
            .targetKey('id')
            .foreignKeyType('bigInt')
            .foreignKey('authorId')
            .constraints(false);
        },
      },
    ]);

    await expect(
      context.database.connection().collections.validateRelations(),
    ).resolves.toBeUndefined();
    await expect(context.metadataStore.get('authors')).resolves.toMatchObject({
      document: {
        relations: { books: { target: 'books' } },
      },
    });
    await expect(context.metadataStore.get('books')).resolves.toMatchObject({
      document: {
        relations: { author: { target: 'authors' } },
      },
    });
  });

  it('validates sequential relation writes against the completed transaction graph', async () => {
    await context.database.transaction(async (connection) => {
      await connection.builder.createCollection('teams', (collection) => {
        collection.increments('id');
        collection
          .hasMany('members', 'members')
          .sourceKey('id')
          .foreignKey('teamId');
      });
      await connection.builder.createCollection('members', (collection) => {
        collection.increments('id');
        collection.bigInt('teamId');
        collection
          .belongsTo('team', 'teams')
          .targetKey('id')
          .foreignKeyType('bigInt')
          .foreignKey('teamId')
          .constraints(false);
      });
    });

    await expect(
      context.database.connection().collections.validateRelations(),
    ).resolves.toBeUndefined();
  });

  it('rejects a transaction whose completed relation graph is invalid', async () => {
    await expect(
      context.database.transaction(async (connection) => {
        await connection.builder.createCollection('articles', (collection) => {
          collection.increments('id');
          collection
            .hasMany('comments', 'missingComments')
            .sourceKey('id')
            .foreignKey('postId');
        });
      }),
    ).rejects.toMatchObject({
      code: 'COLLECTION_RELATION_VALIDATION_FAILED',
    });

    await expect(
      context.metadataStore.get('articles'),
    ).resolves.toBeUndefined();
  });

  it('enforces belongsTo foreign key constraints when requested', async () => {
    await context.builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('email').unique();
    });
    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .unsigned()
        .constraints(true)
        .index();
    });

    await context
      .db(context.table('customers'))
      .insert({ email: 'a@example.com' });
    await context.db(context.table('orders')).insert({ customer_id: 1 });
    await expectForeignKeyViolation(
      context.db(context.table('orders')).insert({ customer_id: 999 }),
    );

    expect(await listForeignKeys(context, context.table('orders'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: context.table('customers'),
          from: 'customer_id',
          to: 'id',
        }),
      ]),
    );
    expect(
      (await listIndexes(context, context.table('orders'))).map(
        (index) => index.name,
      ),
    ).toContain(context.indexName('orders', ['customer_id']));
  });

  it('keeps inverse relations as metadata without creating local columns', async () => {
    await context.builder.createCollection('profiles', (collection) => {
      collection.increments('id');
      collection.bigInt('customerId');
    });
    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.bigInt('customerId');
    });
    await context.builder.createCollection('products', (collection) => {
      collection.increments('id');
    });
    await context.builder.createCollection('orderProducts', (collection) => {
      collection.increments('id');
      collection.bigInt('customerId');
      collection.bigInt('productId');
    });
    await context.builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection
        .hasOne('profile', 'profiles')
        .sourceKey('id')
        .foreignKey('customerId');
      collection
        .hasMany('orders', 'orders')
        .sourceKey('id')
        .foreignKey('customerId');
      collection
        .belongsToMany('products', 'products')
        .sourceKey('id')
        .targetKey('id')
        .through('orderProducts')
        .foreignKey('customerId')
        .otherKey('productId');
    });

    expect(
      await context.db.schema.hasColumn(context.table('customers'), 'profile'),
    ).toBe(false);
    expect(
      await context.db.schema.hasColumn(context.table('customers'), 'orders'),
    ).toBe(false);
    expect(
      await context.db.schema.hasColumn(context.table('customers'), 'products'),
    ).toBe(false);

    const metadata = await context.metadataStore.get('customers');
    expect(metadata?.document.relations).toMatchObject({
      profile: { type: 'hasOne', target: 'profiles' },
      orders: { type: 'hasMany', target: 'orders' },
      products: { type: 'belongsToMany', target: 'products' },
    });
    expect(metadata?.document.fields).toEqual({ id: { type: 'integer' } });
  });

  it('uses deterministic physical columns for logical relation keys during alteration', async () => {
    const usersTable = context.table('users');

    await context.builder.createCollection('users', (collection) => {
      collection.integer('userId');
      collection.primary('userId');
    });
    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
    });

    await context.builder.alterCollection('orders', (collection) => {
      collection.integer('createdById');
      collection
        .belongsTo('createdBy', 'users')
        .foreignKey('createdById')
        .targetKey('userId')
        .constraints(true);
    });

    expect(
      await context.db.schema.hasColumn(
        context.table('orders'),
        'created_by_id',
      ),
    ).toBe(true);
    expect(await listForeignKeys(context, context.table('orders'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: usersTable,
          from: 'created_by_id',
          to: 'user_id',
        }),
      ]),
    );

    await context.db(usersTable).insert({ user_id: 1 });
    await context.db(context.table('orders')).insert({ created_by_id: 1 });
    await expectForeignKeyViolation(
      context.db(context.table('orders')).insert({ created_by_id: 999 }),
    );
  });
});

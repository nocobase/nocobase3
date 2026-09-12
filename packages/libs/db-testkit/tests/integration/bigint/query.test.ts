import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('query bigint', (context) => {
  it('returns a small integer in a bigint column as a string', async () => {
    const db = context.database;

    await context.builder.createCollection('queryBigints', (collection) => {
      collection.bigInt('id').primary().notNull();
      collection.string('name');
    });

    await db
      .query()
      .insertInto('queryBigints')
      .values({ id: 42, name: 'small integer' })
      .execute();

    const record = await db
      .query()
      .selectFrom('queryBigints')
      .selectAll()
      .where('id', '=', 42)
      .executeTakeFirstOrThrow();

    expect(record).toEqual({ id: '42', name: 'small integer' });
  });

  it('compares bigint and integer result types for the same small value', async () => {
    const db = context.database;

    await context.builder.createCollection(
      'queryIntegerComparison',
      (collection) => {
        collection.bigInt('id').primary().notNull();
        collection.integer('quantity');
      },
    );

    await db
      .query()
      .insertInto('queryIntegerComparison')
      .values({ id: 42, quantity: 42 })
      .execute();

    const record = await db
      .query()
      .selectFrom('queryIntegerComparison')
      .selectAll()
      .where('id', '=', 42)
      .executeTakeFirstOrThrow();

    expect(record).toEqual({
      id: '42',
      quantity: 42,
    });
  });

  it.each(['42', '9007199254740993'])(
    'preserves bigint %s and integer types with table and column aliases',
    async (id) => {
      const db = context.database;

      await context.builder.createCollection(
        'queryBigintAliases',
        (collection) => {
          collection.bigInt('id').primary().notNull();
          collection.integer('quantity');
        },
      );

      await db
        .query()
        .insertInto('queryBigintAliases')
        .values({ id, quantity: 42 })
        .execute();

      const record = await db
        .query()
        .selectFrom('queryBigintAliases as item')
        .select(['item.id as bigintValue', 'item.quantity as integerValue'])
        .where('item.id', '=', id)
        .executeTakeFirstOrThrow();

      expect(record).toEqual({ bigintValue: id, integerValue: 42 });
    },
  );

  it('inserts and reads an exact bigint value', async () => {
    const db = context.database;
    // Use a string from the beginning: this value exceeds Number.MAX_SAFE_INTEGER.
    const id = '9007199254740993';

    await context.builder.createCollection('queryBigints', (collection) => {
      collection.bigInt('id').primary().notNull();
      collection.string('name');
    });

    await db
      .query()
      .insertInto('queryBigints')
      .values({ id, name: 'example' })
      .execute();

    const record = await db
      .query()
      .selectFrom('queryBigints')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    expect(record).toEqual({ id, name: 'example' });
  });
});

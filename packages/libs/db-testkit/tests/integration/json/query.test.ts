import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('JSON query values', (context) => {
  it('creates JSON values through Query.insertInto', async () => {
    await context.builder.createCollection('jsonQueryCreate', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    const payloads = [
      { id: 'object', payload: { enabled: true, labels: ['one', 'two'] } },
      { id: 'array', payload: [1, false, { nested: 'value' }] },
      { id: 'string', payload: 'text' },
      { id: 'number', payload: 42.5 },
      { id: 'boolean', payload: true },
      { id: 'null', payload: null },
    ] as const;

    await expect(
      context.database
        .query()
        .insertInto('jsonQueryCreate')
        .values(payloads)
        .execute(),
    ).resolves.toMatchObject({ insertedCount: payloads.length });
  });

  it('reads JSON values through Query.selectFrom', async () => {
    await context.builder.createCollection('jsonQueryRead', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    const payloads = [
      { id: 'object', payload: { enabled: true, labels: ['one', 'two'] } },
      { id: 'array', payload: [1, false, { nested: 'value' }] },
      { id: 'string', payload: 'text' },
      { id: 'number', payload: 42.5 },
      { id: 'boolean', payload: true },
      { id: 'null', payload: null },
    ] as const;

    await context.database
      .query()
      .insertInto('jsonQueryRead')
      .values(payloads)
      .execute();

    expect(
      await context.database
        .query()
        .selectFrom('jsonQueryRead')
        .selectAll()
        .orderBy('id')
        .execute(),
    ).toEqual(
      [...payloads].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it('reads JSON values from scalar Query subqueries', async () => {
    await context.builder.createCollection(
      'jsonQuerySubqueryParents',
      (collection) => {
        collection.string('id').primary();
      },
    );
    await context.builder.createCollection(
      'jsonQuerySubqueryChildren',
      (collection) => {
        collection.increments('id');
        collection.string('parentId').notNull();
        collection.json('payload').nullable();
      },
    );

    await context.database
      .query()
      .insertInto('jsonQuerySubqueryParents')
      .values([{ id: 'first' }, { id: 'second' }])
      .execute();
    await context.database
      .query()
      .insertInto('jsonQuerySubqueryChildren')
      .values([
        { parentId: 'first', payload: { nested: true, values: [1, 2] } },
        { parentId: 'second', payload: ['nested', { value: 2 }] },
      ])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom('jsonQuerySubqueryParents')
        .select((eb) => [
          'id',
          eb
            .selectFrom('jsonQuerySubqueryChildren')
            .select('payload')
            .whereRef(
              'jsonQuerySubqueryChildren.parentId',
              '=',
              'jsonQuerySubqueryParents.id',
            )
            .orderBy('jsonQuerySubqueryChildren.id')
            .limit(1)
            .as('payload'),
        ])
        .orderBy('id')
        .execute(),
    ).resolves.toEqual([
      {
        id: 'first',
        payload: { nested: true, values: [1, 2] },
      },
      {
        id: 'second',
        payload: ['nested', { value: 2 }],
      },
    ]);
  });

  it('updates JSON values through Query.updateTable', async () => {
    await context.builder.createCollection('jsonQueryUpdate', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    await context.database
      .query()
      .insertInto('jsonQueryUpdate')
      .values({ id: 'A', payload: { version: 1 } })
      .execute();
    await context.database
      .query()
      .updateTable('jsonQueryUpdate')
      .set({ payload: { version: 2, changed: true } })
      .where('id', '=', 'A')
      .execute();

    expect(
      await context.database
        .query()
        .selectFrom('jsonQueryUpdate')
        .select(['id', 'payload'])
        .where('id', '=', 'A')
        .executeTakeFirst(),
    ).toEqual({
      id: 'A',
      payload: { version: 2, changed: true },
    });
  });
});

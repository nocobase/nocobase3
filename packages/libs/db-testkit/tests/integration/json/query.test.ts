import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { jsonFixtureRows, jsonValueFixtures } from './fixtures.js';

describeIntegrationDatabases('JSON query values', (context) => {
  it('creates JSON values through Query.insertInto', async () => {
    await context.builder.createCollection('jsonQueryCreate', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    const rows = jsonFixtureRows();
    await expect(
      context.database
        .query()
        .insertInto('jsonQueryCreate')
        .values(rows)
        .execute(),
    ).resolves.toMatchObject({ insertedCount: rows.length });

    // A row count says nothing about what was written. Reading the values back
    // is what makes a broken encoder fail here rather than in the next test.
    expect(
      await context.database
        .query()
        .selectFrom('jsonQueryCreate')
        .selectAll()
        .orderBy('id')
        .execute(),
    ).toEqual(rows);
  });

  it('reads JSON values through Query.selectFrom', async () => {
    await context.builder.createCollection('jsonQueryRead', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    await context.database
      .query()
      .insertInto('jsonQueryRead')
      .values(jsonFixtureRows())
      .execute();

    expect(
      await context.database
        .query()
        .selectFrom('jsonQueryRead')
        .selectAll()
        .orderBy('id')
        .execute(),
    ).toEqual(jsonFixtureRows());
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

    // Every form has to survive an update, not just the one it was inserted as.
    for (const fixture of jsonValueFixtures) {
      await context.database
        .query()
        .updateTable('jsonQueryUpdate')
        .set({ payload: fixture.payload })
        .where('id', '=', 'A')
        .execute();

      expect(
        await context.database
          .query()
          .selectFrom('jsonQueryUpdate')
          .select(['id', 'payload'])
          .where('id', '=', 'A')
          .executeTakeFirst(),
        `updateTable to ${fixture.id}`,
      ).toEqual({ id: 'A', payload: fixture.payload });
    }
  });
});

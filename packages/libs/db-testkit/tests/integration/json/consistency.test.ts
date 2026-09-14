import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { jsonFixtureRows } from './fixtures.js';

/**
 * Repository and Query encode and decode JSON through separate code paths, so
 * each one round-tripping its own writes proves nothing about the other. These
 * tests cross the paths: whatever one writes, the other has to read back
 * identically, in both directions.
 */
describeIntegrationDatabases('JSON path consistency', (context) => {
  it('reads Repository writes identically through Query', async () => {
    await context.builder.createCollection(
      'jsonConsistencyRepository',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    await context.database
      .repository('jsonConsistencyRepository')
      .createMany({ values: jsonFixtureRows() });

    const throughRepository = await context.database
      .repository('jsonConsistencyRepository')
      .findMany({ sort: (sort) => sort.field('id').asc() });
    const throughQuery = await context.database
      .query()
      .selectFrom('jsonConsistencyRepository')
      .select(['id', 'payload'])
      .orderBy('id')
      .execute();

    expect(throughQuery).toEqual(throughRepository);
    expect(throughQuery).toEqual(jsonFixtureRows());
  });

  it('reads Query writes identically through Repository', async () => {
    await context.builder.createCollection(
      'jsonConsistencyQuery',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    await context.database
      .query()
      .insertInto('jsonConsistencyQuery')
      .values(jsonFixtureRows())
      .execute();

    const throughRepository = await context.database
      .repository('jsonConsistencyQuery')
      .findMany({ sort: (sort) => sort.field('id').asc() });
    const throughQuery = await context.database
      .query()
      .selectFrom('jsonConsistencyQuery')
      .select(['id', 'payload'])
      .orderBy('id')
      .execute();

    expect(throughRepository).toEqual(throughQuery);
    expect(throughRepository).toEqual(jsonFixtureRows());
  });

  it('agrees on values a mutation returns and a later read produces', async () => {
    await context.builder.createCollection(
      'jsonConsistencyReturning',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonConsistencyReturning');
    // createOne and updateOne decode a RETURNING row, which is a third path
    // again — separate from both findMany and Query.
    for (const row of jsonFixtureRows()) {
      const created = await repository.createOne({ values: row });
      expect(
        await repository.findOne({ filter: { id: row.id } }),
        `createOne vs findOne for ${row.id}`,
      ).toEqual(created.record);

      const updated = await repository.updateOne({
        filter: { id: row.id },
        values: { payload: row.payload },
      });
      expect(
        await repository.findOne({ filter: { id: row.id } }),
        `updateOne vs findOne for ${row.id}`,
      ).toEqual(updated.record);
    }
  });
});

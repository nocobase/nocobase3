import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Boolean query values', (context) => {
  it('inserts, selects, filters, and updates boolean values through Query', async () => {
    await context.builder.createCollection('booleanQueryValues', (c) => {
      c.string('id').primary();
      c.boolean('enabled').nullable();
    });

    const values = [
      { id: 'true', enabled: true },
      { id: 'false', enabled: false },
      { id: 'null', enabled: null },
    ] as const;
    await expect(
      context.database
        .query()
        .insertInto('booleanQueryValues')
        .values(values)
        .execute(),
    ).resolves.toMatchObject({ insertedCount: 3 });

    await expect(
      context.database
        .query()
        .selectFrom('booleanQueryValues')
        .selectAll()
        .orderBy('id')
        .execute(),
    ).resolves.toEqual([values[1], values[2], values[0]]);
    await expect(
      context.database
        .query()
        .selectFrom('booleanQueryValues')
        .select(['id', 'enabled'])
        .where('enabled', '=', false)
        .execute(),
    ).resolves.toEqual([{ id: 'false', enabled: false }]);

    await expect(
      context.database
        .query()
        .updateTable('booleanQueryValues')
        .set({ enabled: true })
        .where('id', '=', 'false')
        .execute(),
    ).resolves.toEqual({ updatedCount: 1 });
    await expect(
      context.database
        .query()
        .selectFrom('booleanQueryValues')
        .select('enabled')
        .where('id', '=', 'false')
        .value<boolean>('enabled'),
    ).resolves.toBe(true);
  });

  it('selects boolean fields through aliases and scalar subqueries', async () => {
    await context.builder.createCollection('booleanQueryParents', (c) => {
      c.string('id').primary();
      c.boolean('enabled').nullable();
    });
    await context.builder.createCollection('booleanQueryChildren', (c) => {
      c.increments('id');
      c.string('parentId').notNull();
      c.boolean('enabled').nullable();
    });

    await context.database
      .query()
      .insertInto('booleanQueryParents')
      .values([
        { id: 'first', enabled: true },
        { id: 'second', enabled: false },
      ])
      .execute();
    await context.database
      .query()
      .insertInto('booleanQueryChildren')
      .values([
        { parentId: 'first', enabled: false },
        { parentId: 'second', enabled: null },
      ])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom('booleanQueryParents')
        .select((eb) => [
          'enabled',
          eb
            .selectFrom('booleanQueryChildren')
            .select('enabled')
            .whereRef(
              'booleanQueryChildren.parentId',
              '=',
              'booleanQueryParents.id',
            )
            .orderBy('booleanQueryChildren.id')
            .limit(1)
            .as('childEnabled'),
        ])
        .orderBy('booleanQueryParents.id')
        .execute(),
    ).resolves.toEqual([
      { enabled: true, childEnabled: false },
      { enabled: false, childEnabled: null },
    ]);
  });
});

import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

const values = {
  day: '2026-09-06',
  clock: '09:30:00.120',
  local: '2026-09-06T09:30:00.120',
  instant: '2026-09-06T01:30:00.120Z',
} as const;

describeIntegrationDatabases('Temporal query values', (context) => {
  async function createCollection(name: string): Promise<void> {
    await context.builder.createCollection(name, (collection) => {
      collection.string('id').primary();
      collection.date('day').nullable();
      collection.time('clock').nullable();
      collection.datetime('local').nullable();
      collection.datetimeTz('instant').nullable();
    });
  }

  it('inserts, selects, and updates temporal values through Query', async () => {
    await createCollection('temporalQueryValues');

    await expect(
      context.database
        .query()
        .insertInto('temporalQueryValues')
        .values([
          { id: 'full', ...values },
          { id: 'empty', day: null, clock: null, local: null, instant: null },
        ])
        .execute(),
    ).resolves.toMatchObject({ insertedCount: 2 });

    await expect(
      context.database
        .query()
        .selectFrom('temporalQueryValues')
        .selectAll()
        .orderBy('id')
        .execute(),
    ).resolves.toEqual([
      { id: 'empty', day: null, clock: null, local: null, instant: null },
      { id: 'full', ...values },
    ]);

    await expect(
      context.database
        .query()
        .updateTable('temporalQueryValues')
        .set({
          day: '2026-09-07',
          clock: '10:00:00',
          local: '2026-09-07T10:00:00',
          instant: '2026-09-07T02:00:00Z',
        })
        .where('id', '=', 'empty')
        .execute(),
    ).resolves.toEqual({ updatedCount: 1 });

    await expect(
      context.database
        .query()
        .selectFrom('temporalQueryValues')
        .select(['day', 'clock', 'local', 'instant'])
        .where('id', '=', 'empty')
        .executeTakeFirst(),
    ).resolves.toEqual({
      day: '2026-09-07',
      clock: '10:00:00.000',
      local: '2026-09-07T10:00:00.000',
      instant: '2026-09-07T02:00:00.000Z',
    });
  });

  it('accepts local Date values for date, time, and datetime mutations', async () => {
    await createCollection('temporalQueryLocalDates');
    const created = new Date(2026, 8, 6, 9, 30, 0, 120);

    await expect(
      context.database
        .query()
        .insertInto('temporalQueryLocalDates')
        .values({
          id: 'local-date',
          day: created,
          clock: created,
          local: created,
        })
        .execute(),
    ).resolves.toMatchObject({ insertedCount: 1 });

    const updated = new Date(2026, 8, 7, 10, 45, 1, 456);
    await expect(
      context.database
        .query()
        .updateTable('temporalQueryLocalDates')
        .set({ day: updated, clock: updated, local: updated })
        .where('id', '=', 'local-date')
        .execute(),
    ).resolves.toEqual({ updatedCount: 1 });

    await expect(
      context.database
        .query()
        .selectFrom('temporalQueryLocalDates')
        .select(['day', 'clock', 'local'])
        .where('id', '=', 'local-date')
        .executeTakeFirst(),
    ).resolves.toEqual({
      day: '2026-09-07',
      clock: '10:45:01.456',
      local: '2026-09-07T10:45:01.456',
    });
  });

  it('selects temporal fields through aliases and scalar subqueries', async () => {
    await context.builder.createCollection(
      'temporalQueryParents',
      (collection) => {
        collection.string('id').primary();
        collection.datetimeTz('instant').nullable();
      },
    );
    await context.builder.createCollection(
      'temporalQueryChildren',
      (collection) => {
        collection.increments('id');
        collection.string('parentId').notNull();
        collection.datetime('local').nullable();
      },
    );

    await context.database
      .query()
      .insertInto('temporalQueryParents')
      .values([{ id: 'first', instant: values.instant }])
      .execute();
    await context.database
      .query()
      .insertInto('temporalQueryChildren')
      .values([{ parentId: 'first', local: values.local }])
      .execute();

    await expect(
      context.database
        .query()
        .selectFrom('temporalQueryParents')
        .select((eb) => [
          'instant as parentInstant',
          eb
            .selectFrom('temporalQueryChildren')
            .select('local')
            .whereRef(
              'temporalQueryChildren.parentId',
              '=',
              'temporalQueryParents.id',
            )
            .orderBy('temporalQueryChildren.id')
            .limit(1)
            .as('childLocal'),
        ])
        .execute(),
    ).resolves.toEqual([
      { parentInstant: values.instant, childLocal: values.local },
    ]);
  });
});

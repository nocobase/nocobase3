import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

/**
 * `datetime` is a wall-clock type, so a value carrying a zone offset is converted to the host's local reading
 * of the instant it names rather than refused. `datetimeTz` keeps the instant itself.
 *
 * Expectations are computed from the instant instead of written out, so the suite asserts the same contract in
 * every TZ a developer or CI runner happens to be in.
 */
function localDatetime(instant: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}.${String(instant.getMilliseconds()).padStart(3, '0')}`;
}

// One instant written three ways: UTC, a non-UTC offset, and a Date. All three must store the same thing.
const utc = '2026-09-06T09:30:00.120Z';
const offset = '2026-09-06T17:30:00.120+08:00';
const date = new Date(utc);
const local = localDatetime(date);

const later = '2026-09-07T22:45:01.456Z';
const laterDate = new Date(later);
const laterLocal = localDatetime(laterDate);

describeIntegrationDatabases('Temporal zone offsets', (context) => {
  async function createCollection(name: string): Promise<void> {
    await context.builder.createCollection(name, (collection) => {
      collection.string('id').primary();
      collection.datetime('fromUtc').nullable();
      collection.datetime('fromOffset').nullable();
      collection.datetime('fromDate').nullable();
      collection.datetimeTz('instant').nullable();
    });
  }

  const written = {
    fromUtc: utc,
    fromOffset: offset,
    fromDate: date,
    instant: utc,
  } as const;
  const stored = {
    fromUtc: local,
    fromOffset: local,
    fromDate: local,
    instant: utc,
  } as const;
  const fields = ['fromUtc', 'fromOffset', 'fromDate', 'instant'] as const;

  it('stores offset-bearing and Date values as the same local datetime through Repository.createOne', async () => {
    await createCollection('temporalOffsetCreateOne');
    const repository = context.database.repository('temporalOffsetCreateOne');

    await expect(
      repository.createOne({
        values: { id: 'created', ...written },
        select: (select) => select.fields('id', ...fields),
      }),
    ).resolves.toMatchObject({ record: { id: 'created', ...stored } });

    // The same value read back on its own, so the assertion is about storage rather than the write's echo.
    await expect(
      repository.findOne({
        filter: { id: 'created' },
        select: (select) => select.fields(...fields),
      }),
    ).resolves.toEqual(stored);
  });

  it('converts offset-bearing and Date values through Repository.updateOne', async () => {
    await createCollection('temporalOffsetUpdateOne');
    const repository = context.database.repository('temporalOffsetUpdateOne');
    await repository.createOne({ values: { id: 'updated' } });

    await expect(
      repository.updateOne({
        filter: { id: 'updated' },
        values: {
          fromUtc: later,
          fromOffset: '2026-09-08T06:45:01.456+08:00',
          fromDate: laterDate,
          instant: later,
        },
        select: (select) => select.fields(...fields),
      }),
    ).resolves.toMatchObject({
      record: {
        fromUtc: laterLocal,
        fromOffset: laterLocal,
        fromDate: laterLocal,
        instant: later,
      },
    });
  });

  it('converts offset-bearing and Date values through Repository.createMany and updateMany', async () => {
    await context.builder.createCollection(
      'temporalOffsetBulk',
      (collection) => {
        collection.string('id').primary();
        collection.string('group').notNull();
        collection.datetime('fromUtc').nullable();
        collection.datetime('fromOffset').nullable();
        collection.datetime('fromDate').nullable();
        collection.datetimeTz('instant').nullable();
      },
    );
    const repository = context.database.repository('temporalOffsetBulk');

    await expect(
      repository.createMany({
        values: [
          { id: 'first', group: 'selected', ...written },
          { id: 'second', group: 'selected', ...written },
        ],
        select: (select) => select.fields('id', ...fields),
      }),
    ).resolves.toEqual({
      createdCount: 2,
      records: [
        { id: 'first', ...stored },
        { id: 'second', ...stored },
      ],
    });

    await expect(
      repository.updateMany({
        filter: { group: 'selected' },
        values: {
          fromUtc: later,
          fromOffset: '2026-09-08T06:45:01.456+08:00',
          fromDate: laterDate,
          instant: later,
        },
        select: (select) => select.fields('id', ...fields),
      }),
    ).resolves.toEqual({
      updatedCount: 2,
      records: [
        {
          id: 'first',
          fromUtc: laterLocal,
          fromOffset: laterLocal,
          fromDate: laterLocal,
          instant: later,
        },
        {
          id: 'second',
          fromUtc: laterLocal,
          fromOffset: laterLocal,
          fromDate: laterLocal,
          instant: later,
        },
      ],
    });
  });

  it('converts offset-bearing and Date values in both halves of Repository.upsertOne', async () => {
    await createCollection('temporalOffsetUpsert');
    const repository = context.database.repository('temporalOffsetUpsert');

    // The create half: no row matches the filter yet.
    await expect(
      repository.upsertOne({
        filter: { id: 'upserted' },
        create: { id: 'upserted', ...written },
        update: { fromUtc: later },
        select: (select) => select.fields('id', ...fields),
      }),
    ).resolves.toMatchObject({ record: { id: 'upserted', ...stored } });

    // The update half: the same call now finds the row it just created.
    await expect(
      repository.upsertOne({
        filter: { id: 'upserted' },
        create: { id: 'upserted', ...written },
        update: {
          fromUtc: later,
          fromOffset: '2026-09-08T06:45:01.456+08:00',
          fromDate: laterDate,
          instant: later,
        },
        select: (select) => select.fields('id', ...fields),
      }),
    ).resolves.toMatchObject({
      record: {
        id: 'upserted',
        fromUtc: laterLocal,
        fromOffset: laterLocal,
        fromDate: laterLocal,
        instant: later,
      },
    });
  });

  it('converts offset-bearing and Date values through Query insert and update', async () => {
    await createCollection('temporalOffsetQuery');

    await expect(
      context.database
        .query()
        .insertInto('temporalOffsetQuery')
        .values({ id: 'inserted', ...written })
        .execute(),
    ).resolves.toMatchObject({ insertedCount: 1 });

    await expect(
      context.database
        .query()
        .selectFrom('temporalOffsetQuery')
        .select([...fields])
        .where('id', '=', 'inserted')
        .executeTakeFirst(),
    ).resolves.toEqual(stored);

    await expect(
      context.database
        .query()
        .updateTable('temporalOffsetQuery')
        .set({
          fromUtc: later,
          fromOffset: '2026-09-08T06:45:01.456+08:00',
          fromDate: laterDate,
          instant: later,
        })
        .where('id', '=', 'inserted')
        .execute(),
    ).resolves.toEqual({ updatedCount: 1 });

    await expect(
      context.database
        .query()
        .selectFrom('temporalOffsetQuery')
        .select([...fields])
        .where('id', '=', 'inserted')
        .executeTakeFirst(),
    ).resolves.toEqual({
      fromUtc: laterLocal,
      fromOffset: laterLocal,
      fromDate: laterLocal,
      instant: later,
    });
  });
});

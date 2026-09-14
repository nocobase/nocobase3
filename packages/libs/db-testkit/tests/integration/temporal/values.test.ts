import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

const values = {
  day: '2026-09-06',
  clock: '09:30:00.120',
  local: '2026-09-06T09:30:00.120',
  instant: '2026-09-06T01:30:00.120Z',
} as const;

describeIntegrationDatabases('Temporal field values', (context) => {
  async function createCollection(name: string): Promise<void> {
    await context.builder.createCollection(name, (collection) => {
      collection.string('id').primary();
      collection.date('day').nullable();
      collection.time('clock').nullable();
      collection.datetime('local').nullable();
      collection.datetimeTz('instant').nullable();
    });
  }

  it('creates and reads temporal values through Repository.createOne and findOne', async () => {
    await createCollection('temporalRepositoryCreate');
    const repository = context.database.repository('temporalRepositoryCreate');

    await expect(
      repository.createOne({
        values: { id: 'full', ...values },
        select: (select) =>
          select.fields('id', 'day', 'clock', 'local', 'instant'),
      }),
    ).resolves.toMatchObject({
      record: { id: 'full', ...values },
    });

    await expect(
      repository.createOne({
        values: {
          id: 'nulls',
          day: null,
          clock: null,
          local: null,
          instant: null,
        },
      }),
    ).resolves.toMatchObject({
      record: {
        id: 'nulls',
        day: null,
        clock: null,
        local: null,
        instant: null,
      },
    });
  });

  it('accepts local Date values for date, time, and datetime mutations', async () => {
    await createCollection('temporalRepositoryLocalDates');
    const repository = context.database.repository(
      'temporalRepositoryLocalDates',
    );
    const created = new Date(2026, 8, 6, 9, 30, 0, 120);

    await expect(
      repository.createOne({
        values: {
          id: 'local-date',
          day: created,
          clock: created,
          local: created,
        },
        select: (select) => select.fields('id', 'day', 'clock', 'local'),
      }),
    ).resolves.toMatchObject({
      record: {
        id: 'local-date',
        day: '2026-09-06',
        clock: '09:30:00.120',
        local: '2026-09-06T09:30:00.120',
      },
    });

    const updated = new Date(2026, 8, 7, 10, 45, 1, 456);
    await expect(
      repository.updateOne({
        filter: { id: 'local-date' },
        values: { day: updated, clock: updated, local: updated },
        select: (select) => select.fields('day', 'clock', 'local'),
      }),
    ).resolves.toMatchObject({
      record: {
        day: '2026-09-07',
        clock: '10:45:01.456',
        local: '2026-09-07T10:45:01.456',
      },
    });
  });

  it('creates and updates multiple temporal values through Repository bulk methods', async () => {
    await context.builder.createCollection(
      'temporalRepositoryBulk',
      (collection) => {
        collection.string('id').primary();
        collection.string('group').notNull();
        collection.date('day').nullable();
        collection.time('clock').nullable();
        collection.datetime('local').nullable();
        collection.datetimeTz('instant').nullable();
      },
    );
    const repository = context.database.repository('temporalRepositoryBulk');

    await expect(
      repository.createMany({
        values: [
          { id: 'first', group: 'selected', ...values },
          {
            id: 'second',
            group: 'selected',
            day: '2026-09-07',
            clock: '10:00:00',
            local: '2026-09-07T10:00:00',
            instant: '2026-09-07T02:00:00Z',
          },
          {
            id: 'third',
            group: 'untouched',
            day: null,
            clock: null,
            local: null,
            instant: null,
          },
        ],
        select: (select) => select.fields('id', 'instant'),
      }),
    ).resolves.toEqual({
      createdCount: 3,
      records: [
        { id: 'first', instant: values.instant },
        { id: 'second', instant: '2026-09-07T02:00:00.000Z' },
        { id: 'third', instant: null },
      ],
    });

    await expect(
      repository.updateMany({
        filter: { group: 'selected' },
        values: {
          day: '2026-09-08',
          clock: '11:15:00',
          local: '2026-09-08T11:15:00',
          instant: '2026-09-08T03:15:00Z',
        },
        select: (select) =>
          select.fields('id', 'day', 'clock', 'local', 'instant'),
      }),
    ).resolves.toEqual({
      updatedCount: 2,
      records: [
        {
          id: 'first',
          day: '2026-09-08',
          clock: '11:15:00.000',
          local: '2026-09-08T11:15:00.000',
          instant: '2026-09-08T03:15:00.000Z',
        },
        {
          id: 'second',
          day: '2026-09-08',
          clock: '11:15:00.000',
          local: '2026-09-08T11:15:00.000',
          instant: '2026-09-08T03:15:00.000Z',
        },
      ],
    });
  });

  it('reads temporal values through Repository.findMany with canonical precision', async () => {
    await createCollection('temporalRepositoryRead');
    const repository = context.database.repository('temporalRepositoryRead');
    await repository.createMany({
      values: [
        { id: 'full', ...values },
        { id: 'empty', day: null, clock: null, local: null, instant: null },
      ],
    });

    await expect(
      repository.findOne({ filter: { id: 'full' } }),
    ).resolves.toEqual({ id: 'full', ...values });
    await expect(
      repository.findMany({ sort: (sort) => sort.field('id').asc() }),
    ).resolves.toEqual([
      { id: 'empty', day: null, clock: null, local: null, instant: null },
      { id: 'full', ...values },
    ]);
  });
});

import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('JSON field values', (context) => {
  it('creates JSON values through Repository.createOne', async () => {
    await context.builder.createCollection(
      'jsonRepositoryCreate',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryCreate');
    const values = [
      { id: 'object', payload: { enabled: true, labels: ['one', 'two'] } },
      { id: 'array', payload: [1, false, { nested: 'value' }] },
      { id: 'string', payload: 'text' },
      { id: 'number', payload: 42.5 },
      { id: 'boolean', payload: true },
      { id: 'database-null', payload: null },
    ] as const;

    for (const value of values) {
      const created = await repository.createOne({ values: value });
      expect(created.record.payload).toEqual(value.payload);
    }
  });

  it('creates multiple JSON values through Repository.createMany', async () => {
    await context.builder.createCollection(
      'jsonRepositoryCreateMany',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryCreateMany');
    const values = [
      { id: 'object', payload: { enabled: true, labels: ['one', 'two'] } },
      { id: 'array', payload: [1, false, { nested: 'value' }] },
      { id: 'string', payload: 'text' },
      { id: 'number', payload: 42.5 },
      { id: 'boolean', payload: true },
      { id: 'database-null', payload: null },
    ] as const;

    await expect(repository.createMany({ values })).resolves.toMatchObject({
      createdCount: values.length,
    });
    expect(
      await repository.findMany({
        sort: (sort) => sort.field('id').asc(),
      }),
    ).toEqual(
      [...values].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it('reads JSON values through Repository.findOne and findMany', async () => {
    await context.builder.createCollection(
      'jsonRepositoryRead',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryRead');
    const values = [
      { id: 'object', payload: { enabled: true, labels: ['one', 'two'] } },
      { id: 'array', payload: [1, false, { nested: 'value' }] },
      { id: 'string', payload: 'text' },
      { id: 'number', payload: 42.5 },
      { id: 'boolean', payload: true },
      { id: 'database-null', payload: null },
    ] as const;
    for (const value of values) {
      await repository.createOne({ values: value });
    }

    expect(await repository.findOne({ filter: { id: 'object' } })).toEqual(
      values[0],
    );

    expect(
      (
        await repository.findMany({
          sort: (s) => s.field('id').asc(),
        })
      ).map((row) => ({
        id: row.id,
        payload: row.payload,
      })),
    ).toEqual(
      values
        .map((value) => ({
          id: value.id,
          payload: value.payload,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it('updates JSON values through Repository.updateOne', async () => {
    await context.builder.createCollection(
      'jsonRepositoryUpdate',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryUpdate');
    await repository.createOne({
      values: { id: 'first', payload: { version: 1 } },
    });

    const updated = await repository.updateOne({
      filter: { id: 'first' },
      values: { payload: { version: 2, changed: true } },
    });
    expect(updated.record).toEqual({
      id: 'first',
      payload: { version: 2, changed: true },
    });

    expect(await repository.findOne({ filter: { id: 'first' } })).toEqual({
      id: 'first',
      payload: { version: 2, changed: true },
    });
  });

  it('updates multiple JSON values through Repository.updateMany', async () => {
    await context.builder.createCollection(
      'jsonRepositoryUpdateMany',
      (collection) => {
        collection.string('id').primary();
        collection.string('group').notNull();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryUpdateMany');
    await repository.createMany({
      values: [
        { id: 'first', group: 'selected', payload: { version: 1 } },
        { id: 'second', group: 'selected', payload: ['before', 2] },
        { id: 'third', group: 'untouched', payload: { version: 1 } },
      ],
    });

    await expect(
      repository.updateMany({
        filter: { group: 'selected' },
        values: { payload: { version: 2, changed: true } },
      }),
    ).resolves.toMatchObject({ updatedCount: 2 });

    expect(
      await repository.findMany({
        sort: (sort) => sort.field('id').asc(),
      }),
    ).toEqual([
      {
        id: 'first',
        group: 'selected',
        payload: { version: 2, changed: true },
      },
      {
        id: 'second',
        group: 'selected',
        payload: { version: 2, changed: true },
      },
      {
        id: 'third',
        group: 'untouched',
        payload: { version: 1 },
      },
    ]);
  });
});

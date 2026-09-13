import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Boolean field values', (context) => {
  it('creates boolean values through Repository.createOne', async () => {
    await context.builder.createCollection('booleanRepositoryCreate', (c) => {
      c.string('id').primary();
      c.boolean('enabled').nullable();
    });

    const repository = context.database.repository('booleanRepositoryCreate');
    await expect(
      repository.createOne({
        values: { id: 'true', enabled: true },
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toMatchObject({ record: { id: 'true', enabled: true } });
    await expect(
      repository.createOne({
        values: { id: 'false', enabled: false },
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toMatchObject({ record: { id: 'false', enabled: false } });
    await expect(
      repository.createOne({
        values: { id: 'null', enabled: null },
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toMatchObject({ record: { id: 'null', enabled: null } });
  });

  it('creates multiple boolean values through Repository.createMany', async () => {
    await context.builder.createCollection(
      'booleanRepositoryCreateMany',
      (c) => {
        c.string('id').primary();
        c.boolean('enabled').nullable();
      },
    );

    const repository = context.database.repository(
      'booleanRepositoryCreateMany',
    );
    const values = [
      { id: 'true', enabled: true },
      { id: 'false', enabled: false },
      { id: 'null', enabled: null },
    ] as const;

    await expect(
      repository.createMany({
        values,
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toEqual({ createdCount: 3, records: values });
  });

  it('reads boolean values through Repository.findOne and findMany', async () => {
    await context.builder.createCollection('booleanRepositoryRead', (c) => {
      c.string('id').primary();
      c.boolean('enabled').nullable();
    });

    const repository = context.database.repository('booleanRepositoryRead');
    const values = [
      { id: 'true', enabled: true },
      { id: 'false', enabled: false },
      { id: 'null', enabled: null },
    ] as const;
    await repository.createMany({ values });

    await expect(
      repository.findOne({ filter: { id: 'false' } }),
    ).resolves.toEqual(values[1]);
    await expect(
      repository.findMany({
        sort: (sort) => sort.field('id').asc(),
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toEqual([values[1], values[2], values[0]]);
  });

  it('updates boolean values through Repository.updateOne', async () => {
    await context.builder.createCollection('booleanRepositoryUpdate', (c) => {
      c.string('id').primary();
      c.boolean('enabled').nullable();
    });

    const repository = context.database.repository('booleanRepositoryUpdate');
    await repository.createOne({ values: { id: 'first', enabled: true } });

    await expect(
      repository.updateOne({
        filter: { id: 'first' },
        values: { enabled: false },
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toMatchObject({ record: { id: 'first', enabled: false } });
    await expect(
      repository.updateOne({
        filter: { id: 'first' },
        values: { enabled: null },
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toMatchObject({ record: { id: 'first', enabled: null } });
  });

  it('updates multiple boolean values through Repository.updateMany', async () => {
    await context.builder.createCollection(
      'booleanRepositoryUpdateMany',
      (c) => {
        c.string('id').primary();
        c.string('group').notNull();
        c.boolean('enabled').nullable();
      },
    );

    const repository = context.database.repository(
      'booleanRepositoryUpdateMany',
    );
    await repository.createMany({
      values: [
        { id: 'first', group: 'selected', enabled: true },
        { id: 'second', group: 'selected', enabled: null },
        { id: 'third', group: 'untouched', enabled: false },
      ],
    });

    await expect(
      repository.updateMany({
        filter: { group: 'selected' },
        values: { enabled: false },
        select: (select) => select.fields('id', 'enabled'),
      }),
    ).resolves.toEqual({
      updatedCount: 2,
      records: [
        { id: 'first', enabled: false },
        { id: 'second', enabled: false },
      ],
    });
    await expect(
      repository.findOne({ filter: { id: 'third' } }),
    ).resolves.toEqual({
      id: 'third',
      group: 'untouched',
      enabled: false,
    });
  });
});

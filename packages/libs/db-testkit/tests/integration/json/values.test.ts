import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { jsonFixtureRows, jsonValueFixtures } from './fixtures.js';

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
    for (const fixture of jsonValueFixtures) {
      const created = await repository.createOne({ values: { ...fixture } });
      expect(created.record.payload, `createOne ${fixture.id}`).toEqual(
        fixture.payload,
      );
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
    await expect(
      repository.createMany({ values: jsonFixtureRows() }),
    ).resolves.toMatchObject({ createdCount: jsonValueFixtures.length });
    expect(
      await repository.findMany({ sort: (sort) => sort.field('id').asc() }),
    ).toEqual(jsonFixtureRows());
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
    await repository.createMany({ values: jsonFixtureRows() });

    for (const fixture of jsonValueFixtures) {
      expect(
        await repository.findOne({ filter: { id: fixture.id } }),
        `findOne ${fixture.id}`,
      ).toEqual({ id: fixture.id, payload: fixture.payload });
    }

    expect(
      await repository.findMany({ sort: (s) => s.field('id').asc() }),
    ).toEqual(jsonFixtureRows());
  });

  it('streams JSON values through Repository.findMany consumption', async () => {
    await context.builder.createCollection(
      'jsonRepositoryStream',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryStream');
    await repository.createMany({ values: jsonFixtureRows() });

    const streamed: unknown[] = [];
    for await (const row of repository.findMany({
      sort: (sort) => sort.field('id').asc(),
    })) {
      streamed.push(row);
    }
    expect(streamed).toEqual(jsonFixtureRows());
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

    // Every form has to survive an update, not just the one it was created as.
    for (const fixture of jsonValueFixtures) {
      const updated = await repository.updateOne({
        filter: { id: 'first' },
        values: { payload: fixture.payload },
      });
      expect(updated.record, `updateOne to ${fixture.id}`).toEqual({
        id: 'first',
        payload: fixture.payload,
      });
      expect(
        await repository.findOne({ filter: { id: 'first' } }),
        `read back ${fixture.id}`,
      ).toEqual({ id: 'first', payload: fixture.payload });
    }
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

  it('upserts JSON values through Repository.upsertOne', async () => {
    await context.builder.createCollection(
      'jsonRepositoryUpsert',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonRepositoryUpsert');
    await expect(
      repository.upsertOne({
        filter: { id: 'only' },
        create: { id: 'only', payload: { created: true } },
        update: { payload: { updated: true } },
      }),
    ).resolves.toMatchObject({ record: { payload: { created: true } } });

    await expect(
      repository.upsertOne({
        filter: { id: 'only' },
        create: { id: 'only', payload: { created: true } },
        update: { payload: ['updated', { n: 2 }] },
      }),
    ).resolves.toMatchObject({ record: { payload: ['updated', { n: 2 }] } });
  });

  it('reports stored text that is not valid JSON', async () => {
    await context.builder.createCollection(
      'jsonRepositoryCorrupt',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    // Written outside the API, which is the only way a JSON column can hold
    // text that does not parse. A driver that parses JSON itself rejects the
    // write instead, so the row can only exist where the column is text.
    try {
      await context
        .db(context.table('jsonRepositoryCorrupt'))
        .insert({ id: 'broken', payload: 'not json' });
    } catch {
      return;
    }

    await expect(
      context.database
        .repository('jsonRepositoryCorrupt')
        .findOne({ filter: { id: 'broken' } }),
    ).rejects.toMatchObject({ code: 'INVALID_STORED_VALUE' });
  });
});

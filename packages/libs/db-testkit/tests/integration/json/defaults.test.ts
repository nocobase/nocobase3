import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

/**
 * A JSON default goes through the schema builder rather than the write path.
 *
 * Only structured defaults are covered, because only they are portable. MySQL
 * rejects every literal default on a json column, and Knex works around that
 * by compiling an object or an array to the expression form `default ('...')`.
 * A scalar has no such form, so a scalar JSON default is not expressible
 * across dialects and nothing declares one.
 */
describeIntegrationDatabases('JSON field defaults', (context) => {
  it.runIf(context.profile.json.defaults !== 'unsupported')(
    'applies structured JSON defaults',
    async () => {
      await context.builder.createCollection('jsonDefaults', (collection) => {
        collection.string('id').primary();
        collection.json('object').notNull().defaultTo({ enabled: true });
        collection.json('array').notNull().defaultTo([1, 'two']);
        collection.json('emptyObject').notNull().defaultTo({});
        collection.json('emptyArray').notNull().defaultTo([]);
        collection
          .json('nested')
          .notNull()
          .defaultTo({ a: { b: [1, null] } });
      });

      const repository = context.database.repository('jsonDefaults');
      const created = await repository.createOne({ values: { id: 'a' } });
      const expected = {
        id: 'a',
        object: { enabled: true },
        array: [1, 'two'],
        emptyObject: {},
        emptyArray: [],
        nested: { a: { b: [1, null] } },
      };
      expect(created.record).toEqual(expected);
      expect(await repository.findOne({ filter: { id: 'a' } })).toEqual(
        expected,
      );

      // The resolved definition reports the same documents the Builder was
      // given, not the SQL literal text the catalog stores them as.
      const resolved = await context.database
        .connection()
        .collections.get('jsonDefaults');
      const defaults = Object.fromEntries(
        (resolved?.fields ?? [])
          .filter((field) => field.name !== 'id')
          .map((field) => [field.name, field.defaultValue]),
      );
      const { id: _id, ...expectedDefaults } = expected;
      expect(defaults).toEqual(expectedDefaults);
    },
  );

  it.runIf(context.profile.json.defaults !== 'unsupported')(
    'lets a written value override a JSON default',
    async () => {
      await context.builder.createCollection(
        'jsonDefaultOverride',
        (collection) => {
          collection.string('id').primary();
          collection.json('payload').notNull().defaultTo({ from: 'default' });
        },
      );

      // One row at a time: a bulk insert writes a uniform column list, so an
      // omitted column becomes an explicit NULL rather than taking the default.
      const repository = context.database.repository('jsonDefaultOverride');
      await repository.createOne({ values: { id: 'default' } });
      await repository.createOne({
        values: { id: 'written', payload: { from: 'caller' } },
      });

      expect(
        await repository.findMany({ sort: (sort) => sort.field('id').asc() }),
      ).toEqual([
        { id: 'default', payload: { from: 'default' } },
        { id: 'written', payload: { from: 'caller' } },
      ]);
    },
  );

  it.runIf(context.profile.json.defaults !== 'unsupported')(
    'applies a default declared through the field options',
    async () => {
      // `.defaultTo(v)` and `{ defaultValue: v }` set the same field, but the
      // options form is the one collection definitions actually use.
      await context.builder.createCollection(
        'jsonOptionDefaults',
        (collection) => {
          collection.string('id').primary();
          collection
            .json('modelOptions', {
              defaultValue: {
                temperature: 1,
                topP: 1,
                frequencyPenalty: 0,
                presencePenalty: 0,
              },
            })
            .notNull();
          collection
            .json('enabledModels', {
              defaultValue: { mode: 'provider', models: [] },
            })
            .notNull();
          collection.json('args', { defaultValue: [] }).notNull();
        },
      );

      const repository = context.database.repository('jsonOptionDefaults');
      const expected = {
        id: 'a',
        modelOptions: {
          temperature: 1,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        enabledModels: { mode: 'provider', models: [] },
        args: [],
      };
      expect(
        (await repository.createOne({ values: { id: 'a' } })).record,
      ).toEqual(expected);
      expect(await repository.findOne({ filter: { id: 'a' } })).toEqual(
        expected,
      );
    },
  );

  it.runIf(context.profile.json.defaults !== 'unsupported')(
    'keeps a JSON default usable after the column is altered',
    async () => {
      await context.builder.createCollection(
        'jsonAlteredDefault',
        (collection) => {
          collection.string('id').primary();
          collection.json('payload').nullable();
        },
      );

      // Redefining a JSON column is where a type whose definition carries a
      // constraint can ask the engine for that constraint a second time.
      await context.builder.alterField('jsonAlteredDefault', 'payload', {
        type: 'json',
        nullable: false,
        defaultValue: { mode: 'provider', models: [] },
      });

      await expect(
        context.metadataStore.get('jsonAlteredDefault'),
      ).resolves.toMatchObject({
        document: { fields: { payload: { type: 'json' } } },
      });

      const repository = context.database.repository('jsonAlteredDefault');
      await repository.createOne({ values: { id: 'a' } });
      expect(await repository.findOne({ filter: { id: 'a' } })).toEqual({
        id: 'a',
        payload: { mode: 'provider', models: [] },
      });

      await repository.createOne({
        values: { id: 'b', payload: { mode: 'custom', models: ['x'] } },
      });
      expect(await repository.findOne({ filter: { id: 'b' } })).toEqual({
        id: 'b',
        payload: { mode: 'custom', models: ['x'] },
      });
    },
  );

  it('stores a nullable JSON field with no default as database NULL', async () => {
    await context.builder.createCollection(
      'jsonNullableDefault',
      (collection) => {
        collection.string('id').primary();
        collection.json('payload').nullable();
      },
    );

    const repository = context.database.repository('jsonNullableDefault');
    await repository.createOne({ values: { id: 'a' } });
    expect(await repository.findOne({ filter: { id: 'a' } })).toEqual({
      id: 'a',
      payload: null,
    });
  });
});

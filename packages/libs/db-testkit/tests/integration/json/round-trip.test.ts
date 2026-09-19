import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';
import { jsonAmbiguousFixtures, jsonValueFixtures } from './fixtures.js';

/**
 * A JSON value has to come back as the value that went in, with its type
 * intact. Comparing whole result sets reports a twenty-row diff when one form
 * breaks, so these assertions name the form instead.
 */
describeIntegrationDatabases('JSON value round-trip', (context) => {
  it('preserves every JSON form through Repository', async () => {
    await context.builder.createCollection('jsonRoundTrip', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    const repository = context.database.repository('jsonRoundTrip');
    for (const fixture of jsonValueFixtures) {
      await repository.createOne({ values: { ...fixture } });
      const read = await repository.findOne({ filter: { id: fixture.id } });
      expect(read?.payload, `value of ${fixture.id}`).toEqual(fixture.payload);
      expect(typeof read?.payload, `type of ${fixture.id}`).toBe(
        typeof fixture.payload,
      );
      expect(Array.isArray(read?.payload), `array-ness of ${fixture.id}`).toBe(
        Array.isArray(fixture.payload),
      );
    }
  });

  it('preserves a JSON string whose content is itself JSON', async () => {
    await context.builder.createCollection('jsonAmbiguous', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    // The decoder cannot tell a parsing driver's decoded string from a text
    // driver's stored JSON by looking at the value, so a decoder that guesses
    // turns '{"a":1}' into { a: 1 } on PostgreSQL and MySQL while leaving it a
    // string on SQLite. These are the values that catch that.
    const repository = context.database.repository('jsonAmbiguous');
    for (const fixture of jsonAmbiguousFixtures) {
      await repository.createOne({ values: { ...fixture } });
      const record = await repository.findOne({ filter: { id: fixture.id } });
      expect(typeof record?.payload, `${fixture.id} stays a string`).toBe(
        'string',
      );
      expect(record?.payload, `${fixture.id} keeps its content`).toBe(
        fixture.payload,
      );
    }

    // And the same values through Query, which decodes separately.
    expect(
      await context.database
        .query()
        .selectFrom('jsonAmbiguous')
        .select(['id', 'payload'])
        .orderBy('id')
        .execute(),
    ).toEqual(
      jsonAmbiguousFixtures.map((fixture) => ({
        id: fixture.id,
        payload: fixture.payload,
      })),
    );
  });

  it('separates a JSON string from the scalar it resembles', async () => {
    await context.builder.createCollection('jsonScalarText', (collection) => {
      collection.string('id').primary();
      collection.json('payload').nullable();
    });

    const repository = context.database.repository('jsonScalarText');
    await repository.createMany({
      values: [
        { id: 'number', payload: 42 },
        { id: 'numberText', payload: '42' },
        { id: 'boolean', payload: true },
        { id: 'booleanText', payload: 'true' },
      ],
    });

    const rows = Object.fromEntries(
      (
        await repository.findMany({ sort: (sort) => sort.field('id').asc() })
      ).map((row) => [row.id as string, row.payload]),
    );
    expect(rows.number).toBe(42);
    expect(rows.numberText).toBe('42');
    expect(rows.boolean).toBe(true);
    expect(rows.booleanText).toBe('true');
  });
});

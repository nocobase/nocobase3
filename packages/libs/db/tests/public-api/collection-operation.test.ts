import { createDatabaseManager, type CollectionOperation } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

const operations = [
  {
    type: 'createCollection',
    name: 'orders',
    definition: {
      fields: [{ name: 'id', type: 'increments', primaryKey: true }],
    },
  },
] satisfies CollectionOperation[];

describe('@nocobase/db public CollectionOperation type', () => {
  it('types a reusable plan accepted by CollectionBuilder.apply()', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });

    try {
      const result = await database.builder().apply(operations, {
        dryRun: true,
      });

      expect(result.operations).toEqual(operations);
    } finally {
      await database.destroy();
    }
  });
});

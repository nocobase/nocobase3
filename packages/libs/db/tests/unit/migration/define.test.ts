import { describe, expect, it } from 'vitest';
import { defineMigration } from '../../../src/index.js';
import {
  isDefinedMigration,
  MIGRATION_DEFINITION_SYMBOL,
} from '../../../src/migration/internal/marker.js';

describe('defineMigration', () => {
  it('marks a migration definition for strict loader validation', async () => {
    const migration = defineMigration({
      name: '202608180001_create_users',
      async up() {},
      async down() {},
    });

    expect(isDefinedMigration(migration)).toBe(true);
    expect(
      (migration as Record<symbol, unknown>)[MIGRATION_DEFINITION_SYMBOL],
    ).toBe(true);
    expect(Object.keys(migration)).toEqual(['name', 'up', 'down']);
  });

  it('does not treat plain objects as migration definitions', () => {
    expect(
      isDefinedMigration({
        name: '202608180001_create_users',
        async up() {},
        async down() {},
      }),
    ).toBe(false);
  });

  it('contextually types migration callbacks', () => {
    defineMigration({
      name: '202608180002_typed_context',
      async up({ builder, query, connection }) {
        builder.createCollection;
        query.selectFrom;
        connection.client;
        connection.dialect satisfies string;
      },
      async down({ builder }) {
        builder.dropCollection;
      },
    });
  });
});

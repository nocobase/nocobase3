import { describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('SQLite database configuration', () => {
  it('normalizes flattened config into better-sqlite3 options', () => {
    const resolved = resolveKnexConnectionConfig(
      {
        dialect: 'sqlite',
        filename: ':memory:',
        driverOptions: { verbose: true },
      },
      sqlite.driver,
    );
    expect(resolved.schemaManagement).toBe('managed');
    expect(resolved.connection).toEqual({
      filename: ':memory:',
      verbose: true,
    });
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'sqlite',
          filename: ':memory:',
          schemaManagement: 'external',
        },
        sqlite.driver,
      ).schemaManagement,
    ).toBe('external');
  });

  it('reports SQLite capabilities', () => {
    expect(
      resolveDatabaseCapabilities(sqlite.driver.capabilities),
    ).toMatchObject({
      partialIndexes: true,
      nativeTypes: false,
    });
  });
});

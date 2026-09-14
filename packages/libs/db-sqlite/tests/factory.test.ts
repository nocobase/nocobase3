import { afterEach, expect, it } from 'vitest';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '../src/index.js';

const managers = new Set<ReturnType<typeof createDatabaseManager>>();

afterEach(async () => {
  await Promise.all([...managers].map((manager) => manager.destroy()));
  managers.clear();
});

it('binds its driver', () =>
  expect(sqlite().databaseDriver).toBe(sqlite.driver));

it('normalizes driver options without undefined values', () => {
  expect(
    sqlite.driver.resolveConnection?.({
      dialect: 'sqlite',
      filename: ':memory:',
      driverOptions: { verbose: true },
    }),
  ).toEqual({
    connection: { verbose: true, filename: ':memory:' },
    useNullAsDefault: true,
  });
});

it('creates a working sqlite connection through the factory', async () => {
  const manager = createDatabaseManager({
    connections: { main: sqlite() },
  });
  managers.add(manager);
  const connection = await manager.connect();
  expect(connection.dialect).toBe('sqlite');
  expect(connection.driver).toBe('better-sqlite3');
});

it('creates a working connection through explicit driver registration', async () => {
  const manager = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  managers.add(manager);
  const connection = await manager.connect();
  expect(connection.dialect).toBe('sqlite');
  expect(connection.driver).toBe('better-sqlite3');
});

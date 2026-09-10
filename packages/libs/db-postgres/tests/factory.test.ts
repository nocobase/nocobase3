import { describe, expect, it } from 'vitest';
import postgres from '../src/index.js';

describe('postgres factory', () => {
  it('binds the dialect driver to the connection', () => {
    const connection = postgres({ host: 'localhost' });
    expect(connection).toMatchObject({
      dialect: 'postgres',
      databaseDriver: postgres.driver,
      host: 'localhost',
    });
  });

  it('normalizes flattened connection options', () => {
    expect(
      postgres.driver.resolveConnection?.({
        dialect: 'postgres',
        host: 'localhost',
        database: 'app',
        username: 'app',
        driverOptions: { application_name: 'nocobase' },
      }),
    ).toEqual({
      connection: {
        application_name: 'nocobase',
        host: 'localhost',
        database: 'app',
        user: 'app',
      },
      searchPath: undefined,
    });
  });
});

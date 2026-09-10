import { expect, it } from 'vitest';
import mssql from '../src/index.js';
it('binds its driver', () => expect(mssql().databaseDriver).toBe(mssql.driver));

it('normalizes tedious connection options', () => {
  expect(
    mssql.driver.resolveConnection?.({
      dialect: 'mssql',
      host: 'localhost',
      database: 'app',
      username: 'app',
      password: 'secret',
      trustServerCertificate: true,
    }),
  ).toEqual({
    connection: {
      server: 'localhost',
      port: 1433,
      database: 'app',
      user: 'app',
      password: 'secret',
      encrypt: false,
      options: {
        lowerCaseGuids: true,
        trustServerCertificate: true,
      },
    },
  });
});

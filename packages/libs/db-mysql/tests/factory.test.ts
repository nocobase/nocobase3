import { expect, it } from 'vitest';
import mysql from '../src/index.js';
it('binds its driver', () => expect(mysql().databaseDriver).toBe(mysql.driver));

it('preserves the numeric transport contract', () => {
  expect(
    mysql.driver.resolveConnection?.({
      dialect: 'mysql',
      host: 'localhost',
      database: 'app',
      username: 'app',
      driverOptions: { decimalNumbers: true },
    }),
  ).toEqual({
    connection: {
      supportBigNumbers: true,
      bigNumberStrings: true,
      decimalNumbers: false,
      host: 'localhost',
      database: 'app',
      user: 'app',
    },
  });
});

it('rejects socketPath combined with host', () => {
  expect(() =>
    mysql.driver.resolveConnection?.({
      dialect: 'mysql',
      socketPath: '/tmp/mysql.sock',
      host: 'localhost',
    } as never),
  ).toThrow('socketPath cannot be combined with host');
});

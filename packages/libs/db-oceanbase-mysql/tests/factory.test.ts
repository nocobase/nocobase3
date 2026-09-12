import { expect, it } from 'vitest';
import oceanbaseMysql from '../src/index.js';
it('binds its driver', () =>
  expect(oceanbaseMysql().databaseDriver).toBe(oceanbaseMysql.driver));

it('preserves the numeric transport contract', () => {
  expect(
    oceanbaseMysql.driver.resolveConnection?.({
      dialect: 'oceanbase-mysql',
      host: 'localhost',
      database: 'app',
      username: 'app',
      driverOptions: { decimalNumbers: true },
    } as never),
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
    oceanbaseMysql.driver.resolveConnection?.({
      dialect: 'oceanbase-mysql',
      socketPath: '/tmp/mysql.sock',
      host: 'localhost',
    } as never),
  ).toThrow('socketPath cannot be combined with host');
});

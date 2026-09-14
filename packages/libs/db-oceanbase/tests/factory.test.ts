import { expect, it } from 'vitest';
import oceanbase from '../src/index.js';
it('binds its driver', () =>
  expect(oceanbase().databaseDriver).toBe(oceanbase.driver));

it('preserves the numeric transport contract', () => {
  expect(
    oceanbase.driver.resolveConnection?.({
      dialect: 'oceanbase',
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
    oceanbase.driver.resolveConnection?.({
      dialect: 'oceanbase',
      socketPath: '/tmp/mysql.sock',
      host: 'localhost',
    } as never),
  ).toThrow('socketPath cannot be combined with host');
});

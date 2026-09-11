import { expect, it } from 'vitest';
import dameng from '../src/index.js';

it('binds its driver descriptor', () =>
  expect(dameng().databaseDriver).toBe(dameng.driver));

it('resolves a host/port connection string', () => {
  expect(
    dameng.driver.resolveConnection?.({
      dialect: 'dameng',
      host: 'db.example.com',
      port: 5236,
      username: 'app',
      password: 'secret',
      schema: 'APP',
    } as never),
  ).toEqual({
    connection: {
      connectString: 'db.example.com:5236',
      user: 'app',
      password: 'secret',
      schema: 'APP',
      fetchAsString: ['NUMBER'],
    },
  });
});

it('preserves an explicit connectString', () => {
  expect(
    dameng.driver.resolveConnection?.({
      dialect: 'dameng',
      connectString: 'dmhost:5236',
      username: 'app',
      password: 'secret',
    } as never).connection,
  ).toMatchObject({
    connectString: 'dmhost:5236',
    user: 'app',
    password: 'secret',
  });
});

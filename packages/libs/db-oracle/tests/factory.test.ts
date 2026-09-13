import { expect, it } from 'vitest';
import oracle from '../src/index.js';
it('binds its driver', () =>
  expect(oracle().databaseDriver).toBe(oracle.driver));

it('normalizes the Oracle connect string', () => {
  expect(
    oracle.driver.resolveConnection?.({
      dialect: 'oracle',
      serviceName: 'FREEPDB1',
      host: 'db.example.com',
      port: 1522,
      username: 'app',
      password: 'secret',
    }),
  ).toEqual({
    connection: {
      user: 'app',
      password: 'secret',
      connectString: 'db.example.com:1522/FREEPDB1',
    },
  });
});

it('rejects an empty serviceName', () => {
  expect(() =>
    oracle.driver.resolveConnection?.({
      dialect: 'oracle',
      serviceName: '   ',
    }),
  ).toThrow('serviceName must be a non-empty string');
});

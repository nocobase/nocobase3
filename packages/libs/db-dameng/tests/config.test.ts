import { describe, expect, it } from 'vitest';
import dameng from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('Dameng database configuration', () => {
  it('normalizes defaults', () => {
    expect(
      dameng.driver.normalizeConnection?.({ dialect: 'dameng' } as never, {}),
    ).toMatchObject({ host: '127.0.0.1', port: 5236, username: 'SYSDBA' });
  });
  it('resolves through the core Knex config boundary', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'dameng',
          host: '127.0.0.1',
          port: 5236,
          username: 'u',
          password: 'p',
        } as never,
        dameng.driver,
      ).connection,
    ).toMatchObject({
      connectString: '127.0.0.1:5236',
      user: 'u',
      password: 'p',
    });
  });
  it('reports capabilities', () =>
    expect(
      resolveDatabaseCapabilities(dameng.driver.capabilities),
    ).toMatchObject({ schemas: false, nativeTypes: true }));
});

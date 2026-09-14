import { describe, expect, it } from 'vitest';
import oracle from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('Oracle database configuration', () => {
  it('normalizes service connection options for oracledb', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'oracle',
          host: '127.0.0.1',
          port: 1521,
          serviceName: 'FREEPDB1',
          username: 'orders_user',
          password: 'secret',
          driverOptions: { stmtCacheSize: 0 },
        },
        oracle.driver,
      ).connection,
    ).toEqual({
      stmtCacheSize: 0,
      user: 'orders_user',
      password: 'secret',
      connectString: '127.0.0.1:1521/FREEPDB1',
    });
  });

  it('reports Oracle capabilities', () => {
    expect(
      resolveDatabaseCapabilities(oracle.driver.capabilities),
    ).toMatchObject({
      schemas: true,
      views: true,
      nativeTypes: true,
    });
  });
});

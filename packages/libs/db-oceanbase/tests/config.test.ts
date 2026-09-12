import { describe, expect, it } from 'vitest';
import oceanbase from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('OceanBase database configuration', () => {
  it('normalizes host and driver options for mysql2', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'oceanbase',
          host: '127.0.0.1',
          port: 2881,
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
          charset: 'utf8mb4',
          ssl: true,
          driverOptions: { decimalNumbers: true },
        } as never,
        oceanbase.driver,
      ).connection,
    ).toEqual({
      decimalNumbers: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      host: '127.0.0.1',
      port: 2881,
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
      charset: 'utf8mb4',
      ssl: {},
    });
  });

  it('normalizes socket based connections', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'oceanbase',
          socketPath: '/tmp/mysql.sock',
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
        } as never,
        oceanbase.driver,
      ).connection,
    ).toEqual({
      socketPath: '/tmp/mysql.sock',
      decimalNumbers: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
    });
  });

  it('reports OceanBase capabilities', () => {
    expect(
      resolveDatabaseCapabilities(oceanbase.driver.capabilities),
    ).toMatchObject({
      comments: true,
      nativeTypes: true,
      materializedViews: false,
    });
  });
});

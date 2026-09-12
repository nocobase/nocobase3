import { describe, expect, it } from 'vitest';
import oceanbaseMysql from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('OceanBase MySQL database configuration', () => {
  it('normalizes host and driver options for mysql2', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'oceanbase-mysql',
          host: '127.0.0.1',
          port: 2881,
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
          charset: 'utf8mb4',
          ssl: true,
          driverOptions: { decimalNumbers: true },
        } as never,
        oceanbaseMysql.driver,
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
          dialect: 'oceanbase-mysql',
          socketPath: '/tmp/mysql.sock',
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
        } as never,
        oceanbaseMysql.driver,
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

  it('reports OceanBase MySQL capabilities', () => {
    expect(
      resolveDatabaseCapabilities(oceanbaseMysql.driver.capabilities),
    ).toMatchObject({
      comments: true,
      nativeTypes: true,
      materializedViews: false,
    });
  });
});

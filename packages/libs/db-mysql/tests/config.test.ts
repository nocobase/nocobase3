import { describe, expect, it } from 'vitest';
import mysql from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('MySQL database configuration', () => {
  it('normalizes host and driver options for mysql2', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'mysql',
          host: '127.0.0.1',
          port: 3306,
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
          charset: 'utf8mb4',
          ssl: true,
          driverOptions: { decimalNumbers: true },
        },
        mysql.driver,
      ).connection,
    ).toEqual({
      decimalNumbers: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      host: '127.0.0.1',
      port: 3306,
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
          dialect: 'mysql',
          socketPath: '/tmp/mysql.sock',
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
        },
        mysql.driver,
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

  it('reports MySQL capabilities', () => {
    expect(
      resolveDatabaseCapabilities(mysql.driver.capabilities),
    ).toMatchObject({
      comments: true,
      nativeTypes: true,
      materializedViews: false,
    });
  });
});

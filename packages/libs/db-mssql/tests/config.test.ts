import { describe, expect, it } from 'vitest';
import mssql from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('SQL Server database configuration', () => {
  it('normalizes flattened connection options for tedious', () => {
    const resolved = resolveKnexConnectionConfig(
      {
        dialect: 'mssql',
        host: '127.0.0.1',
        port: 1433,
        database: 'orders',
        username: 'sa',
        password: 'secret',
        encrypt: true,
        trustServerCertificate: true,
      },
      mssql.driver,
    );
    expect(resolved).toMatchObject({ driver: 'tedious', knexClient: 'mssql' });
    expect(resolved.connection).toEqual({
      server: '127.0.0.1',
      port: 1433,
      database: 'orders',
      user: 'sa',
      password: 'secret',
      encrypt: true,
      options: { lowerCaseGuids: true, trustServerCertificate: true },
    });
  });

  it('reports SQL Server capabilities', () => {
    expect(
      resolveDatabaseCapabilities(mssql.driver.capabilities),
    ).toMatchObject({
      schemas: true,
      views: true,
      replaceView: true,
      materializedViews: false,
      partialIndexes: true,
      nativeTypes: true,
      comments: true,
    });
  });
});

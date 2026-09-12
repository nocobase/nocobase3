import { describe, expect, it } from 'vitest';
import kingbasePostgres from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('KingbaseES PostgreSQL database configuration', () => {
  it('normalizes flattened connection options for pg', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'kingbase-postgres',
          host: '127.0.0.1',
          port: 54321,
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
          ssl: { rejectUnauthorized: false },
          driverOptions: { application_name: 'nocobase' },
        } as never,
        kingbasePostgres.driver,
      ).connection,
    ).toEqual({
      application_name: 'nocobase',
      host: '127.0.0.1',
      port: 54321,
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('reports KingbaseES PostgreSQL capabilities', () => {
    expect(
      resolveDatabaseCapabilities(kingbasePostgres.driver.capabilities),
    ).toMatchObject({
      schemas: true,
      materializedViews: true,
      refreshMaterializedViews: true,
      deferrableConstraints: true,
      partialIndexes: true,
      nativeTypes: true,
      comments: true,
    });
  });
});

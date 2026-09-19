import { describe, expect, it } from 'vitest';
import postgres from '../src/index.js';
import {
  resolveDatabaseCapabilities,
  resolveKnexConnectionConfig,
} from '@nocobase/db/testing';

describe('PostgreSQL database configuration', () => {
  it('normalizes flattened connection options for pg', () => {
    expect(
      resolveKnexConnectionConfig(
        {
          dialect: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          database: 'orders',
          username: 'orders_user',
          password: 'secret',
          ssl: { rejectUnauthorized: false },
          driverOptions: { application_name: 'nocobase' },
        },
        postgres.driver,
      ).connection,
    ).toEqual({
      application_name: 'nocobase',
      host: '127.0.0.1',
      port: 5432,
      database: 'orders',
      user: 'orders_user',
      password: 'secret',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('reports PostgreSQL capabilities', () => {
    expect(
      resolveDatabaseCapabilities(postgres.driver.capabilities),
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

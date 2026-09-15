import { expectTypeOf, it } from 'vitest';
import sqlite, {
  sqliteDriver,
  type SqliteConnectionConfig,
} from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type BaseConnectionConfig,
  type ConnectionConfig,
  type ConnectionConfigFromDrivers,
  type DatabaseConfig,
  type DatabaseConfigFromDrivers,
  type DatabaseDriverDefinition,
  type DriverConnectionConfig,
} from '../../../src/index.js';

interface CustomConnection extends BaseConnectionConfig {
  dialect: 'custom';
  endpoint: string;
}

it('infers driver-owned connection shapes without a core dialect union', async () => {
  const custom: DatabaseDriverDefinition<'custom', CustomConnection> = {
    dialect: 'custom',
  };
  const drivers = { sqlite, custom };
  expectTypeOf<
    DriverConnectionConfig<typeof sqliteDriver>
  >().toEqualTypeOf<SqliteConnectionConfig>();
  expectTypeOf<ConnectionConfigFromDrivers<typeof drivers>>().toEqualTypeOf<
    SqliteConnectionConfig | CustomConnection
  >();
  const config: DatabaseConfigFromDrivers<typeof drivers> = {
    drivers,
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
      custom: { dialect: 'custom', endpoint: 'db.example.test' },
    },
  };
  expectTypeOf(config).toMatchTypeOf<DatabaseConfig>();
  const manager = createDatabaseManager(config);
  await manager.destroy();

  const invalid: typeof config.connections = {
    // @ts-expect-error SQLite requires a filename from its driver-owned type.
    missing: { dialect: 'sqlite' },
    // @ts-expect-error A contributed dialect preserves its required fields.
    custom: { dialect: 'custom' },
    // @ts-expect-error Unregistered dialects are rejected.
    unknown: { dialect: 'postgres' },
    wrong: {
      dialect: 'sqlite',
      filename: ':memory:',
      // @ts-expect-error Fields from other drivers are rejected.
      endpoint: 'db.example.test',
    },
  };
  expectTypeOf(invalid).toEqualTypeOf<typeof config.connections>();
  expectTypeOf<ConnectionConfig['dialect']>().toEqualTypeOf<string>();
});

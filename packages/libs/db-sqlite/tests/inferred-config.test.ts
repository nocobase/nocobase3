import { expectTypeOf, it } from 'vitest';
import type {
  ConnectionConfigFromDrivers,
  DatabaseConfigFromDrivers,
  DriverConnectionConfig,
} from '@nocobase/db';
import sqlite, {
  sqliteDriver,
  type SqliteConnectionConfig,
} from '../src/index.js';

it('preserves SQLite connection fields through the factory and descriptor', () => {
  expectTypeOf<
    DriverConnectionConfig<typeof sqlite>
  >().toEqualTypeOf<SqliteConnectionConfig>();
  expectTypeOf<
    DriverConnectionConfig<typeof sqliteDriver>
  >().toEqualTypeOf<SqliteConnectionConfig>();
  const drivers = { sqlite };
  expectTypeOf<
    ConnectionConfigFromDrivers<typeof drivers>
  >().toEqualTypeOf<SqliteConnectionConfig>();
  const config: DatabaseConfigFromDrivers<typeof drivers> = {
    drivers,
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  };
  expectTypeOf(config.connections.main).toEqualTypeOf<SqliteConnectionConfig>();
  const invalid: typeof config.connections = {
    // @ts-expect-error SQLite requires its filename.
    missing: { dialect: 'sqlite' },
    wrong: {
      dialect: 'sqlite',
      filename: ':memory:',
      // @ts-expect-error SQLite does not accept a remote endpoint.
      endpoint: 'db.example.test',
    },
  };
  expectTypeOf(invalid).toEqualTypeOf<typeof config.connections>();
});

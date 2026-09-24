import { expectTypeOf, it } from 'vitest';
import type {
  ConnectionConfigFromDrivers,
  DatabaseConfigFromDrivers,
  DriverConnectionConfig,
} from '@nocobase/db';
import postgres, {
  postgresDriver,
  type PostgresConnectionConfig,
} from '../src/index.js';

it('preserves PostgreSQL connection fields through the factory and descriptor', () => {
  expectTypeOf<
    DriverConnectionConfig<typeof postgres>
  >().toEqualTypeOf<PostgresConnectionConfig>();
  expectTypeOf<
    DriverConnectionConfig<typeof postgresDriver>
  >().toEqualTypeOf<PostgresConnectionConfig>();
  const drivers = { postgres };
  expectTypeOf<
    ConnectionConfigFromDrivers<typeof drivers>
  >().toEqualTypeOf<PostgresConnectionConfig>();
  const config: DatabaseConfigFromDrivers<typeof drivers> = {
    drivers,
    connections: { main: { dialect: 'postgres', host: 'db.example.test' } },
  };
  expectTypeOf(
    config.connections.main,
  ).toEqualTypeOf<PostgresConnectionConfig>();
});

it('rejects aliases for unused PostgreSQL factories and descriptors', () => {
  const factories = { pg: postgres };
  const invalid: DatabaseConfigFromDrivers<typeof factories> = {
    // @ts-expect-error The factory must be registered under postgres.
    drivers: factories,
    connections: {},
  };
  const descriptors = { pg: postgresDriver };
  const empty: DatabaseConfigFromDrivers<typeof descriptors> = {
    // @ts-expect-error The descriptor must be registered under postgres.
    drivers: descriptors,
    connections: {},
  };
  expectTypeOf<
    ConnectionConfigFromDrivers<typeof factories>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    ConnectionConfigFromDrivers<typeof descriptors>
  >().toEqualTypeOf<never>();
  expectTypeOf(invalid.connections).toEqualTypeOf<Record<string, never>>();
  expectTypeOf(empty.connections).toEqualTypeOf<Record<string, never>>();
});

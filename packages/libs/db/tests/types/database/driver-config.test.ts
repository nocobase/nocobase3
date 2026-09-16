import { expect, it } from 'vitest';
import type {
  AnyConnectionConfig,
  BaseConnectionConfig,
  DatabaseDriverDefinition,
  DatabaseDriverRegistration,
  ExtensibleDatabaseConfig,
} from '@nocobase/db';

type CockroachConnection = BaseConnectionConfig & {
  dialect: 'cockroach';
  host?: string;
  port?: number;
};

/**
 * A driver that names its own connection shape. Before `TConfig` existed, every hook here took either
 * `unknown` or the closed `ConnectionConfig` union, so a package contributing a dialect had to assert its
 * way back to its own type — `@nocobase/db-dameng` did it with `source as unknown as DamengConnectionConfig`,
 * a double assertion, which is what two types with no overlap require.
 */
const cockroachDriver: DatabaseDriverDefinition<
  'cockroach',
  CockroachConnection
> = {
  dialect: 'cockroach',
  resolveConnection: (config) => ({
    // Reached without an assertion: `config` is CockroachConnection here.
    connection: { host: config.host, port: config.port },
  }),
  normalizeConnection: (config) => ({ ...config, port: config.port ?? 26257 }),
  resolveOwnershipTarget: (config) => ['cockroach', config.host, config.port],
};

/**
 * The hooks are declared as methods so that TypeScript checks their parameters bivariantly, which is what
 * lets a driver narrowed to one dialect sit in a map holding drivers for all of them. Without it a
 * `DatabaseDriverDefinition<'cockroach', CockroachConnection>` is not a `DatabaseDriverRegistration`, and
 * the `drivers` map cannot be assembled at all.
 */
const drivers: Record<string, DatabaseDriverRegistration> = {
  cockroach: cockroachDriver,
};

const config = {
  drivers,
  connections: {
    main: { dialect: 'cockroach' as const, host: 'db.example.test' },
  },
} satisfies ExtensibleDatabaseConfig<CockroachConnection>;

/** The constraint every connection-shaped parameter in this package is written against. */
const constraint: AnyConnectionConfig = { dialect: 'cockroach' };

it('lets a driver declare the connection shape its hooks receive', () => {
  expect(
    cockroachDriver.resolveConnection?.({
      dialect: 'cockroach',
      host: 'db.example.test',
      port: 26257,
    }),
  ).toEqual({ connection: { host: 'db.example.test', port: 26257 } });
});

it('applies the dialect package defaults through its own type', () => {
  expect(
    cockroachDriver.normalizeConnection?.(
      { dialect: 'cockroach', host: 'db.example.test' },
      {},
    ),
  ).toEqual({ dialect: 'cockroach', host: 'db.example.test', port: 26257 });
});

it('keeps a narrowed driver assignable to the shared registration type', () => {
  expect(config.connections.main.dialect).toBe('cockroach');
  expect(drivers.cockroach).toBe(cockroachDriver);
  expect(constraint.dialect).toBe('cockroach');
});

import { expectTypeOf, it } from 'vitest';
import {
  createDatabaseManager,
  type BaseConnectionConfig,
  type ConnectionConfig,
  type ConnectionConfigFromDrivers,
  type DatabaseConfig,
  type DatabaseConfigFromDrivers,
  type DatabaseDriverDefinition,
  type DatabaseDriverFactory,
  type DriverConnectionConfig,
} from '../../../src/index.js';

interface FileConnection extends BaseConnectionConfig {
  dialect: 'file';
  filename: string;
}

interface RemoteConnection extends BaseConnectionConfig {
  dialect: 'remote';
  host: string;
}

const fileDriver: DatabaseDriverDefinition<'file', FileConnection> = {
  dialect: 'file',
};
const file: DatabaseDriverFactory<
  'file',
  { filename?: string },
  FileConnection
> = Object.assign(
  ({ filename = ':memory:' } = {}) => ({
    dialect: 'file' as const,
    filename,
    databaseDriver: fileDriver,
  }),
  { dialect: 'file' as const, driver: fileDriver },
);
const remoteDriver: DatabaseDriverDefinition<'remote', RemoteConnection> = {
  dialect: 'remote',
};
const remote: DatabaseDriverFactory<
  'remote',
  { host?: string },
  RemoteConnection
> = Object.assign(
  ({ host = 'db.example.test' } = {}) => ({
    dialect: 'remote' as const,
    host,
    databaseDriver: remoteDriver,
  }),
  { dialect: 'remote' as const, driver: remoteDriver },
);

interface CustomConnection extends BaseConnectionConfig {
  dialect: 'custom';
  endpoint: string;
}

it('infers driver-owned connection shapes without a core dialect union', async () => {
  const custom: DatabaseDriverDefinition<'custom', CustomConnection> = {
    dialect: 'custom',
  };
  const drivers = { file, custom };
  expectTypeOf<
    DriverConnectionConfig<typeof fileDriver>
  >().toEqualTypeOf<FileConnection>();
  expectTypeOf<ConnectionConfigFromDrivers<typeof drivers>>().toEqualTypeOf<
    FileConnection | CustomConnection
  >();
  const config: DatabaseConfigFromDrivers<typeof drivers> = {
    drivers,
    connections: {
      main: { dialect: 'file', filename: ':memory:' },
      custom: { dialect: 'custom', endpoint: 'db.example.test' },
    },
  };
  expectTypeOf(config).toMatchTypeOf<DatabaseConfig>();
  const manager = createDatabaseManager(config);
  await manager.destroy();

  const invalid: typeof config.connections = {
    // @ts-expect-error The file driver requires a filename from its driver-owned type.
    missing: { dialect: 'file' },
    // @ts-expect-error A contributed dialect preserves its required fields.
    custom: { dialect: 'custom' },
    // @ts-expect-error Unregistered dialects are rejected.
    unknown: { dialect: 'remote' },
    wrong: {
      dialect: 'file',
      filename: ':memory:',
      // @ts-expect-error Fields from other drivers are rejected.
      endpoint: 'db.example.test',
    },
  };
  expectTypeOf(invalid).toEqualTypeOf<typeof config.connections>();
  expectTypeOf<ConnectionConfig['dialect']>().toEqualTypeOf<string>();
});

it('rejects aliased driver registrations even when no connection uses them', () => {
  const drivers = { file, alias: remote };
  const invalid: DatabaseConfigFromDrivers<typeof drivers> = {
    // @ts-expect-error The remote driver must be registered under remote, not alias.
    drivers,
    connections: { main: { dialect: 'file', filename: ':memory:' } },
  };
  expectTypeOf(invalid).toMatchTypeOf<DatabaseConfig>();
  expectTypeOf<
    ConnectionConfigFromDrivers<typeof drivers>
  >().toEqualTypeOf<FileConnection>();

  const descriptorDrivers = { alias: remoteDriver };
  const empty: DatabaseConfigFromDrivers<typeof descriptorDrivers> = {
    // @ts-expect-error Descriptors also require their own dialect as the key.
    drivers: descriptorDrivers,
    connections: {},
  };
  expectTypeOf(empty).toMatchTypeOf<DatabaseConfig>();
  expectTypeOf<
    ConnectionConfigFromDrivers<typeof descriptorDrivers>
  >().toEqualTypeOf<never>();
});

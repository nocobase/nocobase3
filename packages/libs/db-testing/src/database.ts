import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
  type AnyConnectionConfig,
  type CollectionMetadataStore,
  type DatabaseCapabilities,
  type DatabaseConnection,
  type DatabaseManager,
  type MigrationSource,
  type SeedSource,
} from '@nocobase/db';
import type {
  ProvisionedTestDatabase,
  TestDatabaseEnvironment,
} from '@nocobase/db/testing';
import {
  loadTestDatabaseProvisioner,
  testDatabaseDialect,
} from './environment.js';

export const DEFAULT_TEST_CONNECTION = 'main';

export interface ProvisionTestDatabasesOptions {
  /** Where the dialect and its server are read from; defaults to `process.env`. */
  readonly env?: TestDatabaseEnvironment;
  /** One isolated database is provisioned per name; the first is the default connection. */
  readonly connections?: readonly string[];
}

export interface OpenTestDatabaseOptions {
  /** Defaults to the store the connection keeps in its own database. */
  readonly metadataStore?: CollectionMetadataStore;
  /** Applied to the default connection after the schema is reset. */
  readonly migrations?: readonly MigrationSource[];
  /** Run on the default connection after the migrations. */
  readonly seeds?: readonly SeedSource[];
}

export interface TestDatabase {
  readonly dialect: string;
  readonly database: DatabaseManager;
  /** The default connection. */
  readonly connection: DatabaseConnection;
  readonly capabilities: DatabaseCapabilities;
  /** Applies every pending migration from `sources`. */
  migrate(
    sources: readonly MigrationSource[],
    connection?: string,
  ): Promise<void>;
  /** Runs every seed from `sources` that has not run yet. */
  seed(sources: readonly SeedSource[], connection?: string): Promise<void>;
  /** Drops everything every connection manages, leaving empty databases. */
  reset(): Promise<void>;
  /** Closes the connections, and drops the databases when this object provisioned them. */
  destroy(): Promise<void>;
}

/**
 * Isolated databases on the selected dialect, created once and opened as
 * often as needed. A test runner provisions once per worker and opens a
 * fresh Database Manager for every test.
 */
export interface ProvisionedTestDatabases {
  readonly dialect: string;
  readonly connections: readonly string[];
  /** Connection configuration for one isolated database, for callers that build their own manager. */
  connectionConfig(name?: string): AnyConnectionConfig;
  /** Opens a Database Manager on empty databases: the schema is reset before anything else runs. */
  open(options?: OpenTestDatabaseOptions): Promise<TestDatabase>;
  drop(): Promise<void>;
}

let provisionCount = 0;

export async function provisionTestDatabases(
  options: ProvisionTestDatabasesOptions = {},
): Promise<ProvisionedTestDatabases> {
  const env = options.env ?? process.env;
  const dialect = testDatabaseDialect(env);
  const names = options.connections ?? [DEFAULT_TEST_CONNECTION];
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error(
      'Test database connections must be a non-empty list of distinct names.',
    );
  }
  const provisioner = await loadTestDatabaseProvisioner(dialect);
  const prefix = isolatedDatabasePrefix(env);
  const provisioned: Array<[string, ProvisionedTestDatabase]> = [];
  try {
    for (const [index, name] of names.entries()) {
      provisioned.push([
        name,
        await provisioner.provision({ name: `${prefix}_${index}`, env }),
      ]);
    }
  } catch (error) {
    await dropAll(provisioned.map(([, database]) => database));
    throw error;
  }
  const configs = new Map(
    provisioned.map(([name, database]) => [name, database.connection]),
  );
  const connectionConfig = (
    name: string = names[0] ?? DEFAULT_TEST_CONNECTION,
  ): AnyConnectionConfig => {
    const config = configs.get(name);
    if (!config) {
      throw new Error(`Test database connection "${name}" is not provisioned.`);
    }
    return config;
  };
  return {
    dialect,
    connections: names,
    connectionConfig,
    open: (openOptions = {}) =>
      openTestDatabase(dialect, names, connectionConfig, openOptions),
    drop: () => dropAll(provisioned.map(([, database]) => database)),
  };
}

/** Provisions isolated databases and opens them in one step; `destroy()` drops them again. */
export async function createTestDatabase(
  options: ProvisionTestDatabasesOptions & OpenTestDatabaseOptions = {},
): Promise<TestDatabase> {
  const provisioned = await provisionTestDatabases(options);
  let database: TestDatabase;
  try {
    database = await provisioned.open(options);
  } catch (error) {
    await provisioned.drop();
    throw error;
  }
  return {
    ...database,
    destroy: async () => {
      try {
        await database.destroy();
      } finally {
        await provisioned.drop();
      }
    },
  };
}

async function openTestDatabase(
  dialect: string,
  names: readonly string[],
  connectionConfig: (name?: string) => AnyConnectionConfig,
  options: OpenTestDatabaseOptions,
): Promise<TestDatabase> {
  const defaultName = names[0] ?? DEFAULT_TEST_CONNECTION;
  const database = createDatabaseManager({
    default: defaultName,
    connections: Object.fromEntries(
      names.map((name) => [name, connectionConfig(name)]),
    ),
    ...(options.metadataStore ? { metadataStore: options.metadataStore } : {}),
  });
  const reset = async (): Promise<void> => {
    for (const name of names) {
      await database.connection(name).resetManagedSchema();
    }
  };
  const migrate = async (
    sources: readonly MigrationSource[],
    connection: string = defaultName,
  ): Promise<void> => {
    if (sources.length === 0) return;
    await createMigrator({ database, connection, sources }).latest();
  };
  const seed = async (
    sources: readonly SeedSource[],
    connection: string = defaultName,
  ): Promise<void> => {
    if (sources.length === 0) return;
    await createSeeder({ database, connection, sources }).run();
  };
  try {
    await reset();
    await migrate(options.migrations ?? []);
    await seed(options.seeds ?? []);
  } catch (error) {
    await database.destroy();
    throw error;
  }
  const connection = database.connection(defaultName);
  return {
    dialect,
    database,
    connection,
    capabilities: connection.capabilities,
    migrate,
    seed,
    reset,
    destroy: () => database.destroy(),
  };
}

async function dropAll(
  databases: readonly ProvisionedTestDatabase[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const database of [...databases].reverse()) {
    try {
      await database.drop();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      'Failed to drop several test databases.',
    );
  }
}

/**
 * Unique per process, Vitest worker and call, so parallel workers and
 * repeated runs against one server never share a database.
 */
function isolatedDatabasePrefix(env: TestDatabaseEnvironment): string {
  provisionCount += 1;
  const worker = env.VITEST_POOL_ID ?? env.VITEST_WORKER_ID ?? '0';
  const random = Math.random().toString(36).slice(2, 8);
  return `nbt_${process.pid}_${worker}_${provisionCount}_${random}`.replace(
    /[^a-z0-9_]/g,
    '_',
  );
}

import { createRequire } from 'node:module';
import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  DatabaseDriverRegistration,
} from './config.js';

const require = createRequire(import.meta.url);
const officialPackages: Readonly<Record<string, string>> = {
  sqlite: '@nocobase/db-sqlite',
  mysql: '@nocobase/db-mysql',
  postgres: '@nocobase/db-postgres',
  mssql: '@nocobase/db-mssql',
  oracle: '@nocobase/db-oracle',
  dameng: '@nocobase/db-dameng',
  kingbase: '@nocobase/db-kingbase',
  oceanbase: '@nocobase/db-oceanbase',
};

/**
 * Resolve explicit drivers first, then synchronously load an official optional peer.
 * Node caches the module; application registrations are never cached globally.
 * Resolving a driver does not open a database connection.
 */
export function resolveDatabaseDriver(
  connection: ConnectionConfig,
  drivers?: Record<string, DatabaseDriverRegistration>,
  name: string = connection.dialect,
): DatabaseDriverDefinition | undefined {
  const supplied = connection.databaseDriver;
  const registered = resolveDriverDefinition(
    drivers && Object.hasOwn(drivers, connection.dialect)
      ? drivers[connection.dialect]
      : undefined,
    connection.dialect,
  );
  if (supplied && supplied.dialect !== connection.dialect) {
    throw new Error(
      `Database connection "${name}" uses dialect "${connection.dialect}" but its driver is for "${supplied.dialect}".`,
    );
  }
  if (supplied && registered && supplied !== registered) {
    throw new Error(
      `Database connection "${name}" provides a driver that conflicts with the registered "${connection.dialect}" driver.`,
    );
  }
  if (supplied || registered) return supplied ?? registered;
  const packageName = Object.hasOwn(officialPackages, connection.dialect)
    ? officialPackages[connection.dialect]
    : undefined;
  if (!packageName) return undefined;

  let entry: string;
  try {
    entry = require.resolve(packageName);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND')
      throw cause;
    throw new Error(
      `Database connection "${name}" requires "${packageName}". Install it with "pnpm add ${packageName}".`,
      { cause },
    );
  }
  let loaded: { default?: DatabaseDriverRegistration };
  try {
    loaded = require(entry) as { default?: DatabaseDriverRegistration };
  } catch (cause) {
    throw new Error(
      `Failed to load database driver "${packageName}" for connection "${name}".`,
      { cause },
    );
  }
  if (!loaded?.default) {
    throw new Error(
      `Database driver "${packageName}" must have a default export.`,
    );
  }
  return resolveDriverDefinition(loaded.default, connection.dialect);
}

function resolveDriverDefinition(
  value: DatabaseDriverRegistration | undefined,
  expectedDialect: string,
): DatabaseDriverDefinition | undefined {
  if (value === undefined) return undefined;
  const candidate = value as DatabaseDriverRegistration & {
    driver?: DatabaseDriverDefinition;
  };
  const isFactory =
    typeof candidate === 'function' &&
    typeof candidate.driver === 'object' &&
    candidate.driver !== null;
  const driver = isFactory ? candidate.driver : value;

  if (
    typeof driver !== 'object' ||
    driver === null ||
    typeof driver.dialect !== 'string'
  ) {
    throw new Error(
      `Invalid database driver registration for dialect "${expectedDialect}". Expected a driver descriptor or a dialect factory.`,
    );
  }
  if (driver.dialect !== expectedDialect) {
    throw new Error(
      `Database driver registration for dialect "${expectedDialect}" points to dialect "${driver.dialect}".`,
    );
  }
  if (
    isFactory &&
    (candidate.dialect !== expectedDialect || candidate.driver !== driver)
  ) {
    throw new Error(
      `Database driver factory for dialect "${expectedDialect}" has inconsistent dialect metadata.`,
    );
  }
  return driver;
}

import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  DatabaseDriverRegistration,
} from './config.js';

/** Validate explicitly supplied drivers without loading packages. */
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
  return undefined;
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

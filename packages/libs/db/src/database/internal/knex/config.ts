import type {
  BaseConnectionConfig,
  ConnectionConfig,
  DatabaseDialect,
  DatabaseDriverDefinition,
  SchemaManagementMode,
} from '../../config.js';

export interface KnexConnectionConfig extends BaseConnectionConfig {
  dialect: DatabaseDialect;
  driver: string;
  schemaManagement: SchemaManagementMode;
  knexClient: KnexClientName;
  connection: unknown;
  useNullAsDefault?: boolean;
  searchPath?: string[];
}

/**
 * The core package deliberately treats the Knex client name as opaque. A
 * dialect package owns the mapping from its native driver to this name.
 */
export type KnexClientName = string;

export function resolveKnexConnectionConfig(
  config: ConnectionConfig,
  dialectDriver?: DatabaseDriverDefinition,
): KnexConnectionConfig {
  assertNoUnsupportedConnectionConfigFields(config);

  if (!dialectDriver) {
    throw new Error(
      `Database dialect "${config.dialect}" is not registered. Install and register the corresponding @nocobase/db-${config.dialect} package.`,
    );
  }
  if (dialectDriver.dialect !== config.dialect) {
    throw new Error(
      `Database connection uses dialect "${config.dialect}" but its driver is for "${dialectDriver.dialect}".`,
    );
  }
  if (!dialectDriver.knexClient) {
    throw new Error(
      `Database driver for dialect "${config.dialect}" must declare a Knex client.`,
    );
  }
  if (!dialectDriver.resolveConnection) {
    throw new Error(
      `Database driver for dialect "${config.dialect}" must resolve its connection.`,
    );
  }

  const expectedDriver = dialectDriver.nativeDriver;
  if (config.driver && expectedDriver && config.driver !== expectedDriver) {
    throw new Error(
      `Invalid database driver "${config.driver}" for dialect "${config.dialect}". Expected "${expectedDriver}".`,
    );
  }

  const externalConnection = dialectDriver.resolveConnection(config);
  return {
    ...config,
    driver: expectedDriver ?? config.driver ?? dialectDriver.knexClient,
    schemaManagement: config.schemaManagement ?? 'managed',
    knexClient: dialectDriver.knexClient,
    connection: externalConnection.connection,
    useNullAsDefault: externalConnection.useNullAsDefault,
    searchPath: externalConnection.searchPath,
  };
}

function assertNoUnsupportedConnectionConfigFields(
  config: ConnectionConfig,
): void {
  const unsupportedFields = [
    'adapter',
    'client',
    'connection',
    'url',
    'connectionString',
    'uri',
  ];
  const fields = unsupportedFields.filter(
    (field) =>
      (config as unknown as Record<string, unknown>)[field] !== undefined,
  );
  if (fields.length > 0) {
    throw new Error(
      `Database connection config cannot include ${fields.join(', ')}. Use dialect and flattened connection parameters.`,
    );
  }
}

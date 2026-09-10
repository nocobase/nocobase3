import { createRequire } from 'node:module';
import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  OracleConnectionConfig,
} from '@nocobase/db';
import { preciseIntegerClient } from '@nocobase/db';
import { OracleSchemaInspector } from './inspectors/oracle.js';

const require = createRequire(import.meta.url);
const Oracledb: unknown = require('oracledb') as unknown;
export type OracleOptions = Omit<
  OracleConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const oracleDriver: DatabaseDriverDefinition<'oracle'> = {
  dialect: 'oracle',
  packageName: '@nocobase/db-oracle',
  knexClient: 'oracledb',
  createKnexClient: () =>
    // Oracle's integer codecs are installed by the shared Knex helper.
    preciseIntegerClient('oracle', 'oracledb', Oracledb),
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as OracleConnectionConfig;
    assertDriverOptions(config.driverOptions, [
      'host',
      'port',
      'database',
      'serviceName',
      'user',
      'username',
      'password',
      'connectString',
      'externalAuth',
      'pool',
      'url',
      'connectionString',
      'uri',
    ]);
    if (config.serviceName.trim() === '') {
      throw new Error(
        'Oracle database serviceName must be a non-empty string.',
      );
    }
    return {
      connection: compactObject({
        ...config.driverOptions,
        user: config.username,
        password: config.password,
        connectString: `${config.host ?? '127.0.0.1'}:${config.port ?? 1521}/${config.serviceName}`,
      }),
    };
  },
  createSchemaInspector: (context) =>
    new OracleSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
  configurePool: (_config, pool) => {
    const configuredAfterCreate = pool.afterCreate;
    return {
      ...pool,
      afterCreate: (
        connection: { execute(sql: string): Promise<unknown> },
        done: (error: unknown, connection?: unknown) => void,
      ) => {
        Promise.all([
          connection.execute(
            `alter session set nls_date_format = 'YYYY-MM-DD HH24:MI:SS'`,
          ),
          connection.execute(
            `alter session set nls_timestamp_format = 'YYYY-MM-DD HH24:MI:SS'`,
          ),
        ])
          .then(() => {
            if (configuredAfterCreate) {
              (
                configuredAfterCreate as unknown as (
                  connection: unknown,
                  done: (error: unknown, connection?: unknown) => void,
                ) => void
              )(connection, done);
            } else done(null, connection);
          })
          .catch((error: unknown) => done(error));
      },
    };
  },
};
export type OracleConnection = OracleOptions & {
  dialect: 'oracle';
  databaseDriver: typeof oracleDriver;
};
export interface OracleFactory {
  (options?: OracleOptions): OracleConnection;
  readonly dialect: 'oracle';
  readonly driver: typeof oracleDriver;
}
export const oracle: OracleFactory = Object.assign(
  (options: OracleOptions = { serviceName: 'FREEPDB1' }) => ({
    ...options,
    dialect: 'oracle' as const,
    driver: 'oracledb' as const,
    databaseDriver: oracleDriver,
  }),
  { dialect: 'oracle' as const, driver: oracleDriver },
);
export default oracle;

function assertDriverOptions(
  driverOptions: Record<string, unknown> | undefined,
  reservedKeys: readonly string[],
): void {
  if (!driverOptions) return;
  const reserved = reservedKeys.filter(
    (key) => driverOptions[key] !== undefined,
  );
  if (reserved.length > 0) {
    throw new Error(
      `Database driverOptions cannot include ${reserved.join(', ')}. Use flattened connection parameters.`,
    );
  }
}

function compactObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

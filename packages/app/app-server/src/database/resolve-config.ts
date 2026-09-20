import type { DatabaseDriverRegistration } from '@nocobase/db';
import { resolveDatabaseDriver } from '@nocobase/db';
import type { AppDatabaseConfig } from './types.js';

const officialDriverLoaders = {
  sqlite: () => import('@nocobase/db-sqlite'),
  mysql: () => import('@nocobase/db-mysql'),
  postgres: () => import('@nocobase/db-postgres'),
  mssql: () => import('@nocobase/db-mssql'),
  oracle: () => import('@nocobase/db-oracle'),
  dameng: () => import('@nocobase/db-dameng'),
  kingbase: () => import('@nocobase/db-kingbase'),
  oceanbase: () => import('@nocobase/db-oceanbase'),
} satisfies Record<
  string,
  () => Promise<{ default?: DatabaseDriverRegistration }>
>;

/** Configuration properties needed for driver loading; other properties are preserved. */
export type DatabaseConfigInput = Pick<
  AppDatabaseConfig,
  'default' | 'drivers' | 'connections'
>;

export type ResolvedDatabaseConfig<TConfig extends DatabaseConfigInput> = Omit<
  TConfig,
  'drivers'
> & {
  drivers: Record<string, DatabaseDriverRegistration>;
};

/** Load only configured official dialects before constructing a synchronous manager. */
export async function resolveDatabaseConfig<
  TConfig extends DatabaseConfigInput,
>(config: TConfig): Promise<ResolvedDatabaseConfig<TConfig>> {
  const drivers = { ...config.drivers };
  const connections = { ...config.connections };
  if (config.default === 'none') return { ...config, drivers };

  // Per-connection drivers must not conflict with an automatically registered
  // default for another connection using the same dialect.
  const suppliedDialects = new Set(
    Object.values(connections)
      .filter((connection) => connection.databaseDriver)
      .map((connection) => connection.dialect),
  );
  const loaded = new Map<string, DatabaseDriverRegistration>();
  for (const [name, connection] of Object.entries(connections)) {
    if (
      resolveDatabaseDriver(
        {
          dialect: connection.dialect,
          databaseDriver: connection.databaseDriver,
        },
        config.drivers,
        name,
      )
    )
      continue;
    const dialect = connection.dialect;
    const loader = Object.hasOwn(officialDriverLoaders, dialect)
      ? officialDriverLoaders[dialect as keyof typeof officialDriverLoaders]
      : undefined;
    if (!loader) {
      throw new Error(
        `Database connection "${name}" uses unregistered dialect "${dialect}". Register a custom driver in database.drivers.`,
      );
    }
    let driver = loaded.get(dialect);
    if (!driver) {
      const packageName = `@nocobase/db-${dialect}`;
      let module: { default?: DatabaseDriverRegistration };
      try {
        module = await loader();
      } catch (cause) {
        const error = cause as NodeJS.ErrnoException;
        if (
          error?.code === 'ERR_MODULE_NOT_FOUND' &&
          error.message.startsWith(
            `Cannot find package '${packageName}' imported from `,
          )
        ) {
          throw new Error(
            `Database connection "${name}" requires "${packageName}". Install it with "pnpm add ${packageName}".`,
            { cause },
          );
        }
        throw new Error(
          `Failed to load database driver "${packageName}" for connection "${name}".`,
          { cause },
        );
      }
      if (!module.default)
        throw new Error(
          `Database driver "${packageName}" must have a default export.`,
        );
      driver = module.default;
      resolveDatabaseDriver(
        {
          dialect: connection.dialect,
          databaseDriver: connection.databaseDriver,
        },
        { [dialect]: driver },
        name,
      );
      loaded.set(dialect, driver);
    }
    if (suppliedDialects.has(dialect)) {
      connections[name] = {
        ...connection,
        databaseDriver: resolveDatabaseDriver(
          { dialect: connection.dialect },
          { [dialect]: driver },
          name,
        ),
      } satisfies typeof connection;
    } else {
      drivers[dialect] = driver;
    }
  }
  return { ...config, drivers, connections };
}

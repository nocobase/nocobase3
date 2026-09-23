import type { DatabaseDriverRegistration } from '@nocobase/db';
import { resolveDatabaseDriver } from '@nocobase/db';
import type { AppDatabaseConfig } from './types.js';

/** A dialect this runtime loads a driver for without the application registering one. */
export type OfficialDialect =
  | 'sqlite'
  | 'mysql'
  | 'postgres'
  | 'mssql'
  | 'oracle'
  | 'dameng'
  | 'kingbase'
  | 'oceanbase';

const officialDriverLoaders = {
  sqlite: () => import('@nocobase/db-sqlite'),
  mysql: () => import('@nocobase/db-mysql'),
  postgres: () => import('@nocobase/db-postgres'),
  mssql: () => import('@nocobase/db-mssql'),
  oracle: () => import('@nocobase/db-oracle'),
  dameng: () => import('@nocobase/db-dameng'),
  kingbase: () => import('@nocobase/db-kingbase'),
  oceanbase: () => import('@nocobase/db-oceanbase'),
  // Keyed by the exported union rather than by `string`, so a dialect added to one and not the other fails to compile
  // instead of producing a list the runtime cannot load from.
} satisfies Record<
  OfficialDialect,
  () => Promise<{ default?: DatabaseDriverRegistration }>
>;

/**
 * The dialects above, as a list tooling can name them from.
 *
 * Anything that has to present the choice to a person — `nocobase app config init`, the documentation it prints —
 * reads this rather than keeping its own copy. A separate list is one that silently stops matching the loaders the
 * day a dialect is added, and the mismatch only shows up as a dialect the CLI offers and the runtime cannot load.
 */
export const OFFICIAL_DIALECTS: readonly OfficialDialect[] = Object.freeze(
  Object.keys(officialDriverLoaders) as OfficialDialect[],
);

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
          // The remedy names the application rather than "here" on purpose: in a deployment this runs from a built
          // `dist`, where installing a driver is undone by the next build. The driver has to reach the application's
          // dependencies, and a deployment has to be built again afterwards.
          throw new Error(
            `Database connection "${name}" requires "${packageName}". Add it to the application's dependencies with "pnpm add ${packageName}"; a deployment needs to be built again afterwards.`,
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

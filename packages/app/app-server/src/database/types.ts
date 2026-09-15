import type {
  AnyConnectionConfig,
  CollectionMetadataStore,
  CollectionMetadataStoreConfig,
  ConnectionConfig,
  ConnectionsOfDrivers,
  DatabaseDriverRegistration,
  ExtensibleDatabaseConfig,
  MigrationSource,
  SeedSource,
} from '@nocobase/db';
import type { AppConfigFactory } from '../config/define-app-config.js';
import type { AppRuntimeContext } from '../runtime/definition.js';

/**
 * A metadata store as an application may configure it: the instance, the
 * declarative form `@nocobase/db` understands, or — the form `config.yml` can
 * carry — the collections directory alone. Relative directories resolve
 * against the application root.
 */
export type AppMetadataStoreConfig =
  string | CollectionMetadataStoreConfig | CollectionMetadataStore;

/**
 * A connection shape an application may configure, which is every dialect
 * `@nocobase/db` declares a config type for by default.
 *
 * Naming another one admits a dialect from a package that contributes its own,
 * the way `createDatabaseManager` already accepts one through
 * `ExtensibleDatabaseConfig`. Only the named shapes are accepted, so widening
 * for one dialect leaves every other one as strict as it was:
 *
 * ```ts
 * const database: AppConfigFactory<
 *   AppDatabaseConfig<ConnectionConfig | KingbaseConnectionConfig>
 * > = defineAppConfig(() => ({
 *   drivers: { kingbase },
 *   connections: { main: { dialect: 'kingbase', database: 'crm' } },
 * }));
 * ```
 */
export interface AppDatabaseConfig<
  TConnection extends AnyConnectionConfig = ConnectionConfig,
> extends Omit<
  ExtensibleDatabaseConfig<TConnection>,
  'connections' | 'metadataStore'
> {
  connections: Record<string, AppDatabaseConnectionConfig<TConnection>>;
  metadataStore?: AppMetadataStoreConfig;
  /** @deprecated Configure tasks on connections instead. Applies to the default connection. */
  migrations?: Partial<AppDatabaseMigrationConfig>;
  /** @deprecated Configure tasks on connections instead. Applies to the default connection. */
  seeds?: Partial<AppDatabaseSeedConfig>;
}

/**
 * Runtime facts that task planning needs and configuration cannot supply: the
 * application's own package identity, and the migration and seed directories
 * contributed by its server plugins.
 *
 * These are derived from resolved plugins rather than configured, so they are
 * passed alongside the configuration instead of being merged into it — a value
 * inside the `database` namespace can be overwritten from `config.yml`, and
 * silently dropping a plugin's migrations is not a configurable outcome.
 */
export interface AppDatabaseTaskContributions {
  readonly appPackageName: string;
  readonly migrations: readonly MigrationSource[];
  readonly seeds: readonly SeedSource[];
}

export interface AppDatabaseMigrationConfig {
  directory: string;
  packageName?: string;
  autoRun: boolean;
  sources?: readonly MigrationSource[];
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}

export interface AppDatabaseSeedConfig {
  directory: string;
  packageName?: string;
  autoRun: boolean;
  sources?: readonly SeedSource[];
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}

/** `Omit` over a union keeps only the common keys; distribute it so each dialect keeps its own. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type AppDatabaseConnectionConfig<
  TConnection extends AnyConnectionConfig = ConnectionConfig,
> = DistributiveOmit<TConnection, 'metadataStore'> & {
  migrations?: Partial<AppDatabaseMigrationConfig>;
  seeds?: Partial<AppDatabaseSeedConfig>;
  /**
   * Where supplemental metadata comes from. An `external` connection that
   * sets nothing here or at the top level reads
   * `database/<connection>/collections/*\/metadata.json`.
   */
  metadataStore?: AppMetadataStoreConfig;
};

/**
 * Declares an application's `database` configuration, checking its connections against the drivers
 * it registers.
 *
 * A connection may only use a dialect the application registered. That has always been true at
 * runtime, where a driver is looked up by the connection's dialect and a missing one fails the start
 * with `Database dialect "..." is not registered.`; this reports it while typing instead.
 *
 * ```ts
 * const database: AppConfigFactory<AppDatabaseConfig> = defineDatabaseConfig({ sqlite })(
 *   (runtime) => ({
 *     default: 'main',
 *     connections: {
 *       main: { dialect: 'sqlite', filename: runtime.configPaths.storage('app.sqlite') },
 *     },
 *   }),
 * );
 * ```
 *
 * The drivers are taken in a call of their own, and the shape is not decoration. TypeScript infers
 * from arguments rather than from a function's return type, so drivers declared inside the factory
 * are never resolved and every connection is accepted; and even passed alongside it, the connection
 * type stays a deferred conditional that cannot contextually type the literal, which widens each
 * `dialect` to `string`. Binding the drivers in the first call makes the second call's parameter a
 * concrete type — which is also what restores TypeScript's own excess-property check, so a mistyped
 * key is reported with its own diagnostic and a spelling suggestion.
 *
 * The type parameter never reaches the return type, so an application keeps annotating with plain
 * `AppConfigFactory<AppDatabaseConfig>` and `isolatedDeclarations` has nothing to write out.
 */
export function defineDatabaseConfig<
  const TDrivers extends Record<string, DatabaseDriverRegistration>,
>(
  drivers: TDrivers,
): (
  factory: (runtime: AppRuntimeContext) => {
    default?: string;
    metadataStore?: AppMetadataStoreConfig;
    connections: Record<
      string,
      AppDatabaseConnectionConfig<ConnectionsOfDrivers<TDrivers>>
    >;
  },
) => AppConfigFactory<AppDatabaseConfig> {
  return (factory) => (runtime) =>
    ({ drivers, ...factory(runtime) }) as unknown as AppDatabaseConfig;
}

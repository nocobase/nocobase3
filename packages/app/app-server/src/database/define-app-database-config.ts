import type { DatabaseDriverRegistration } from '@nocobase/db';
import type { AppConfigFactory } from '../config/define-app-config.js';
import type {
  AppDatabaseConfig,
  AppDatabaseConfigFromDrivers,
} from './types.js';

type Drivers = Record<string, DatabaseDriverRegistration>;
type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/** Keep each connection's contextual union separate from its siblings. */
type InferredConfig<
  TConfig extends AppDatabaseConfig,
  TDrivers extends Drivers,
> = TConfig &
  Omit<AppDatabaseConfigFromDrivers<TDrivers>, 'connections'> & {
    connections: {
      [
        K in keyof TConfig['connections']
      ]: AppDatabaseConfigFromDrivers<TDrivers>['connections'][string];
    };
  };

/** Check inferred return fields without changing the callback's contextual type. */
type UnknownFields<
  TConfig extends AppDatabaseConfig,
  TDrivers extends Drivers,
> =
  | Exclude<keyof TConfig, keyof AppDatabaseConfig>
  | {
      [K in keyof TConfig['connections']]: Exclude<
        keyof TConfig['connections'][K],
        KeysOfUnion<
          Extract<
            AppDatabaseConfigFromDrivers<TDrivers>['connections'][string],
            { dialect: TConfig['connections'][K]['dialect'] }
          >
        >
      >;
    }[keyof TConfig['connections']];

type CheckedFactory<
  TConfig extends AppDatabaseConfig,
  TDrivers extends Drivers,
> = [UnknownFields<TConfig, TDrivers>] extends [never]
  ? unknown
  : { unknownDatabaseConfigFields: UnknownFields<TConfig, TDrivers> };

/**
 * Declare database defaults with connection fields inferred from returned drivers.
 * The factory runs when application configuration is resolved, not on import.
 * Export the common runtime contract so declarations do not expose native drivers.
 */
export function defineAppDatabaseConfig<
  const TDrivers extends Drivers,
  const TConfig extends AppDatabaseConfig & { drivers: TDrivers },
>(
  factory: AppConfigFactory<InferredConfig<TConfig, TDrivers>> &
    CheckedFactory<NoInfer<TConfig>, NoInfer<TDrivers>>,
): AppConfigFactory<AppDatabaseConfig> {
  return factory;
}

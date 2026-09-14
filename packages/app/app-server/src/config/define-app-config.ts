import type { AppRuntimeContext } from '../runtime/definition.js';
export type AppConfigFactory<T extends object = object> = (
  runtime: AppRuntimeContext,
) => T;

export function defineAppConfig<T extends object>(
  factory: AppConfigFactory<T>,
): AppConfigFactory<T> {
  return factory;
}

export function defaultAppConfigs<T extends Record<string, AppConfigFactory>>(
  configs: T,
): AppConfigFactory<{ [K in keyof T]: ReturnType<T[K]> }> {
  return (runtime) =>
    Object.fromEntries(
      Object.entries(configs).map(([key, configure]) => [
        key,
        configure(runtime),
      ]),
    ) as { [K in keyof T]: ReturnType<T[K]> };
}

export interface AppIdentityConfig {
  readonly name: string;
  readonly publicOrigin?: string;
  readonly publicBasePath: string;
  readonly internalBasePath: string;
  readonly publicApiUrl: string;
}

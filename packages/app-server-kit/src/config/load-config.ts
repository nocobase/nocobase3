import type { ConfigContext, ConfigFactories } from './types.js';

export function loadConfig<
  TConfigMap extends object,
  TContext extends ConfigContext = ConfigContext,
>(
  factories: ConfigFactories<TConfigMap, TContext>,
  context: TContext,
): TConfigMap {
  const config = {} as TConfigMap;

  for (const key of Object.keys(factories) as Array<keyof TConfigMap>) {
    config[key] = factories[key](context);
  }

  return config;
}

import type { ConfigContext, ConfigFactories } from './types.js';

export function loadConfig<TConfigMap extends Record<string, unknown>>(
  factories: ConfigFactories<TConfigMap>,
  context: ConfigContext,
): TConfigMap {
  const config = {} as TConfigMap;

  for (const key of Object.keys(factories) as Array<keyof TConfigMap>) {
    config[key] = factories[key](context);
  }

  return config;
}

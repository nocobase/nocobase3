import type { AppDatabaseConfig } from '../database/types.js';
import type { ConfigFactory } from './types.js';

export function defineConfig<TConfig>(factory: ConfigFactory<TConfig>): ConfigFactory<TConfig> {
  return factory;
}

export function defineDatabaseConfig<TConfig extends AppDatabaseConfig>(
  factory: ConfigFactory<TConfig>,
): ConfigFactory<TConfig> {
  return factory;
}

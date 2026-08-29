import type { AppDatabaseConfig } from '../database/types.js';
import { createConfigEnv } from './env.js';
import type {
  ConfigContext,
  ConfigFactory,
  CreateConfigContextOptions,
} from './types.js';

export function createConfigContext(
  options: CreateConfigContextOptions,
): ConfigContext {
  return {
    env: createConfigEnv(options.env),
    paths: options.paths,
  };
}

export function defineConfig<
  TConfig,
  TContext extends ConfigContext = ConfigContext,
>(factory: ConfigFactory<TConfig, TContext>): ConfigFactory<TConfig, TContext> {
  return factory;
}

export function defineDatabaseConfig<
  TConfig extends AppDatabaseConfig,
  TContext extends ConfigContext = ConfigContext,
>(factory: ConfigFactory<TConfig, TContext>): ConfigFactory<TConfig, TContext> {
  return factory;
}

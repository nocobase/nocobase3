import type { AppDatabaseConfig } from '../database/types.js';
import type { EnvMap } from './env.js';

export interface ConfigEnv {
  string(key: string): string | undefined;
  string(key: string, defaultValue: string): string;
  number(key: string): number | undefined;
  number(key: string, defaultValue: number): number;
  boolean(key: string): boolean | undefined;
  boolean(key: string, defaultValue: boolean): boolean;
  list(key: string): string[] | undefined;
  list(key: string, defaultValue: string[]): string[];
}

export interface ConfigPaths {
  root(path?: string): string;
  server(path?: string): string;
  database(path?: string): string;
  config(path?: string): string;
  storage(path?: string): string;
}

export interface ConfigContext {
  env: ConfigEnv;
  paths: ConfigPaths;
}

export interface CreateConfigContextOptions {
  readonly env: EnvMap;
  readonly paths: ConfigPaths;
}

export type ConfigFactory<
  TConfig,
  TContext extends ConfigContext = ConfigContext,
> = (context: TContext) => TConfig;

export type ConfigFactories<
  TConfigMap extends object,
  TContext extends ConfigContext = ConfigContext,
> = {
  [TKey in keyof TConfigMap]: ConfigFactory<TConfigMap[TKey], TContext>;
};

export type DatabaseConfigFactory<
  TConfig extends AppDatabaseConfig = AppDatabaseConfig,
> = ConfigFactory<TConfig>;

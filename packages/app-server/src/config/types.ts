import type { AppDatabaseConfig } from '../database/types.js';

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

export type ConfigFactory<TConfig> = (context: ConfigContext) => TConfig;

export type ConfigFactories<TConfigMap extends Record<string, unknown>> = {
  [TKey in keyof TConfigMap]: ConfigFactory<TConfigMap[TKey]>;
};

export type DatabaseConfigFactory<
  TConfig extends AppDatabaseConfig = AppDatabaseConfig,
> = ConfigFactory<TConfig>;

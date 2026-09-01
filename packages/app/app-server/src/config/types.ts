export type EnvMap = Record<string, string | undefined>;

export interface ConfigPaths {
  root(path?: string): string;
  server(path?: string): string;
  database(path?: string): string;
  config(path?: string): string;
  storage(path?: string): string;
}

export interface ConfigContext {
  readonly environment: EnvMap;
  readonly paths: ConfigPaths;
}

export interface CreateConfigContextOptions {
  readonly env: EnvMap;
  readonly paths: ConfigPaths;
}

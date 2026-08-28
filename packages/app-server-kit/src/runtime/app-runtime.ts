import { createConfigPaths } from '../config/paths.js';
import type { ConfigPaths } from '../config/types.js';

export interface CreateAppRuntimeOptions {
  readonly paths?: ConfigPaths;
}

export interface AppRuntime<TConfig = unknown> {
  readonly config: TConfig;
  readonly paths: ConfigPaths;
}

export function createAppRuntime<TConfig>(
  config: TConfig,
  options: CreateAppRuntimeOptions = {},
): AppRuntime<TConfig> {
  return {
    config,
    paths: options.paths ?? createConfigPaths({ rootDir: process.cwd() }),
  };
}

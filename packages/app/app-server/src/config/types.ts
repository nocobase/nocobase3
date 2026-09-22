export type EnvMap = Record<string, string | undefined>;

export type { AppPaths } from './paths.js';
import type { AppPaths } from './paths.js';

export interface ConfigContext {
  readonly environment: EnvMap;
  readonly paths: AppPaths;
}

export interface CreateConfigContextOptions {
  readonly env: EnvMap;
  readonly paths: AppPaths;
}

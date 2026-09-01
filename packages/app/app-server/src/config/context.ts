import type { ConfigContext, CreateConfigContextOptions } from './types.js';

export function createConfigContext(
  options: CreateConfigContextOptions,
): ConfigContext {
  return {
    environment: options.env,
    paths: options.paths,
  };
}

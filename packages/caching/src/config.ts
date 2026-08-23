import type { CachingConfig } from './types.js';

export function createDefaultCachingConfig(): CachingConfig {
  return {
    default: 'memory',
    providers: {
      memory: {
        driver: 'memory',
      },
    },
  };
}

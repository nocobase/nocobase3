import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import type { AppCacheConfig } from '@nocobase/cache';

const cacheConfig: ConfigFactory<AppCacheConfig> = defineConfig(
  ({ env }): AppCacheConfig => ({
    default: env.string('CACHE_STORE', 'memory'),

    stores: {
      memory: {
        driver: 'memory',
        ttl: env.string('CACHE_TTL', '5m'),
        maxTtl: env.string('CACHE_MAX_TTL'),
        namespace: env.string('CACHE_PREFIX', 'nocobase'),
        lruSize: env.number('CACHE_MEMORY_LRU_SIZE', 0),
        checkInterval: env.number('CACHE_MEMORY_CHECK_INTERVAL', 0),
        useClone: env.boolean('CACHE_MEMORY_USE_CLONE', true),
        stats: env.boolean('CACHE_STATS', false),
        tags: env.boolean('CACHE_TAGS', false),
      },

      null: {
        driver: 'null',
      },
    },
  }),
);

export default cacheConfig;

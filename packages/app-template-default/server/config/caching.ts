import { defineConfig, type ConfigFactory } from '@nocobase/app-runtime/config';
import type { CachingConfig } from '@nocobase/caching';

const cachingConfig: ConfigFactory<CachingConfig> = defineConfig(
  ({ env }): CachingConfig => ({
    default: env.string('CACHING_DEFAULT', 'memory'),

    providers: {
      memory: {
        driver: 'memory',
        defaultTtl: env.string('CACHING_MEMORY_DEFAULT_TTL', '5m'),
        maxTtl: env.string('CACHING_MEMORY_MAX_TTL'),
        maxSize: env.number('CACHING_MEMORY_MAX_SIZE', 2_000),
        checkInterval: env.string('CACHING_MEMORY_CHECK_INTERVAL'),
        useClone: env.boolean('CACHING_MEMORY_USE_CLONE', true),
      },
    },
  }),
);

export default cachingConfig;

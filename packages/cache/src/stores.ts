import { createKeyv } from '@cacheable/memory';
import { Cacheable, Keyv } from 'cacheable';

import { NullKeyvStore } from './null-store.js';
import type { AppCacheStoreConfig, MemoryCacheStoreConfig, NocoBaseCacheStore } from './types.js';

export function createCacheStore(config: AppCacheStoreConfig): NocoBaseCacheStore {
  if (config.driver === 'memory') {
    return createMemoryCacheStore(config);
  }

  return createNullCacheStore();
}

export function createMemoryCacheStore(config: MemoryCacheStoreConfig): NocoBaseCacheStore {
  return new Cacheable({
    primary: createKeyv({
      ttl: config.ttl,
      maxTtl: config.maxTtl,
      namespace: config.namespace,
      lruSize: config.lruSize,
      checkInterval: config.checkInterval,
      useClone: config.useClone,
      stats: config.stats,
    }),
    ttl: config.ttl,
    maxTtl: config.maxTtl,
    namespace: config.namespace,
    stats: config.stats,
    tags: config.tags,
  });
}

export function createNullCacheStore(): NocoBaseCacheStore {
  const primary = new Keyv({ store: new NullKeyvStore() });
  primary.serialize = undefined;
  primary.deserialize = undefined;

  return new Cacheable({ primary });
}

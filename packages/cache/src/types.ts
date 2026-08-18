import type { Cacheable } from 'cacheable';

export type CacheTtl = number | string;

export interface MemoryCacheStoreConfig {
  driver: 'memory';
  ttl?: CacheTtl;
  maxTtl?: CacheTtl;
  namespace?: string;
  lruSize?: number;
  checkInterval?: number;
  useClone?: boolean;
  stats?: boolean;
  tags?: boolean;
}

export interface NullCacheStoreConfig {
  driver: 'null';
}

export type AppCacheStoreConfig = MemoryCacheStoreConfig | NullCacheStoreConfig;

export interface AppCacheConfig {
  default: string;
  stores: Record<string, AppCacheStoreConfig>;
}

export type NocoBaseCacheStore = Cacheable;

export interface NocoBaseCacheManager {
  use(name?: string): NocoBaseCacheStore;
  disconnectAll(): Promise<void>;
}

import { createCacheStore } from './stores.js';
import type { AppCacheConfig, NocoBaseCacheManager, NocoBaseCacheStore } from './types.js';

export function createNullCacheConfig(): AppCacheConfig {
  return {
    default: 'null',
    stores: {
      null: {
        driver: 'null',
      },
    },
  };
}

export function createCacheManager(config: AppCacheConfig): NocoBaseCacheManager {
  assertDefaultStore(config);

  const stores = new Map<string, NocoBaseCacheStore>(
    Object.entries(config.stores).map(([name, store]) => [
      name,
      createCacheStore(store),
    ]),
  );

  return {
    use(name = config.default): NocoBaseCacheStore {
      const store = stores.get(name);
      if (!store) {
        throw new Error(`Cache store "${name}" is not configured.`);
      }

      return store;
    },

    async disconnectAll(): Promise<void> {
      await Promise.all(Array.from(stores.values(), (store) => store.disconnect()));
    },
  };
}

export function assertDefaultStore(config: AppCacheConfig): void {
  if (!config.stores[config.default]) {
    throw new Error(`Default cache store "${config.default}" is not configured.`);
  }
}

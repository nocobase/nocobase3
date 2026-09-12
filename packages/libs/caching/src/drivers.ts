import { resolveTtlConfig } from './internal/duration.js';
import { MemoryCacheProvider } from './memory-provider.js';
import type {
  CacheProvider,
  CacheProviderConfig,
  CacheProviderDriver,
  CacheProviderDriverContext,
  MemoryCacheProviderConfig,
} from './types.js';

export const memoryCacheProviderDriver: CacheProviderDriver = {
  name: 'memory',
  createProvider(
    config: CacheProviderConfig,
    _context: CacheProviderDriverContext,
  ): CacheProvider {
    const memory = config as MemoryCacheProviderConfig;
    return new MemoryCacheProvider({
      maxSize: memory.maxSize,
      defaultTtl: resolveTtlConfig(
        memory.defaultTtl,
        'Memory cache defaultTtl',
      ),
      maxTtl: resolveTtlConfig(memory.maxTtl, 'Memory cache maxTtl'),
      checkInterval: resolveTtlConfig(
        memory.checkInterval,
        'Memory cache checkInterval',
      ),
      useClone: memory.useClone,
    });
  },
};

const drivers = new Map<string, CacheProviderDriver>([
  [memoryCacheProviderDriver.name, memoryCacheProviderDriver],
]);

export function registerCachingDriver(driver: CacheProviderDriver): () => void {
  if (drivers.has(driver.name)) {
    throw new Error(
      `Cache provider driver "${driver.name}" is already registered.`,
    );
  }
  drivers.set(driver.name, driver);
  return () => {
    if (drivers.get(driver.name) === driver) {
      drivers.delete(driver.name);
    }
  };
}

export function getCachingDriver(
  name: string,
): CacheProviderDriver | undefined {
  return drivers.get(name);
}

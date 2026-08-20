import { createDefaultCachingConfig } from './config.js';
import { getCachingDriver } from './drivers.js';
import { resolveTtlConfig } from './internal/duration.js';
import { assertNamespace } from './internal/validation.js';
import type {
  BloomFilter,
  Cache,
  CacheProvider,
  CacheProviderConfig,
  CacheProviderRuntimeOptions,
  CachingConfig,
  Counter,
  GetCacheOptions,
  GetCapabilityOptions,
} from './types.js';

interface ProviderState {
  provider: CacheProvider;
  initializationConfig: CacheProviderConfig;
}

export class Caching {
  private readonly providers = new Map<string, ProviderState>();

  constructor(private readonly config: CachingConfig = createDefaultCachingConfig()) {
    validateCachingConfig(config);
  }

  getCache(options: GetCacheOptions): Cache {
    const {
      provider: providerName,
      namespace,
      defaultTtl,
      ...runtimeOptions
    } = options;
    assertNamespace(namespace);
    return this.getOrCreateProvider(providerName, runtimeOptions).createCache({
      namespace,
      defaultTtl: resolveTtlConfig(defaultTtl, `Cache "${namespace}" defaultTtl`),
    });
  }

  getCounter(options: GetCapabilityOptions): Counter {
    const { provider: providerName, namespace, ...runtimeOptions } = options;
    assertNamespace(namespace);
    return this.getOrCreateProvider(providerName, runtimeOptions).createCounter({ namespace });
  }

  getBloomFilter(options: GetCapabilityOptions): BloomFilter {
    const { provider: providerName, namespace, ...runtimeOptions } = options;
    assertNamespace(namespace);
    return this.getOrCreateProvider(providerName, runtimeOptions).createBloomFilter({ namespace });
  }

  async dispose(): Promise<void> {
    const providers = [...new Set([...this.providers.values()].map(({ provider }) => provider))];
    this.providers.clear();
    await Promise.all(providers.map((provider) => provider.dispose()));
  }

  private getOrCreateProvider(
    requestedName: string | undefined,
    runtimeOptions: CacheProviderRuntimeOptions,
  ): CacheProvider {
    const name = requestedName ?? this.config.default;
    const definition = this.config.providers[name];
    if (!definition) {
      throw new Error(`Cache provider "${name}" is not configured.`);
    }

    const effectiveRuntimeOptions = removeUndefinedValues(runtimeOptions);
    const existing = this.providers.get(name);
    if (existing) {
      assertCompatibleOptions(name, existing.initializationConfig, effectiveRuntimeOptions);
      return existing.provider;
    }

    const driver = getCachingDriver(definition.driver);
    if (!driver) {
      throw new Error(`Cache provider driver "${definition.driver}" is not registered.`);
    }
    assertDoesNotOverrideStaticConfig(name, definition, effectiveRuntimeOptions);
    const initializationConfig = {
      ...definition,
      ...effectiveRuntimeOptions,
    };
    const provider = driver.createProvider(initializationConfig, { name });
    this.providers.set(name, { provider, initializationConfig });
    return provider;
  }
}

export function createCaching(config: CachingConfig = createDefaultCachingConfig()): Caching {
  return new Caching(config);
}

function validateCachingConfig(config: CachingConfig): void {
  const defaultProvider = config.providers[config.default];
  if (!defaultProvider) {
    throw new Error(`Default cache provider "${config.default}" is not configured.`);
  }

  for (const provider of Object.values(config.providers)) {
    if (!getCachingDriver(provider.driver)) {
      throw new Error(`Cache provider driver "${provider.driver}" is not registered.`);
    }
  }
}

function removeUndefinedValues(options: CacheProviderRuntimeOptions): CacheProviderRuntimeOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );
}

function assertDoesNotOverrideStaticConfig(
  providerName: string,
  definition: CacheProviderConfig,
  runtimeOptions: CacheProviderRuntimeOptions,
): void {
  for (const [key, value] of Object.entries(runtimeOptions)) {
    if (key in definition && definition[key] !== value) {
      throw new Error(
        `Cache provider "${providerName}" has a different static "${key}" option.`,
      );
    }
  }
}

function assertCompatibleOptions(
  providerName: string,
  initializationConfig: CacheProviderConfig,
  runtimeOptions: CacheProviderRuntimeOptions,
): void {
  for (const [key, value] of Object.entries(runtimeOptions)) {
    if (initializationConfig[key] !== value) {
      throw new Error(
        `Cache provider "${providerName}" is already initialized with a different "${key}" option.`,
      );
    }
  }
}

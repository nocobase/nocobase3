import type {
  BloomFilter,
  Cache,
  CacheOptions,
  CacheProvider,
  Counter,
  MemoryCacheProviderOptions,
  NamespacedOptions,
} from './types.js';
import { MemoryCache } from './memory-cache.js';
import { MemoryCounter } from './memory-counter.js';
import { MemoryBloomFilter } from './memory-bloom-filter.js';
import { assertMaxSize, assertNamespace, assertTtl } from './internal/validation.js';

export class MemoryCacheProvider implements CacheProvider {
  private readonly maxSize: number;
  private readonly defaultTtl?: number;
  private readonly useClone: boolean;
  private readonly caches = new Map<string, { cache: MemoryCache; defaultTtl?: number }>();
  private readonly counters = new Map<string, MemoryCounter>();
  private readonly bloomFilters = new Map<string, MemoryBloomFilter>();

  constructor(options: MemoryCacheProviderOptions = {}) {
    this.maxSize = options.maxSize ?? 2_000;
    this.defaultTtl = options.defaultTtl;
    this.useClone = options.useClone ?? true;
    assertMaxSize(this.maxSize);
    assertTtl(this.defaultTtl);
  }

  async connect(): Promise<void> {
    // Memory storage has no external connection.
  }

  createCache(options: CacheOptions): Cache {
    assertNamespace(options.namespace);
    const defaultTtl = options.defaultTtl ?? this.defaultTtl;
    assertTtl(defaultTtl);
    const existing = this.caches.get(options.namespace);
    if (existing) {
      if (existing.defaultTtl !== defaultTtl) {
        throw new Error(`Cache namespace "${options.namespace}" already uses a different default TTL.`);
      }
      return existing.cache;
    }

    const cache = new MemoryCache({
      namespace: options.namespace,
      maxSize: this.maxSize,
      defaultTtl,
      useClone: this.useClone,
    });
    this.caches.set(options.namespace, { cache, defaultTtl });
    return cache;
  }

  createCounter(options: NamespacedOptions): Counter {
    assertNamespace(options.namespace);
    const existing = this.counters.get(options.namespace);
    if (existing) return existing;
    const counter = new MemoryCounter({ namespace: options.namespace, maxSize: this.maxSize });
    this.counters.set(options.namespace, counter);
    return counter;
  }

  createBloomFilter(options: NamespacedOptions): BloomFilter {
    assertNamespace(options.namespace);
    const existing = this.bloomFilters.get(options.namespace);
    if (existing) return existing;
    const filter = new MemoryBloomFilter(options.namespace);
    this.bloomFilters.set(options.namespace, filter);
    return filter;
  }

  async disconnect(): Promise<void> {
    await Promise.all([...this.caches.values()].map(({ cache }) => cache.disconnect()));
    for (const counter of this.counters.values()) counter.clear();
    for (const filter of this.bloomFilters.values()) filter.clear();
    this.caches.clear();
    this.counters.clear();
    this.bloomFilters.clear();
  }
}

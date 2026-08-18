export interface Cache {
  readonly namespace: string;

  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;

  /** Atomically reads and removes a value. */
  take<T>(key: string): Promise<T | undefined>;

  /** Loads and caches a missing value, coalescing concurrent loads in this process. */
  wrap<T>(key: string, loader: () => T | Promise<T>, ttl?: number): Promise<T>;
}

export interface Counter {
  readonly namespace: string;

  get(key: string): Promise<number>;

  /**
   * Atomically increments a value. TTL is applied only when the value is first created.
   */
  increment(key: string, amount?: number, ttl?: number): Promise<number>;

  reset(key: string): Promise<void>;
}

export interface BloomFilterOptions {
  capacity: number;
  errorRate: number;
}

export interface BloomFilter {
  readonly namespace: string;

  reserve(key: string, options: BloomFilterOptions): Promise<void>;
  add(key: string, value: string): Promise<void>;
  addMany(key: string, values: string[]): Promise<void>;
  has(key: string, value: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export interface CacheOptions {
  namespace: string;
  defaultTtl?: number;
}

export interface NamespacedOptions {
  namespace: string;
}

export interface CacheProvider {
  connect(): Promise<void>;
  createCache(options: CacheOptions): Cache;
  createCounter(options: NamespacedOptions): Counter;
  createBloomFilter(options: NamespacedOptions): BloomFilter;
  disconnect(): Promise<void>;
}

export interface MemoryCacheProviderOptions {
  /** Maximum entries in each cache or counter namespace. */
  maxSize?: number;
  /** Default cache TTL in milliseconds. */
  defaultTtl?: number;
  /** Clone cached values on read and write. */
  useClone?: boolean;
}

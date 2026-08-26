export interface RuntimeCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del?(key: string): Promise<void>;
}

export interface RuntimeCaching {
  getCache(options: { namespace: string }): RuntimeCache;
}

import { createKeyv } from '@cacheable/memory';
import type { Keyv } from 'keyv';
import type { Cache } from './types.js';
import { KeyedLock } from './internal/keyed-lock.js';
import { assertNamespace, assertTtl } from './internal/validation.js';

export interface MemoryCacheOptions {
  namespace: string;
  maxSize: number;
  defaultTtl?: number;
  useClone?: boolean;
}

export class MemoryCache implements Cache {
  readonly namespace: string;
  private readonly store: Keyv;
  private readonly lock = new KeyedLock();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(options: MemoryCacheOptions) {
    assertNamespace(options.namespace);
    assertTtl(options.defaultTtl);
    this.namespace = options.namespace;
    this.store = createKeyv({
      namespace: options.namespace,
      ttl: options.defaultTtl,
      lruSize: options.maxSize,
      useClone: options.useClone ?? true,
    });
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.lock.run(key, () => this.store.get<T>(key));
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    assertTtl(ttl);
    await this.lock.run(key, async () => {
      await this.store.set(key, value, ttl);
    });
  }

  async delete(key: string): Promise<void> {
    await this.lock.run(key, async () => {
      await this.store.delete(key);
    });
  }

  clear(): Promise<void> {
    return this.store.clear();
  }

  take<T>(key: string): Promise<T | undefined> {
    return this.lock.run(key, async () => {
      const value = await this.store.get<T>(key);
      if (value !== undefined) await this.store.delete(key);
      return value;
    });
  }

  async wrap<T>(key: string, loader: () => T | Promise<T>, ttl?: number): Promise<T> {
    assertTtl(ttl);
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const active = this.pending.get(key);
    if (active) return active as Promise<T>;

    const loading = Promise.resolve()
      .then(loader)
      .then(async (value) => {
        if (value !== undefined) await this.set(key, value, ttl);
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === loading) this.pending.delete(key);
      });
    this.pending.set(key, loading);
    return loading;
  }

  async disconnect(): Promise<void> {
    await this.store.disconnect();
  }
}

import type { CacheProvider } from '@nocobase/caching';
import type { BetterAuthOptions } from 'better-auth';

type SecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>;

/** Adapts a NocoBase cache provider to Better Auth secondary storage. */
export function createAuthStorage(
  provider: CacheProvider,
  options: { namespace?: string } = {},
): SecondaryStorage {
  const namespace = options.namespace ?? 'nocobase-auth';
  const cache = provider.createCache({ namespace });
  const counter = provider.createCounter({ namespace: `${namespace}:rate-limit` });

  return {
    async get(key) {
      return (await cache.get<string>(key)) ?? null;
    },

    async set(key, value, ttl) {
      await cache.set(key, value, ttl ? ttl * 1_000 : undefined);
    },

    async delete(key) {
      await cache.delete(key);
    },

    async getAndDelete(key) {
      return (await cache.take<string>(key)) ?? null;
    },

    async increment(key, ttl) {
      return counter.increment(key, 1, ttl * 1_000);
    },
  };
}

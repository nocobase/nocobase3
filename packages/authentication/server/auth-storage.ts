import type { Caching } from '@nocobase/caching';
import type { BetterAuthOptions } from 'better-auth';

type SecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>;

/** Adapts NocoBase caching to Better Auth secondary storage. */
export function createAuthStorage(
  caching: Caching,
  options: { namespace?: string; provider?: string } = {},
): SecondaryStorage {
  const namespace = options.namespace ?? 'nocobase-auth';
  const cache = caching.getCache({
    namespace,
    provider: options.provider,
  });
  const counter = caching.getCounter({
    namespace: `${namespace}:rate-limit`,
    provider: options.provider,
  });

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

import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import type { NocoBaseCacheManager } from '@nocobase/cache';

const cacheDemoKey = 'examples:cache:demo';
const cacheDemoTtl = '30s';

export interface CacheRoutesOptions {
  cacheManager: NocoBaseCacheManager;
}

export function createCacheRoutes(options: CacheRoutesOptions): Hono {
  const routes = new Hono();

  routes.get('/demo', async (c) => {
    const cache = options.cacheManager.use();
    let cached = true;
    const value = await cache.getOrSet(
      cacheDemoKey,
      async () => {
        cached = false;
        return {
          id: randomUUID(),
          generatedAt: new Date().toISOString(),
        };
      },
      { ttl: cacheDemoTtl },
    );

    return c.json({
      key: cacheDemoKey,
      ttl: cacheDemoTtl,
      cached,
      value,
    });
  });

  routes.delete('/demo', async (c) => {
    const cache = options.cacheManager.use();

    return c.json({
      key: cacheDemoKey,
      deleted: await cache.delete(cacheDemoKey),
    });
  });

  return routes;
}

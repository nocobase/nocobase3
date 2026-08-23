import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import type { Caching } from '@nocobase/caching';

const cacheDemoKey = 'demo';
const cacheDemoTtl = 30_000;

export interface CacheRoutesOptions {
  caching: Caching;
}

export function createCacheRoutes(options: CacheRoutesOptions): Hono {
  const routes = new Hono();
  const cache = options.caching.getCache({ namespace: 'examples:cache' });

  routes.get('/demo', async (c) => {
    let cached = true;
    const value = await cache.wrap(
      cacheDemoKey,
      async () => {
        cached = false;
        return {
          id: randomUUID(),
          generatedAt: new Date().toISOString(),
        };
      },
      cacheDemoTtl,
    );

    return c.json({
      key: cacheDemoKey,
      ttl: cacheDemoTtl,
      cached,
      value,
    });
  });

  routes.delete('/demo', async (c) => {
    return c.json({
      key: cacheDemoKey,
      deleted: await cache.delete(cacheDemoKey),
    });
  });

  return routes;
}

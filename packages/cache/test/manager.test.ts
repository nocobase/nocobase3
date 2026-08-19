import { setTimeout as sleep } from 'node:timers/promises';

import { Cacheable } from 'cacheable';
import { describe, expect, it } from 'vitest';

import {
  assertDefaultStore,
  createCacheManager,
  createNullCacheConfig,
  type AppCacheConfig,
} from '../src/index.js';

describe('createCacheManager', () => {
  it('creates cacheable stores from declarative config', async () => {
    const cacheManager = createCacheManager(createConfig());
    const cache = cacheManager.use();

    expect(cache).toBeInstanceOf(Cacheable);
    expect(cacheManager.use('memory')).toBe(cache);

    await cache.set('hello', 'world', '1m');

    await expect(cache.get('hello')).resolves.toBe('world');
  });

  it('uses a configured default store', async () => {
    const cacheManager = createCacheManager({
      default: 'secondary',
      stores: {
        memory: {
          driver: 'memory',
        },
        secondary: {
          driver: 'memory',
        },
      },
    });

    await cacheManager.use('memory').set('key', 'memory');
    await cacheManager.use('secondary').set('key', 'secondary');

    await expect(cacheManager.use().get('key')).resolves.toBe('secondary');
  });

  it('throws when the default store is missing', () => {
    expect(() =>
      createCacheManager({
        default: 'missing',
        stores: {},
      }),
    ).toThrow('Default cache store "missing" is not configured.');
  });

  it('throws when a requested store is missing', () => {
    const cacheManager = createCacheManager(createConfig());

    expect(() => cacheManager.use('missing')).toThrow('Cache store "missing" is not configured.');
  });

  it('supports getOrSet using the cacheable API', async () => {
    const cache = createCacheManager(createConfig()).use();
    let calls = 0;

    const first = await cache.getOrSet(
      'computed',
      async () => {
        calls += 1;
        return { ok: true };
      },
      { ttl: '1m' },
    );
    const second = await cache.getOrSet(
      'computed',
      async () => {
        calls += 1;
        return { ok: false };
      },
      { ttl: '1m' },
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(calls).toBe(1);
  });

  it('expires memory entries using ttl', async () => {
    const cache = createCacheManager({
      default: 'memory',
      stores: {
        memory: {
          driver: 'memory',
          ttl: 20,
        },
      },
    }).use();

    await cache.set('short', 'lived');
    await sleep(40);

    await expect(cache.get('short')).resolves.toBeUndefined();
  });

  it('creates a null cache config fallback', async () => {
    const cache = createCacheManager(createNullCacheConfig()).use();

    await expect(cache.set('key', 'value')).resolves.toBe(true);
    await expect(cache.get('key')).resolves.toBeUndefined();
    await expect(cache.has('key')).resolves.toBe(false);
  });

  it('disconnects all configured stores', async () => {
    const cacheManager = createCacheManager(createConfig());

    await expect(cacheManager.disconnectAll()).resolves.toBeUndefined();
  });
});

describe('assertDefaultStore', () => {
  it('accepts a configured default store', () => {
    expect(() => assertDefaultStore(createConfig())).not.toThrow();
  });
});

function createConfig(): AppCacheConfig {
  return {
    default: 'memory',
    stores: {
      memory: {
        driver: 'memory',
        ttl: '5m',
        namespace: 'tests',
        lruSize: 10,
        checkInterval: 0,
        useClone: true,
        stats: true,
        tags: true,
      },
      null: {
        driver: 'null',
      },
    },
  };
}

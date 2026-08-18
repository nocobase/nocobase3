import { MemoryCacheProvider } from '@nocobase/caching';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthStorage } from '../src/auth-storage.js';

describe('createAuthStorage', () => {
  const providers: MemoryCacheProvider[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(providers.splice(0).map((provider) => provider.disconnect()));
  });

  function createStorage(namespace?: string) {
    const provider = new MemoryCacheProvider();
    providers.push(provider);
    return {
      provider,
      storage: createAuthStorage(provider, namespace ? { namespace } : undefined),
    };
  }

  it('uses the nocobase-auth namespace by default and converts TTL seconds', async () => {
    vi.useFakeTimers();
    const { provider, storage } = createStorage();

    await storage.set('session', 'value', 1);
    await expect(storage.get('session')).resolves.toBe('value');
    await expect(provider.createCache({ namespace: 'nocobase-auth' }).get('session'))
      .resolves.toBe('value');

    await vi.advanceTimersByTimeAsync(1_001);
    await expect(storage.get('session')).resolves.toBeNull();
  });

  it('atomically consumes one-time values', async () => {
    const { storage } = createStorage();
    await storage.set('verification', 'value', 60);

    const values = await Promise.all([
      storage.getAndDelete!('verification'),
      storage.getAndDelete!('verification'),
    ]);
    expect(values.filter((value) => value === 'value')).toHaveLength(1);
  });

  it('uses an atomic fixed-window counter for rate limiting', async () => {
    const { storage } = createStorage('custom-auth');

    await expect(Promise.all([
      storage.increment!('sign-in', 10),
      storage.increment!('sign-in', 10),
      storage.increment!('sign-in', 10),
    ])).resolves.toEqual([1, 2, 3]);
  });
});

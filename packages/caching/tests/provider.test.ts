import { describe, expect, it, vi } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';

import {
  CachingProvider,
  cachingToken,
  createDefaultCachingConfig,
} from '../src/index.js';

describe('CachingProvider', () => {
  it('registers and disposes the configured caching service', async () => {
    const container = new ServiceContainer();
    const config = createDefaultCachingConfig();
    const provider = new CachingProvider({
      config: { caching: config },
      container,
    });

    provider.register();
    const caching = container.resolve(cachingToken);
    const dispose = vi.spyOn(caching, 'dispose');

    expect(provider.name).toBe('@nocobase/caching');
    expect(container.resolve(cachingToken)).toBe(caching);

    await provider.shutdown();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('does not create the caching service during shutdown', async () => {
    const container = new ServiceContainer();
    const provider = new CachingProvider({
      config: { caching: createDefaultCachingConfig() },
      container,
    });

    provider.register();
    await provider.shutdown();

    expect(container.resolveIfCreated(cachingToken)).toBeUndefined();
  });
});

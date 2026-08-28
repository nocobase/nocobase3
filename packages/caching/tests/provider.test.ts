import { describe, expect, it, vi } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';

import {
  CachingProvider,
  cachingToken,
  createDefaultCachingConfig,
} from '../src/index.js';

describe('CachingProvider', () => {
  it('registers and disposes the configured caching service', async () => {
    const serviceContainer = new ServiceContainer();
    const config = createDefaultCachingConfig();
    const provider = new CachingProvider({
      runtime: { config: { caching: config } },
      serviceContainer,
    });

    provider.register();
    const caching = serviceContainer.resolve(cachingToken);
    const dispose = vi.spyOn(caching, 'dispose');

    expect(provider.name).toBe('@nocobase/caching');
    expect(serviceContainer.resolve(cachingToken)).toBe(caching);

    await provider.shutdown();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('does not create the caching service during shutdown', async () => {
    const serviceContainer = new ServiceContainer();
    const provider = new CachingProvider({
      runtime: { config: { caching: createDefaultCachingConfig() } },
      serviceContainer,
    });

    provider.register();
    await provider.shutdown();

    expect(serviceContainer.resolveIfCreated(cachingToken)).toBeUndefined();
  });
});

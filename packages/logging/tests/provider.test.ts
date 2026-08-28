import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createSilentLoggingConfig,
  LoggingProvider,
  loggingToken,
} from '../src/index.js';

describe('LoggingProvider', () => {
  it('registers and flushes the configured logging service', async () => {
    const serviceContainer = new ServiceContainer();
    const provider = new LoggingProvider({
      runtime: { config: { logging: createSilentLoggingConfig() } },
      serviceContainer,
    });

    provider.register();
    const logging = serviceContainer.resolve(loggingToken);
    const flush = vi.spyOn(logging, 'flush');

    expect(provider.name).toBe('@nocobase/logging');
    await provider.shutdown();
    expect(flush).toHaveBeenCalledOnce();
  });

  it('does not create logging during shutdown', async () => {
    const serviceContainer = new ServiceContainer();
    const provider = new LoggingProvider({
      runtime: { config: {} },
      serviceContainer,
    });

    provider.register();
    await provider.shutdown();

    expect(serviceContainer.resolveIfCreated(loggingToken)).toBeUndefined();
  });
});

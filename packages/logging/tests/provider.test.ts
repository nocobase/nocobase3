import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createSilentLoggingConfig,
  LoggingProvider,
  loggingToken,
} from '../src/index.js';

describe('LoggingProvider', () => {
  it('registers and flushes the configured logging service', async () => {
    const container = new ServiceContainer();
    const provider = new LoggingProvider({
      config: { logging: createSilentLoggingConfig() },
      container,
    });

    provider.register();
    const logging = container.resolve(loggingToken);
    const flush = vi.spyOn(logging, 'flush');

    expect(provider.name).toBe('@nocobase/logging');
    await provider.shutdown();
    expect(flush).toHaveBeenCalledOnce();
  });

  it('does not create logging during shutdown', async () => {
    const container = new ServiceContainer();
    const provider = new LoggingProvider({
      config: {},
      container,
    });

    provider.register();
    await provider.shutdown();

    expect(container.resolveIfCreated(loggingToken)).toBeUndefined();
  });
});

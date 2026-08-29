import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createNullSessionConfig,
  SessionProvider,
  sessionManagerToken,
} from '../src/index.js';

describe('SessionProvider', () => {
  it('registers and disposes the configured session manager', async () => {
    const container = new ServiceContainer();
    const provider = new SessionProvider({
      config: { session: createNullSessionConfig() },
      container,
    });

    provider.register();
    const sessionManager = container.resolve(sessionManagerToken);
    const dispose = vi.spyOn(sessionManager, 'dispose');

    expect(provider.name).toBe('@nocobase/session');
    await provider.shutdown();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('uses the null session manager by default', () => {
    const container = new ServiceContainer();
    const provider = new SessionProvider({
      config: {},
      container,
    });

    provider.register();

    expect(container.resolve(sessionManagerToken).config.enabled).toBe(false);
  });
});

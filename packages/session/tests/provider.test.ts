import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createNullSessionConfig,
  SessionProvider,
  sessionManagerToken,
} from '../src/index.js';

describe('SessionProvider', () => {
  it('registers and disposes the configured session manager', async () => {
    const serviceContainer = new ServiceContainer();
    const provider = new SessionProvider({
      runtime: { config: { session: createNullSessionConfig() } },
      serviceContainer,
    });

    provider.register();
    const sessionManager = serviceContainer.resolve(sessionManagerToken);
    const dispose = vi.spyOn(sessionManager, 'dispose');

    expect(provider.name).toBe('@nocobase/session');
    await provider.shutdown();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('uses the null session manager by default', () => {
    const serviceContainer = new ServiceContainer();
    const provider = new SessionProvider({
      runtime: { config: {} },
      serviceContainer,
    });

    provider.register();

    expect(serviceContainer.resolve(sessionManagerToken).config.enabled).toBe(
      false,
    );
  });
});

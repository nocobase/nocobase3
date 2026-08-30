import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { ServiceProviderExampleProvider } from '../server/providers/service-provider-example.js';
import { heartbeatServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-service-provider-example provider', () => {
  it('registers the heartbeat and manages its lifecycle', async () => {
    const container = new ServiceContainer();
    const provider = new ServiceProviderExampleProvider({
      container,
      config: {
        get: () => ({ enabled: true }),
      },
    });

    expect(provider.name).toBe('@nocobase/app-plugin-service-provider-example');
    provider.register();

    const heartbeat = container.resolve(heartbeatServiceToken);
    expect(heartbeat.getState()).toEqual({
      status: 'stopped',
      startedAt: undefined,
    });

    await provider.start();
    expect(heartbeat.getState()).toEqual({
      status: 'running',
      startedAt: expect.any(String),
    });

    await provider.ready();
    expect(heartbeat.getState()).toEqual({
      status: 'ready',
      startedAt: expect.any(String),
    });

    await provider.shutdown();
    expect(heartbeat.getState()).toEqual({
      status: 'stopped',
      startedAt: undefined,
    });
  });

  it('does not create the lazy service during shutdown', async () => {
    const container = new ServiceContainer();
    const provider = new ServiceProviderExampleProvider({
      container,
      config: {
        get: () => ({ enabled: true }),
      },
    });

    provider.register();
    await provider.shutdown();

    expect(container.resolveIfCreated(heartbeatServiceToken)).toBeUndefined();
  });
});

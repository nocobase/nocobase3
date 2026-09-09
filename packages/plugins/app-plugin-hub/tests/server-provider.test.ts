import { databaseManagerToken } from '@nocobase/db';
import { AppHostSupervisor } from '@nocobase/app-host/supervisor';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { HubProvider } from '../server/providers/hub.js';
import { hubServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-hub', () => {
  it('registers its service as a lazy singleton', () => {
    const container = new ServiceContainer();
    const provider = new HubProvider({
      container,
      config: { get: () => ({}) } as never,
    });

    expect(provider.name).toBe('@nocobase/app-plugin-hub');
    expect(container.resolveIfCreated(hubServiceToken)).toBeUndefined();

    provider.register();

    expect(container.has(hubServiceToken)).toBe(true);
    expect(container.resolveIfCreated(hubServiceToken)).toBeUndefined();
    expect(container.has(databaseManagerToken)).toBe(false);
  });

  it('does not shut down a supervisor it did not initialize', async () => {
    const supervisor = AppHostSupervisor.initialize({ enabled: false });
    const container = new ServiceContainer();
    const provider = new HubProvider({
      container,
      config: { get: () => ({}) } as never,
    });
    try {
      provider.register();
      await provider.shutdown();
      expect(container.resolveIfCreated(hubServiceToken)).toBeUndefined();
      expect(AppHostSupervisor.getInstance()).toBe(supervisor);
    } finally {
      await supervisor.shutdown();
    }
  });
});

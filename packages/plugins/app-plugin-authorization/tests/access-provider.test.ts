import { expect, it, vi } from 'vitest';
import {
  ClientApplication,
  createAppClientConfig,
  defineAppClientRenderConfig,
} from '@nocobase/app-client';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import { AuthorizationServiceProvider } from '../client/service-provider.js';
import { clientAccessResolversToken } from '../client/access-resolvers.js';
import { getAuthorizationClient } from '../client/runtime.js';

it('keeps a reused matched denial in the actual access provider without page fallback', async () => {
  const runtime = await resolveAppRuntime(
    defineAppRuntime({
      packageName: '@synthetic/composition',
      config: createAppClientConfig,
      serviceProviders: [AuthorizationServiceProvider],
      plugins: defineClientPlugins([]),
    }),
  );
  const app = new ClientApplication({
    runtime,
    createRenderConfig: () => defineAppClientRenderConfig({ routes: null }),
  });
  await app.start();
  const pageAccess = vi
    .spyOn(getAuthorizationClient(), 'can')
    .mockResolvedValue(true);
  try {
    const registry = app.container.resolve(clientAccessResolversToken);
    const deny = async (): Promise<{ can: boolean }> => ({ can: false });
    const old = registry.register('audit.events', deny);
    old();
    const current = registry.register('audit.events', deny);
    old();
    const access = app.refineConfig.accessControlProvider;
    expect(access).toBeDefined();
    expect(
      await access?.can({ resource: 'audit.events', action: 'read' }),
    ).toEqual({ can: false });
    expect(pageAccess).not.toHaveBeenCalled();
    expect(
      await access?.can({ resource: 'ordinary-page', action: 'read' }),
    ).toEqual({ can: true });
    expect(pageAccess).toHaveBeenCalledOnce();
    current();
  } finally {
    pageAccess.mockRestore();
    await app.shutdown();
  }
});

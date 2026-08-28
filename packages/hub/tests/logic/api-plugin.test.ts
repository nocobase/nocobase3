// @vitest-environment node

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  registerHubApiPlugins,
  type HubApiPlugin,
} from '../../server/api-plugin.ts';

describe('Hub API plugins', () => {
  it('mounts capabilities through the generic API plugin boundary', async () => {
    const api = new Hono();
    const registerApiRoutes = vi.fn((router: Hono) => {
      router.get('/example/status', (context) => context.json({ ok: true }));
    });

    registerHubApiPlugins(api, [
      { id: '@nocobase/hub-example', registerApiRoutes },
    ]);

    expect(registerApiRoutes).toHaveBeenCalledOnce();
    const response = await api.request('http://localhost/example/status');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('rejects duplicate plugin ids before a second capability can mount', () => {
    const api = new Hono();
    const plugin: HubApiPlugin = {
      id: '@nocobase/hub-example',
      registerApiRoutes: vi.fn(),
    };

    expect(() => registerHubApiPlugins(api, [plugin, plugin])).toThrow(
      'Hub API plugin "@nocobase/hub-example" is registered more than once.',
    );
    expect(plugin.registerApiRoutes).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { notificationPluginServiceToken } from '@nocobase/app-plugin-notification';
import bootstrap from '../server/bootstrap.js';

describe('notification Providers plugin bootstrap', () => {
  it('registers the Email Channel and SMTP Provider', () => {
    const registry = {
      registerChannel: vi.fn(function () {
        return registry;
      }),
      registerProvider: vi.fn(function () {
        return registry;
      }),
    };
    const manager = { registry, router: new Hono(), send: vi.fn() };

    const pluginServices = {
      get: vi.fn(() => ({ manager })),
      onAvailable: vi.fn((_, consume) => consume({ manager })),
    };
    bootstrap({
      deps: undefined,
      pluginServices,
      runtime: {
        config: { database: {}, notification: { enabled: true, channels: [] } },
      },
      services: {},
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(pluginServices.onAvailable).toHaveBeenCalledWith(
      notificationPluginServiceToken,
      expect.any(Function),
    );

    expect(registry.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'email' }),
    );
    expect(registry.registerProvider).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({ type: 'smtp' }),
    );
    expect(manager.router.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/test/email' }),
      ]),
    );
  });

  it('does nothing when notifications are disabled', () => {
    expect(() =>
      bootstrap({
        deps: undefined,
        pluginServices: { get: vi.fn(() => undefined), onAvailable: vi.fn() },
        runtime: {
          config: {
            database: {},
            notification: { enabled: false, channels: [] },
          },
        },
        services: {},
        lifecycle: { registerDisposer: vi.fn() },
      }),
    ).not.toThrow();
  });
});

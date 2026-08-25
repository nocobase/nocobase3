import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { notificationPluginServiceToken } from '@nocobase/app-plugin-notification';
import bootstrap from '../server/bootstrap.js';

describe('in-app notification plugin bootstrap', () => {
  it('registers its Channel and database Provider', () => {
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
      deps: {
        resolveRequestUserId: vi.fn(),
      },
      pluginServices,
      runtime: {
        config: {
          database: {},
          notification: { enabled: true, channels: [] },
        },
      },
      services: {},
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(registry.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'in-app' }),
    );
    expect(registry.registerProvider).toHaveBeenCalledWith(
      'in-app',
      expect.objectContaining({ type: 'database' }),
    );
    expect(pluginServices.onAvailable).toHaveBeenCalledWith(
      notificationPluginServiceToken,
      expect.any(Function),
    );
    expect(manager.router.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/test/in-app' }),
      ]),
    );
  });

  it('does nothing when notifications are disabled', () => {
    expect(() =>
      bootstrap({
        deps: {
          resolveRequestUserId: vi.fn(),
        },
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

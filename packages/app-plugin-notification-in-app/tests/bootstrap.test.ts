import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import bootstrap from '../server/bootstrap.js';
import { MemoryInAppStore } from '../server/store.js';

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
    const notification = { registry, router: new Hono(), send: vi.fn() };
    bootstrap({
      deps: {
        resolveRequestUserId: vi.fn(),
      },
      services: {
        notification,
        notificationInAppStore: new MemoryInAppStore(),
      },
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(registry.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'in-app' }),
    );
    expect(registry.registerProvider).toHaveBeenCalledWith(
      'in-app',
      expect.objectContaining({ type: 'database' }),
    );
    expect(notification.router.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/in-app' }),
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
        services: {},
        lifecycle: { registerDisposer: vi.fn() },
      }),
    ).not.toThrow();
  });
});

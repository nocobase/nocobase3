import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

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
    const notification = { registry, router: new Hono(), send: vi.fn() };
    bootstrap({
      deps: undefined,
      services: { notification },
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(registry.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'email' }),
    );
    expect(registry.registerProvider).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({ type: 'smtp' }),
    );
    expect(notification.router.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/test/email' }),
      ]),
    );
  });

  it('does nothing when notifications are disabled', () => {
    expect(() =>
      bootstrap({
        deps: undefined,
        services: {},
        lifecycle: { registerDisposer: vi.fn() },
      }),
    ).not.toThrow();
  });
});

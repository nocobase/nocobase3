import { describe, expect, it, vi } from 'vitest';

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

    bootstrap({
      config: {
        app: {},
        server: {},
      },
      deps: {
        auth: {
          async getSession() {
            return null;
          },
        },
      },
      services: { notification: registry },
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(registry.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'in-app' }),
    );
    expect(registry.registerProvider).toHaveBeenCalledWith(
      'in-app',
      expect.objectContaining({ type: 'database' }),
    );
  });

  it('does nothing when notifications are disabled', () => {
    expect(() =>
      bootstrap({
        config: { app: {}, server: {} },
        deps: {
          auth: {
            async getSession() {
              return null;
            },
          },
        },
        services: {},
        lifecycle: { registerDisposer: vi.fn() },
      }),
    ).not.toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';

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

    bootstrap({
      deps: undefined,
      services: { notification: registry },
      lifecycle: { registerDisposer: vi.fn() },
    });

    expect(registry.registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'email' }),
    );
    expect(registry.registerProvider).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({ type: 'smtp' }),
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

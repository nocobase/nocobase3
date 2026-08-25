import { createAppPluginServiceRegistry } from '@nocobase/app-server-kit/plugins';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../server/bootstrap.js';
import { notificationPluginServiceToken } from '../server/service.js';

describe('notification plugin bootstrap', () => {
  it('owns the Manager lifecycle and publishes the notification service', async () => {
    const pluginServices = createAppPluginServiceRegistry();
    const registerJob = vi.fn();
    const registerDisposer = vi.fn();

    bootstrap({
      deps: {
        logging: { getLogger: vi.fn(() => createLogger()) },
        queueManager: { registerJob },
      },
      lifecycle: { registerDisposer },
      pluginServices,
      runtime: {
        config: {
          database: {},
          notification: { enabled: true, channels: [] },
        },
        database: {},
      },
      services: {},
    });

    expect(pluginServices.get(notificationPluginServiceToken)).toEqual({
      manager: expect.any(Object),
    });
    expect(registerJob).toHaveBeenCalledOnce();
    expect(registerDisposer).toHaveBeenCalledWith(
      'manager',
      expect.any(Function),
    );
    await registerDisposer.mock.calls[0]?.[1]();
  });

  it('does not publish a service when notifications are disabled', () => {
    const pluginServices = createAppPluginServiceRegistry();

    bootstrap({
      deps: {
        logging: { getLogger: vi.fn(() => createLogger()) },
        queueManager: { registerJob: vi.fn() },
      },
      lifecycle: { registerDisposer: vi.fn() },
      pluginServices,
      runtime: {
        config: {
          database: {},
          notification: { enabled: false, channels: [] },
        },
      },
      services: {},
    });

    expect(pluginServices.get(notificationPluginServiceToken)).toBeUndefined();
  });
});

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

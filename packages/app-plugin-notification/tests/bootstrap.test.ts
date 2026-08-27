import type { DatabaseManager } from '@nocobase/app-database';
import { createLogger } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { describe, expect, it, vi } from 'vitest';

import bootstrapNotificationPlugin, {
  type NotificationPluginServices,
} from '../server/bootstrap.js';

describe('@nocobase/app-plugin-notification bootstrap', () => {
  it('creates the core manager and registers its disposer', async () => {
    const registerDisposer = vi.fn();
    const services: NotificationPluginServices = {};

    bootstrapNotificationPlugin({
      config: { notification: { channels: [] } },
      deps: {
        database: {} as DatabaseManager,
        logging: {
          getLogger: () => createLogger({ level: 'silent' }),
        },
        queueManager: {} as NocoBaseQueueManager,
      },
      services,
      lifecycle: { registerDisposer },
    });

    expect(services.notification).toBeDefined();
    expect(registerDisposer).toHaveBeenCalledWith(
      'manager',
      expect.any(Function),
    );
    const dispose = registerDisposer.mock.calls[0]?.[1] as
      (() => Promise<void>) | undefined;
    await dispose?.();
  });

  it('does nothing when the database dependency is unavailable', () => {
    const registerDisposer = vi.fn();
    const services: NotificationPluginServices = {};

    bootstrapNotificationPlugin({
      config: { notification: { channels: [] } },
      deps: {
        database: undefined,
        logging: {
          getLogger: () => createLogger({ level: 'silent' }),
        },
        queueManager: {} as NocoBaseQueueManager,
      },
      services,
      lifecycle: { registerDisposer },
    });

    expect(services.notification).toBeUndefined();
    expect(registerDisposer).not.toHaveBeenCalled();
  });
});

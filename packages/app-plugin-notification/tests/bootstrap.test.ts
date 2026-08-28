import type { DatabaseManager } from '@nocobase/app-database';
import { createLogger } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { describe, expect, it, vi } from 'vitest';

import bootstrapNotificationPlugin, {
  type NotificationPluginServices,
} from '../server/bootstrap.js';

describe('@nocobase/app-plugin-notification bootstrap', () => {
  it('creates and activates the core manager and registers its disposer', async () => {
    const registerDisposer = vi.fn();
    const registerJob = vi.fn();
    const services: NotificationPluginServices = {};

    bootstrapNotificationPlugin({
      config: {
        notification: {
          channels: [{ type: 'email', enabled: true, providers: [] }],
        },
      },
      deps: {
        database: {} as DatabaseManager,
        logging: {
          getLogger: () => createLogger({ level: 'silent' }),
        },
        queueManager: { registerJob } as unknown as NocoBaseQueueManager,
      },
      services,
      lifecycle: { registerDisposer },
    });

    expect(services.notification).toBeDefined();
    expect(registerJob).toHaveBeenCalledOnce();
    expect(() =>
      services.notification?.registry
        .registerChannel({
          type: 'email',
          async createChannel() {
            return {
              type: 'email',
              async prepare(input): Promise<object> {
                return input.message;
              },
            };
          },
        })
        .registerProvider('email', {
          type: 'smtp',
          async createProvider(_context, config) {
            return {
              name: config.name,
              type: config.type,
              async send() {
                return { status: 'accepted' } as const;
              },
            };
          },
        }),
    ).not.toThrow();
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

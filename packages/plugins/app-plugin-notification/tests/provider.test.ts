import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  authorizationToken,
  type Authorization,
} from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { createLogger, type Logging } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { NotificationProvider } from '../server/providers/notification.js';
import { notificationRuntimeToken } from '../server/runtime.js';
import {
  notificationExtensionRegistryToken,
  notificationServiceToken,
} from '../server/tokens.js';

describe('@nocobase/app-plugin-notification provider', () => {
  it('registers, activates, and closes the core manager', async () => {
    const container = createContainer(true);
    const provider = new NotificationProvider({
      config: {
        get: () => ({
          channels: { email: { provider: 'fake', enabled: true } },
        }),
      },
      container,
    });

    provider.register();
    expect(container.has(notificationServiceToken)).toBe(true);
    expect(container.has(notificationExtensionRegistryToken)).toBe(true);
    const registry = container.resolve(notificationExtensionRegistryToken);
    registry
      .registerChannel({
        type: 'email',
        async createChannel() {
          return {
            type: 'email',
            validateMessage: (message: object) => ({
              message,
              recipients: [{}],
            }),
            async prepare(input): Promise<object> {
              return input.message;
            },
          };
        },
      })
      .registerProvider({
        messageType: 'email',
        type: 'fake',
        async createProvider(_context, config) {
          return {
            type: config.provider,
            async send() {
              return { status: 'accepted' } as const;
            },
          };
        },
      });
    const notification = container.resolve(notificationRuntimeToken);
    expect(container.resolve(notificationServiceToken)).toBe(notification);
    const activate = vi.spyOn(notification, 'activate');
    const start = vi.spyOn(notification, 'start');
    const close = vi.spyOn(notification, 'close');
    const registerJob = vi.spyOn(
      container.resolve(queueManagerToken),
      'registerJob',
    );

    await provider.boot();
    await provider.start();
    await provider.shutdown();

    expect(activate).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(registerJob).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    const authorization = container.resolve(authorizationToken);
    expect(authorization.resourceTypes.add).toHaveBeenCalledOnce();
    const add = authorization.resourceTypes.add as unknown as ReturnType<
      typeof vi.fn
    >;
    const handler = add.mock.calls[0]?.[0] as {
      type: string;
      actions: readonly string[];
      authorize(
        request: object,
        context: object,
      ): Promise<{ readonly effect: string }>;
    };
    expect(handler).toMatchObject({ type: 'notification', actions: ['send'] });
    const context = {
      grants: {
        resolve: () =>
          Promise.resolve([
            {
              source: { plugin: 'permission-sets', id: 'operators' },
              resource: { type: 'notification', id: '*' },
              action: 'send',
            },
          ]),
      },
    };
    const request = (id: string) => ({
      principal: { type: 'user', id: 'user-1' },
      resource: { type: 'notification', id },
      action: 'send',
    });
    await expect(
      handler.authorize(request('test'), context),
    ).resolves.toMatchObject({ effect: 'permit' });
    await expect(
      handler.authorize(request('other'), context),
    ).resolves.toMatchObject({ effect: 'deny' });
  });

  it('fails fast when the required database dependency is missing', () => {
    const container = createContainer(false);
    const provider = new NotificationProvider({
      config: { get: () => ({ channels: {} }) },
      container,
    });

    expect(() => provider.register()).toThrow(
      'Notification core requires the database manager dependency.',
    );
  });
});

function createContainer(withDatabase: boolean): ServiceContainer {
  const container = new ServiceContainer();
  if (withDatabase) {
    container.instance(databaseManagerToken, {} as DatabaseManager);
  }
  container.instance(loggingToken, {
    getLogger: () => createLogger({ level: 'silent' }),
  } as Logging);
  container.instance(queueManagerToken, {
    registerJob: vi.fn(),
  } as unknown as NocoBaseQueueManager);
  container.instance(authorizationToken, {
    resourceTypes: { add: vi.fn() },
  } as unknown as Authorization);
  return container;
}

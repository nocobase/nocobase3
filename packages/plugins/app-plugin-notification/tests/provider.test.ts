import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { createLogger, type Logging } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { NotificationProvider } from '../server/providers/notification.js';
import { notificationServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-notification provider', () => {
  it('registers, activates, and closes the core manager', async () => {
    const container = createContainer(true);
    const provider = new NotificationProvider({
      config: {
        get: () => ({
          channels: [
            {
              type: 'email',
              enabled: true,
              providers: [{ type: 'fake', name: 'primary' }],
            },
          ],
        }),
      },
      container,
    });

    provider.register();
    expect(container.has(notificationServiceToken)).toBe(true);
    const notification = container.resolve(notificationServiceToken);
    notification.registry
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
        type: 'fake',
        async createProvider(_context, config) {
          return {
            name: config.name,
            type: config.type,
            async send() {
              return { status: 'accepted' } as const;
            },
          };
        },
      });
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
    expect(authorization.resources.add).toHaveBeenCalledOnce();
    expect(authorization.permissionResources.register).toHaveBeenCalledWith({
      plugin: 'notification',
      resourceType: {
        value: 'notification',
        label: 'Notifications',
        resources: [
          {
            value: 'test',
            label: 'Test notifications',
            actions: [{ value: 'send', label: 'Send' }],
          },
        ],
        actions: [{ value: 'send', label: 'Send' }],
      },
    });
    const add = authorization.resources.add as unknown as ReturnType<
      typeof vi.fn
    >;
    const handler = add.mock.calls[0]?.[0] as {
      authorize(
        request: object,
        context: object,
      ): Promise<{ readonly effect: string }>;
    };
    await expect(
      handler.authorize(
        {
          principal: { type: 'user', id: 'user-1' },
          resource: { type: 'notification', id: 'test' },
          action: 'send',
        },
        {
          grants: {
            resolve: () =>
              Promise.resolve([
                {
                  source: { plugin: 'permission-sets', id: 'operators' },
                  resource: { type: 'notification', id: 'test' },
                  action: 'send',
                },
              ]),
          },
        },
      ),
    ).resolves.toMatchObject({ effect: 'permit' });
    expect(authorization.resources.remove).toHaveBeenCalledWith('notification');
    expect(authorization.permissionResources.unregister).toHaveBeenCalledWith(
      'notification',
    );
  });

  it('fails fast when the required database dependency is missing', () => {
    const container = createContainer(false);
    const provider = new NotificationProvider({
      config: { get: () => ({ channels: [] }) },
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
    resources: { add: vi.fn(), remove: vi.fn() },
    permissionResources: { register: vi.fn(), unregister: vi.fn() },
  } as unknown as AppAuthorization);
  return container;
}

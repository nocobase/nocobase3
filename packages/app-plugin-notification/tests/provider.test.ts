import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import { createLogger, loggingToken, type Logging } from '@nocobase/logging';
import { queueManagerToken, type NocoBaseQueueManager } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import NotificationProvider from '../server/provider.js';
import { notificationServiceToken } from '../server/token.js';

describe('@nocobase/app-plugin-notification provider', () => {
  it('registers, activates, and closes the core manager', async () => {
    const container = createContainer(true);
    const provider = new NotificationProvider({
      config: {
        notification: {
          channels: [{ type: 'email', enabled: true, providers: [] }],
        },
      },
      container,
    });

    provider.register();
    expect(container.has(notificationServiceToken)).toBe(true);
    const notification = container.resolve(notificationServiceToken);
    const activate = vi.spyOn(notification, 'activate');
    const start = vi.spyOn(notification, 'start');
    const close = vi.spyOn(notification, 'close');
    const registerJob = vi.spyOn(
      container.resolve(queueManagerToken),
      'registerJob',
    );

    await provider.start();
    await provider.shutdown();

    expect(activate).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(registerJob).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not register the service without a database', async () => {
    const container = createContainer(false);
    const provider = new NotificationProvider({ config: {}, container });

    provider.register();
    await provider.start();
    await provider.shutdown();

    expect(container.has(notificationServiceToken)).toBe(false);
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
  return container;
}

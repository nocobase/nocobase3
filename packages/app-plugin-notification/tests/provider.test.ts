import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import { createLogger, type Logging } from '@nocobase/logging';
import { loggingToken } from '@nocobase/app-server-kit/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { queueManagerToken } from '@nocobase/app-server-kit/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { AppConfig } from '@nocobase/app-server-kit/config';
import { describe, expect, it, vi } from 'vitest';

import { notificationConfig } from '../server/config.js';
import NotificationProvider from '../server/provider.js';
import { notificationServiceToken } from '../server/token.js';

describe('@nocobase/app-plugin-notification provider', () => {
  it('registers, starts, and closes the core manager', async () => {
    const container = createContainer(true);
    const config = new AppConfig(
      [{ ...notificationConfig, defaults: { channels: [] } }],
      { context: {} },
    );
    await config.loadAll();
    const provider = new NotificationProvider({
      config,
      container,
    });

    provider.register();
    expect(container.has(notificationServiceToken)).toBe(true);
    const notification = container.resolve(notificationServiceToken);
    const start = vi.spyOn(notification, 'start');
    const close = vi.spyOn(notification, 'close');

    await provider.start();
    await provider.shutdown();

    expect(start).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not register the service without a database', async () => {
    const container = createContainer(false);
    const provider = new NotificationProvider({
      config: new AppConfig(),
      container,
    });

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
  container.instance(queueManagerToken, {} as NocoBaseQueueManager);
  return container;
}

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  notificationServiceToken,
  type NotificationService,
} from '@nocobase/app-plugin-notification';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { InAppNotificationProvider } from '../server/providers/in-app-notification.js';
import { inAppNotificationStoreToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-notification-in-app provider', () => {
  it('registers its Channel and Provider during boot', async () => {
    const registerProvider = vi.fn();
    const registerChannel = vi.fn(() => ({ registerProvider }));
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {} as DatabaseManager);
    container.instance(notificationServiceToken, {
      registry: { registerChannel },
    } as unknown as NotificationService);
    container.instance(authenticationToken, {} as Auth);
    const provider = new InAppNotificationProvider({
      container,
      router: new Hono(),
    });

    provider.register();
    await provider.boot();

    expect(container.has(inAppNotificationStoreToken)).toBe(true);
    expect(registerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'in-app' }),
    );
    expect(registerProvider).toHaveBeenCalledWith(
      'in-app',
      expect.objectContaining({ type: 'database' }),
    );
  });

  it('does nothing when the core notification service is unavailable', async () => {
    const provider = new InAppNotificationProvider({
      container: new ServiceContainer(),
      router: new Hono(),
    });
    provider.register();
    await expect(provider.boot()).resolves.toBeUndefined();
  });

  it('rejects a missing database when the core service exists', async () => {
    const container = new ServiceContainer();
    container.instance(notificationServiceToken, {} as NotificationService);
    const provider = new InAppNotificationProvider({
      container,
      router: new Hono(),
    });
    provider.register();
    await expect(provider.boot()).rejects.toThrow(
      'In-app notifications require the application database dependency.',
    );
  });
});

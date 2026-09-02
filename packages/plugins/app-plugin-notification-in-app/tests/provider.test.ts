import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  notificationExtensionRegistryToken,
  type NotificationExtensionRegistry,
} from '@nocobase/app-plugin-notification';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  realtimeServiceToken,
  type RealtimeService,
} from '@nocobase/app-server/realtime';

import { InAppNotificationProvider } from '../server/providers/in-app-notification.js';
import { inAppNotificationStoreToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-notification-in-app provider', () => {
  it('registers its Channel and Provider during boot', async () => {
    const registerProvider = vi.fn();
    const registerChannel = vi.fn(() => ({ registerProvider }));
    const close = vi.fn();
    const defineTopic = vi.fn(() => ({ publishFor: vi.fn(), close }));
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {} as DatabaseManager);
    container.instance(notificationExtensionRegistryToken, {
      registerChannel,
    } as unknown as NotificationExtensionRegistry);
    container.instance(authenticationToken, {} as Auth);
    container.instance(realtimeServiceToken, {
      defineTopic,
    } as unknown as RealtimeService);
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
    expect(defineTopic).toHaveBeenCalledWith('notifications:in-app', {
      audience: 'user',
    });

    await provider.shutdown();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the inbox store available when the core Server plugin is not registered', async () => {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {} as DatabaseManager);
    const provider = new InAppNotificationProvider({
      container,
      router: new Hono(),
    });
    provider.register();
    await expect(provider.boot()).resolves.toBeUndefined();
    expect(container.has(inAppNotificationStoreToken)).toBe(true);
  });

  it('fails fast when its required database dependency is missing', () => {
    const container = new ServiceContainer();
    const provider = new InAppNotificationProvider({
      container,
      router: new Hono(),
    });
    expect(() => provider.register()).toThrow(
      'In-app notifications require the application database dependency.',
    );
  });
});

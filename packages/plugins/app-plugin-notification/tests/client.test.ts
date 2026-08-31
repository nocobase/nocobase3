import { describe, expect, it, vi } from 'vitest';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';

import { NotificationClient } from '../client/notification-client.js';
import notificationPlugin from '../client/plugin.js';
import routes from '../client/routes.js';

describe('@nocobase/app-plugin-notification client', () => {
  it('contributes notification logs and locale resources through the settings centre', () => {
    const registration = notificationPlugin();

    expect(registration.serviceProviders).toHaveLength(1);
    expect(registration.routes).toEqual([routes]);
    expect(registration.locales).toMatchObject({
      'en-US': expect.any(Function),
      'zh-CN': expect.any(Function),
    });
    expect(routes).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'notifications',
          path: '/notifications',
          children: [{ name: 'logs', path: '/logs' }],
        },
      ],
    });
    const resolved = resolveAppClientContributions([
      { packageName: registration.packageName, routes },
    ]);
    expect(resolved.settingGroups).toMatchObject([
      { id: 'notifications', title: 'nav.notifications' },
    ]);
    expect(resolved.settings).toMatchObject([
      {
        path: '/settings/notifications/logs',
        access: { resource: 'notification.logs', action: 'access' },
      },
    ]);
  });

  it('loads redacted notification log details through the app client', async () => {
    const details = [{ log: { id: 'notification-1' }, deliveries: [] }];
    const request = vi.fn().mockResolvedValue({ data: details });

    await expect(
      new NotificationClient({ request }).listLogs(),
    ).resolves.toEqual(details);
    expect(request).toHaveBeenCalledWith('notifications/logs');
  });

  it('loads configured test Providers and sends through the test route', async () => {
    const provider = {
      channel: 'im',
      provider: { name: 'feishu', type: 'feishu-webhook' },
    };
    const result = {
      notificationId: 'notification-1',
      status: 'pending',
      provider: provider.provider,
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: [provider] })
      .mockResolvedValueOnce({ data: result });
    const client = new NotificationClient({ request });

    await expect(client.listTestProviders()).resolves.toEqual([provider]);
    await expect(
      client.sendTest({
        ...provider,
        recipient: 'user-2',
        title: 'Test',
        body: 'Hello',
      }),
    ).resolves.toEqual(result);
    expect(request).toHaveBeenNthCalledWith(
      1,
      'notification-providers/test/config',
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'notification-providers/test/send',
      {
        method: 'POST',
        headers: { 'x-nocobase-provider-test': '1' },
        body: JSON.stringify({
          channel: 'im',
          providerName: 'feishu',
          providerType: 'feishu-webhook',
          recipient: 'user-2',
          title: 'Test',
          body: 'Hello',
        }),
      },
    );
  });
});

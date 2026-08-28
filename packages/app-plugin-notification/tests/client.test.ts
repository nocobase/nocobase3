import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import { NotificationClient } from '../client/notification-client.js';
import routes from '../client/routes.js';

describe('@nocobase/app-plugin-notification client', () => {
  it('registers the notification settings resource and route', () => {
    const addResources = vi.fn();

    bootstrap({
      appClient: { request: vi.fn() },
      packageName: '@nocobase/app-plugin-notification',
      refine: { addResources } as never,
      source: 'plugin',
      options: {},
    });

    expect(addResources).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'notification' }),
      expect.objectContaining({
        name: 'notification.logs',
        list: '/settings/notifications/logs',
        meta: expect.objectContaining({ parent: 'notification' }),
      }),
    ]);
    expect(routes).toMatchObject([
      {
        name: 'notification-logs',
        path: '/settings/notifications/logs',
        auth: 'required',
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
});

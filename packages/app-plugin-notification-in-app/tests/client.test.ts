import type { AppClient } from '@nocobase/app-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createInAppNotificationClient } from '../client/api.js';
import providers from '../client/providers.js';

describe('in-app notification client', () => {
  it('contributes its runtime Provider from the plugin manifest entry', () => {
    expect(providers).toEqual([
      expect.objectContaining({
        name: 'notification-in-app',
        component: expect.any(Function),
      }),
    ]);
  });

  it('reads the unread count through the shared app client', async () => {
    const request = vi.fn<AppClient['request']>().mockResolvedValue({
      count: 3,
    });
    const client = createInAppNotificationClient({ request } as AppClient);

    await expect(client.countUnread()).resolves.toBe(3);
    expect(request).toHaveBeenCalledWith('notifications/in-app/unread-count', {
      signal: undefined,
    });
  });
});

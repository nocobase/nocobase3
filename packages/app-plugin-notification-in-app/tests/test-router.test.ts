import { describe, expect, it, vi } from 'vitest';

import { createInAppTestRouter } from '../server/test-router.js';

describe('in-app notification test router', () => {
  it('normalizes user IDs and sends a test notification', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const router = createInAppTestRouter({ send });

    const response = await router.request('/in-app', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userIds: [' user-1 ', 'user-1'],
        title: 'Test',
        body: 'Hello',
        actionUrl: '/notifications',
      }),
    });

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith({
      source: { type: 'notification-test' },
      to: [{ type: 'user', id: 'user-1' }],
      channels: ['in-app'],
      content: {
        title: 'Test',
        body: 'Hello',
        actionUrl: '/notifications',
      },
    });
  });

  it('rejects invalid in-app test input', async () => {
    const send = vi.fn();
    const router = createInAppTestRouter({ send });

    const response = await router.request('/in-app', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: [], body: '' }),
    });

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});

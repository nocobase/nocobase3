import { describe, expect, it } from 'vitest';

import { createInAppRouter } from '../server/router.js';
import { MemoryInAppStore } from '../server/store.js';

describe('createInAppRouter', () => {
  it("uses the authenticated user and isolates another user's items", async () => {
    const store = new MemoryInAppStore();
    await store.deliver({
      deliveryId: 'delivery-user-1',
      notificationId: 'notification-user-1',
      userId: 'user-1',
      message: { body: 'Visible' },
      createdAt: '2026-08-26T00:00:00.000Z',
    });
    await store.deliver({
      deliveryId: 'delivery-user-2',
      notificationId: 'notification-user-2',
      userId: 'user-2',
      message: { body: 'Hidden' },
      createdAt: '2026-08-26T00:00:01.000Z',
    });
    const router = createInAppRouter(store, {
      resolveUserId: async () => 'user-1',
    });

    const response = await router.request('/');

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data: readonly { userId: string; body: string }[];
    };
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      userId: 'user-1',
      body: 'Visible',
    });
  });
});

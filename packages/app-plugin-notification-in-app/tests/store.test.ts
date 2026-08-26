import { describe, expect, it } from 'vitest';

import { MemoryInAppStore } from '../server/store.js';

describe('MemoryInAppStore', () => {
  it('updates an item without version-based concurrency control', async () => {
    const store = new MemoryInAppStore();
    const delivered = await store.deliver({
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      userId: 'user-1',
      message: { body: 'Review the request.' },
      createdAt: '2026-08-25T00:00:00.000Z',
    });

    const read = await store.update({
      id: delivered.id,
      userId: 'user-1',
      action: 'read',
    });
    const unread = await store.update({
      id: delivered.id,
      userId: 'user-1',
      action: 'unread',
    });

    expect(delivered).not.toHaveProperty('version');
    expect(read?.readAt).toBeDefined();
    expect(unread?.readAt).toBeUndefined();
  });
});

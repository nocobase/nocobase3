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

  it('paginates deterministically when items share a timestamp', async () => {
    const store = new MemoryInAppStore();
    for (let index = 0; index < 5; index++) {
      await store.deliver({
        deliveryId: `delivery-${index}`,
        notificationId: `notification-${index}`,
        userId: 'user-1',
        message: { body: `Message ${index}` },
        createdAt: '2026-08-25T00:00:00.000Z',
      });
    }

    const first = await store.list({ userId: 'user-1', limit: 2 });
    const second = await store.list({
      userId: 'user-1',
      limit: 2,
      before: {
        createdAt: first[1].createdAt,
        id: first[1].id,
      },
    });

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(new Set([...first, ...second].map((item) => item.id)).size).toBe(4);
  });
});

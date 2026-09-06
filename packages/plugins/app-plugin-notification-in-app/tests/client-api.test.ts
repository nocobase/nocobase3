import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@nocobase/app-client';

import {
  fetchInbox,
  fetchUnreadCount,
  markInboxRead,
  mutateInboxItem,
} from '../client/api.js';

describe('in-app notification Client API', () => {
  it('uses relative paths on the injected application client', async () => {
    const responses: unknown[] = [
      { data: [], nextCursor: 'next' },
      { count: 3 },
    ];
    const request = vi.fn(async <T>(): Promise<T> => responses.shift() as T);
    const client = createClient(request);

    await expect(
      fetchInbox(client, { unreadOnly: true, limit: 10, cursor: 'cursor' }),
    ).resolves.toEqual({ data: [], nextCursor: 'next' });
    await expect(fetchUnreadCount(client)).resolves.toBe(3);

    expect(request).toHaveBeenNthCalledWith(1, {
      path: 'notifications/in-app?limit=10&unreadOnly=true&cursor=cursor',
      signal: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'notifications/in-app/unread-count',
      signal: undefined,
    });
  });

  it('uses the injected client and CSRF token for mutations', async () => {
    const item = {
      id: 'item/1',
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      title: 'Title',
      body: 'Body',
      createdAt: '2026-09-02T00:00:00.000Z',
    };
    const responses: unknown[] = [
      { token: 'csrf-1' },
      { data: item },
      { token: 'csrf-2' },
      { updated: 4 },
    ];
    const request = vi.fn(async <T>(): Promise<T> => responses.shift() as T);
    const client = createClient(request);

    await expect(mutateInboxItem(client, 'item/1', 'read')).resolves.toEqual(
      item,
    );
    await expect(markInboxRead(client)).resolves.toBe(4);

    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'notifications/in-app/item%2F1',
      method: 'POST',
      headers: { 'x-csrf-token': 'csrf-1' },
      json: { action: 'read' },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      path: 'notifications/in-app/read-all',
      method: 'POST',
      headers: { 'x-csrf-token': 'csrf-2' },
      json: {},
    });
  });
});

function createClient(request: ApiClient['request']): ApiClient {
  return {
    request,
    repository: vi.fn(),
    stream: async (): Promise<ReadableStream<Uint8Array>> =>
      new ReadableStream<Uint8Array>(),
  };
}

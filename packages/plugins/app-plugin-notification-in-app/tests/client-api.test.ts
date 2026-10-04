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
      { data: [], meta: { nextPageToken: 'next' } },
      { data: { count: 3 } },
    ];
    const request = vi.fn(async <T>(): Promise<T> => responses.shift() as T);
    const client = createClient(request);

    await expect(
      fetchInbox(client, {
        unreadOnly: true,
        pageSize: 10,
        pageToken: 'token',
      }),
    ).resolves.toEqual({ data: [], nextPageToken: 'next' });
    await expect(fetchUnreadCount(client)).resolves.toBe(3);

    expect(request).toHaveBeenNthCalledWith(1, {
      path: 'notificationInApp/messages?pageSize=10&unreadOnly=true&pageToken=token',
      signal: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'notificationInApp/messages/unreadCount',
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
      { data: { token: 'csrf-1' } },
      { data: item },
      { data: { token: 'csrf-2' } },
      { data: { updated: 4 } },
      { data: { token: 'csrf-3' } },
      undefined,
    ];
    const request = vi.fn(async <T>(): Promise<T> => responses.shift() as T);
    const client = createClient(request);

    await expect(mutateInboxItem(client, 'item/1', 'read')).resolves.toEqual(
      item,
    );
    await expect(markInboxRead(client)).resolves.toBe(4);
    await expect(
      mutateInboxItem(client, 'item/1', 'delete'),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenNthCalledWith(1, {
      path: 'notificationInApp/csrfToken',
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      path: 'notificationInApp/messages/item%2F1/markRead',
      method: 'POST',
      headers: { 'x-csrf-token': 'csrf-1' },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      path: 'notificationInApp/messages/markAllRead',
      method: 'POST',
      headers: { 'x-csrf-token': 'csrf-2' },
    });
    expect(request).toHaveBeenNthCalledWith(6, {
      path: 'notificationInApp/messages/item%2F1',
      method: 'DELETE',
      headers: { 'x-csrf-token': 'csrf-3' },
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

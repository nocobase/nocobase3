import type { AppClient } from '@nocobase/app-sdk';

export type InboxMutationAction = 'read' | 'unread' | 'delete';

export interface InboxItem {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly readAt?: string;
  readonly createdAt: string;
}

export interface InboxFilters {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface InboxListResponse {
  readonly data: readonly InboxItem[];
  readonly nextCursor?: string;
}

export interface InAppNotificationClient {
  list(filters: InboxFilters, signal?: AbortSignal): Promise<InboxListResponse>;
  countUnread(signal?: AbortSignal): Promise<number>;
  update(id: string, action: InboxMutationAction): Promise<InboxItem>;
  markAllRead(): Promise<number>;
}

export function createInAppNotificationClient(
  client: AppClient,
): InAppNotificationClient {
  return {
    async list(filters, signal) {
      const query = new URLSearchParams({
        limit: String(filters.limit ?? 25),
      });
      if (filters.unreadOnly) query.set('unreadOnly', 'true');
      if (filters.cursor) query.set('cursor', filters.cursor);
      const value = await client.request<unknown>(
        `notifications/in-app?${query}`,
        { signal },
      );
      if (Array.isArray(value)) {
        return { data: value as readonly InboxItem[] };
      }
      if (isRecord(value) && Array.isArray(value.data)) {
        return {
          data: value.data as readonly InboxItem[],
          nextCursor:
            typeof value.nextCursor === 'string' ? value.nextCursor : undefined,
        };
      }
      throw new Error('Inbox returned an invalid response.');
    },
    async countUnread(signal) {
      const response = await client.request<{ readonly count: number }>(
        'notifications/in-app/unread-count',
        { signal },
      );
      return response.count;
    },
    async update(id, action) {
      const response = await mutate<{ readonly data: InboxItem }>(
        client,
        `notifications/in-app/${encodeURIComponent(id)}`,
        { action },
      );
      return response.data;
    },
    async markAllRead() {
      const response = await mutate<{ readonly updated: number }>(
        client,
        'notifications/in-app/read-all',
        {},
      );
      return response.updated;
    },
  };
}

async function mutate<Result>(
  client: AppClient,
  path: string,
  body: object,
): Promise<Result> {
  const csrf = await client.request<{ readonly token: string }>(
    'notifications/in-app/csrf',
  );
  return client.request<Result>(path, {
    method: 'POST',
    headers: { 'x-csrf-token': csrf.token },
    body: JSON.stringify(body),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

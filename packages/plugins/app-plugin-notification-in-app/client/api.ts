import type { AppClient } from '@nocobase/app-client';

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

export async function fetchInbox(
  client: AppClient,
  filters: InboxFilters,
  signal?: AbortSignal,
): Promise<InboxListResponse> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 25) });
  if (filters.unreadOnly) query.set('unreadOnly', 'true');
  if (filters.cursor) query.set('cursor', filters.cursor);
  const value = await client.request<unknown>(`notifications/in-app?${query}`, {
    signal,
  });
  if (Array.isArray(value)) return { data: value as readonly InboxItem[] };
  if (isRecord(value) && Array.isArray(value.data)) {
    return {
      data: value.data as readonly InboxItem[],
      nextCursor:
        typeof value.nextCursor === 'string' ? value.nextCursor : undefined,
    };
  }
  throw new Error('Inbox returned an invalid response.');
}

export async function fetchUnreadCount(
  client: AppClient,
  signal?: AbortSignal,
): Promise<number> {
  const response = await client.request<{ readonly count: number }>(
    'notifications/in-app/unread-count',
    { signal },
  );
  return response.count;
}

export async function mutateInboxItem(
  client: AppClient,
  id: string,
  action: InboxMutationAction,
): Promise<InboxItem> {
  const response = await mutation<{ readonly data: InboxItem }>(
    client,
    `notifications/in-app/${encodeURIComponent(id)}`,
    { action },
  );
  return response.data;
}

export async function markInboxRead(client: AppClient): Promise<number> {
  const response = await mutation<{ readonly updated: number }>(
    client,
    'notifications/in-app/read-all',
    {},
  );
  return response.updated;
}

async function mutation<T>(
  client: AppClient,
  path: string,
  body: object,
): Promise<T> {
  const csrf = await client.request<{ readonly token: string }>(
    'notifications/in-app/csrf',
  );
  return client.request<T>(path, {
    method: 'POST',
    headers: { 'x-csrf-token': csrf.token },
    body: JSON.stringify(body),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

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
  filters: InboxFilters,
  signal?: AbortSignal,
): Promise<InboxListResponse> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 25) });
  if (filters.unreadOnly) query.set('unreadOnly', 'true');
  if (filters.cursor) query.set('cursor', filters.cursor);
  const value = await requestJson<unknown>(`${getInboxBaseUrl()}?${query}`, {
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

export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const response = await requestJson<{ readonly count: number }>(
    `${getInboxBaseUrl()}/unread-count`,
    {
      signal,
    },
  );
  return response.count;
}

export async function mutateInboxItem(
  id: string,
  action: InboxMutationAction,
): Promise<InboxItem> {
  const response = await mutation<{ readonly data: InboxItem }>(
    `${getInboxBaseUrl()}/${encodeURIComponent(id)}`,
    { action },
  );
  return response.data;
}

export async function markInboxRead(): Promise<number> {
  const response = await mutation<{ readonly updated: number }>(
    `${getInboxBaseUrl()}/read-all`,
    {},
  );
  return response.updated;
}

async function mutation<T>(url: string, body: object): Promise<T> {
  const csrf = await requestJson<{ readonly token: string }>(
    `${getInboxBaseUrl()}/csrf`,
  );
  return requestJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.token },
    body: JSON.stringify(body),
  });
}

function getInboxBaseUrl(): string {
  return `${getPortalBase().replace(/\/$/, '')}/api/notifications/in-app`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = apiMethod(init?.method);
  const headers = new Headers(
    nocobaseClient.getHeaders({ method, withAclMeta: false, body: init?.body }),
  );
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers,
  });
  const value: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error =
      value &&
      typeof value === 'object' &&
      'error' in value &&
      value.error &&
      typeof value.error === 'object'
        ? (value.error as { readonly message?: unknown })
        : undefined;
    throw new Error(
      typeof error?.message === 'string'
        ? error.message
        : `Inbox request failed (${response.status}).`,
    );
  }
  if (value === undefined) {
    throw new Error('Inbox returned an invalid response.');
  }
  return value as T;
}

function apiMethod(
  method: string | undefined,
): 'GET' | 'POST' | 'PUT' | 'DELETE' {
  switch (method?.toUpperCase()) {
    case 'POST':
      return 'POST';
    case 'PUT':
      return 'PUT';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'GET';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

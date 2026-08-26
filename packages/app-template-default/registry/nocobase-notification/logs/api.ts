import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

export type NotificationStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'preparing'
  | 'submitting'
  | 'accepted'
  | 'failed'
  | 'unknown';

export interface NotificationAttempt {
  readonly id: string;
  readonly sequence: number;
  readonly providerName: string;
  readonly providerType: string;
  readonly status: NotificationStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly providerMessageId?: string;
  readonly error?: { readonly message: string; readonly code?: string };
}

export interface NotificationDeliveryDetails {
  readonly delivery: {
    readonly id: string;
    readonly channel: string;
    readonly providerName: string;
    readonly providerType: string;
    readonly attemptCount: number;
    readonly status: NotificationStatus;
    readonly nextRunAt?: string;
    readonly lastError?: { readonly message: string; readonly code?: string };
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly attempts: readonly NotificationAttempt[];
}

export interface NotificationLogDetails {
  readonly log: {
    readonly id: string;
    readonly sourceType: string;
    readonly sourceReferenceId?: string;
    readonly status: NotificationStatus;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly deliveries: readonly NotificationDeliveryDetails[];
}

export async function fetchNotificationLogs(
  signal?: AbortSignal,
): Promise<readonly NotificationLogDetails[]> {
  const response = await request<{ readonly data: NotificationLogDetails[] }>(
    `${notificationBase()}/logs`,
    { signal },
  );
  return response.data;
}

function notificationBase(): string {
  return `${getPortalBase().replace(/\/$/, '')}/api/notifications`;
}

async function request<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(
    nocobaseClient.getHeaders({
      method: init.method ?? 'GET',
      withAclMeta: false,
      body: init.body,
    }),
  );
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers,
  });
  const value: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      isRecord(value) && typeof value.error === 'string'
        ? value.error
        : `Notification request failed (${response.status}).`;
    throw new Error(message);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

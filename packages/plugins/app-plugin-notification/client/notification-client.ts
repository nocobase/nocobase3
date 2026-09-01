import type { AppClient } from '@nocobase/app-client';

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

export interface NotificationTestField {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'email' | 'textarea';
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly maxLength?: number;
}

export interface NotificationTestTarget {
  readonly channel: { readonly type: string; readonly label: string };
  readonly provider: {
    readonly name: string;
    readonly type: string;
    readonly label: string;
  };
  readonly fields: readonly NotificationTestField[];
}

export interface NotificationTestInput {
  readonly channel: string;
  readonly providerName: string;
  readonly providerType: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface NotificationTestResult {
  readonly notificationId: string;
  readonly status: NotificationStatus;
  readonly deliveries: readonly unknown[];
}

interface DataResponse<T> {
  readonly data: T;
}

export class NotificationClient {
  constructor(private readonly client: AppClient) {}

  listLogs(): Promise<readonly NotificationLogDetails[]> {
    return this.client
      .request<DataResponse<readonly NotificationLogDetails[]>>(
        'notifications/logs',
      )
      .then((response) => response.data);
  }

  listTestTargets(): Promise<readonly NotificationTestTarget[]> {
    return this.client
      .request<DataResponse<readonly NotificationTestTarget[]>>(
        'notifications/test/targets',
        { headers: { 'x-nocobase-notification-test': '1' } },
      )
      .then((response) => response.data)
      .catch(rethrowNotificationTestError);
  }

  sendTest(input: NotificationTestInput): Promise<NotificationTestResult> {
    return this.client
      .request<DataResponse<NotificationTestResult>>(
        'notifications/test/send',
        {
          method: 'POST',
          headers: { 'x-nocobase-notification-test': '1' },
          body: JSON.stringify(input),
        },
      )
      .then((response) => response.data)
      .catch(rethrowNotificationTestError);
  }

  getTestStatus(id: string): Promise<NotificationLogDetails> {
    return this.client
      .request<DataResponse<NotificationLogDetails>>(
        `notifications/test/${encodeURIComponent(id)}/status`,
        { headers: { 'x-nocobase-notification-test': '1' } },
      )
      .then((response) => response.data)
      .catch(rethrowNotificationTestError);
  }
}

function rethrowNotificationTestError(cause: unknown): never {
  if (cause instanceof Error && 'status' in cause && cause.status === 404) {
    throw new Error('Notification testing is not available.', {
      cause,
    });
  }
  if (
    cause instanceof Error &&
    'payload' in cause &&
    isRecord(cause.payload) &&
    typeof cause.payload.error === 'string'
  ) {
    throw new Error(cause.payload.error, { cause });
  }
  throw cause;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

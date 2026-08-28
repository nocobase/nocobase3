import type { AppClient } from '@nocobase/app-sdk';

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
}

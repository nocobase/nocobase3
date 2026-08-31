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

export interface NotificationTestProvider {
  readonly channel: string;
  readonly provider: {
    readonly name: string;
    readonly type: string;
  };
}

export interface NotificationTestInput extends NotificationTestProvider {
  readonly recipient?: string;
  readonly title?: string;
  readonly body?: string;
}

export interface NotificationTestResult {
  readonly notificationId: string;
  readonly status: NotificationStatus;
  readonly provider: {
    readonly name: string;
    readonly type: string;
  };
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

  listTestProviders(): Promise<readonly NotificationTestProvider[]> {
    return this.client
      .request<DataResponse<readonly NotificationTestProvider[]>>(
        'notification-providers/test/config',
      )
      .then((response) => response.data)
      .catch(rethrowProviderTestError);
  }

  sendTest(input: NotificationTestInput): Promise<NotificationTestResult> {
    return this.client
      .request<DataResponse<NotificationTestResult>>(
        'notification-providers/test/send',
        {
          method: 'POST',
          headers: { 'x-nocobase-provider-test': '1' },
          body: JSON.stringify({
            channel: input.channel,
            providerName: input.provider.name,
            providerType: input.provider.type,
            recipient: input.recipient,
            title: input.title,
            body: input.body,
          }),
        },
      )
      .then((response) => response.data)
      .catch(rethrowProviderTestError);
  }
}

function rethrowProviderTestError(cause: unknown): never {
  if (cause instanceof Error && 'status' in cause && cause.status === 404) {
    throw new Error('Provider testing is not enabled for this application.', {
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

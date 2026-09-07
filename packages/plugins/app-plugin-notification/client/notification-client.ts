import type { ApiClient } from '@nocobase/app-client';
import type {
  NotificationSendResult,
  NotificationTestFieldDescriptor,
  NotificationTestSendRequest,
  NotificationTestTargetDescriptor,
} from '../server/types.js';

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

export type NotificationTestField = NotificationTestFieldDescriptor<string>;

export type NotificationTestTarget = NotificationTestTargetDescriptor<string>;

export type NotificationTestInput = NotificationTestSendRequest;

export type NotificationTestResult = NotificationSendResult;

interface DataResponse<T> {
  readonly data: T;
}

interface ErrorResponse {
  readonly error?: string | NotificationTestErrorPayload;
  readonly message?: string;
}

interface NotificationTestErrorPayload {
  readonly code?: string;
  readonly message?: string;
  readonly ns?: string;
  readonly key?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export class NotificationTestApiError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly ns?: string;
  public readonly key?: string;
  public readonly params?: Readonly<Record<string, unknown>>;

  public constructor(
    input: {
      readonly code: string;
      readonly message: string;
      readonly status?: number;
      readonly ns?: string;
      readonly key?: string;
      readonly params?: Readonly<Record<string, unknown>>;
    },
    cause: unknown,
  ) {
    super(input.message, { cause });
    this.name = 'NotificationTestApiError';
    this.code = input.code;
    this.status = input.status;
    this.ns = input.ns;
    this.key = input.key;
    this.params = input.params;
  }
}

export class NotificationClient {
  constructor(private readonly api: ApiClient) {}

  listLogs(): Promise<readonly NotificationLogDetails[]> {
    return this.api
      .request<DataResponse<readonly NotificationLogDetails[]>>({
        path: 'notifications/logs',
      })
      .then((response) => response.data);
  }

  listTestTargets(): Promise<readonly NotificationTestTarget[]> {
    return this.api
      .request<DataResponse<readonly NotificationTestTarget[]>>({
        path: 'notifications/test/targets',
        headers: { 'x-nocobase-notification-test': '1' },
      })
      .then((response) => response.data)
      .catch(rethrowNotificationTestError);
  }

  sendTest(input: NotificationTestInput): Promise<NotificationTestResult> {
    return this.api
      .request<DataResponse<NotificationTestResult>>({
        path: 'notifications/test/send',
        method: 'POST',
        headers: { 'x-nocobase-notification-test': '1' },
        json: input,
      })
      .then((response) => response.data)
      .catch(rethrowNotificationTestError);
  }

  getTestStatus(id: string): Promise<NotificationLogDetails> {
    return this.api
      .request<DataResponse<NotificationLogDetails>>({
        path: `notifications/test/${encodeURIComponent(id)}/status`,
        headers: { 'x-nocobase-notification-test': '1' },
      })
      .then((response) => response.data)
      .catch(rethrowNotificationTestError);
  }
}

function rethrowNotificationTestError(cause: unknown): never {
  if (cause instanceof Error && 'payload' in cause && isRecord(cause.payload)) {
    const payload = cause.payload as ErrorResponse;
    if (isRecord(payload.error)) {
      const error = payload.error as NotificationTestErrorPayload;
      if (error.code && error.message) {
        throw new NotificationTestApiError(
          {
            code: error.code,
            message: error.message,
            status: errorStatus(cause),
            ns: error.ns,
            key: error.key,
            params: error.params,
          },
          cause,
        );
      }
    }
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? payload.message);
    if (message) throw new Error(message, { cause });
  }
  if (errorStatus(cause) === 404) {
    throw new NotificationTestApiError(
      {
        code: 'NOTIFICATION_TEST_UNAVAILABLE',
        message: 'Notification testing is not available.',
        status: 404,
      },
      cause,
    );
  }
  throw cause;
}

function errorStatus(cause: unknown): number | undefined {
  if (!isRecord(cause)) return undefined;
  return typeof cause.status === 'number' ? cause.status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

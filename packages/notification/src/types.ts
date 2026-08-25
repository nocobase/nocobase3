import type { DatabaseManager } from '@nocobase/database';
import type { Logger } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import type { Hono } from 'hono';

import type { NotificationStore } from './store.js';

export interface NotificationChannelSchema {
  readonly recipient: object;
  readonly message: object;
}

export type NotificationChannelMap = Record<string, NotificationChannelSchema>;

export type NotificationRecipientChannel<
  TChannels extends NotificationChannelMap,
> = {
  readonly [TType in keyof TChannels & string]: {
    readonly channel: TType;
    readonly recipient: TChannels[TType]['recipient'];
  };
}[keyof TChannels & string];

export type NotificationMessageInput<TChannels extends NotificationChannelMap> =
  Partial<{
    readonly [TType in keyof TChannels & string]: TChannels[TType]['message'];
  }>;

export interface NotificationSendInput<
  TChannels extends NotificationChannelMap,
> {
  readonly idempotencyKey?: string;
  readonly source?: {
    readonly type: string;
    readonly referenceId?: string;
  };
  readonly recipients: readonly {
    readonly userId?: string;
    readonly channels: readonly NotificationRecipientChannel<TChannels>[];
  }[];
  readonly message: NotificationMessageInput<TChannels>;
}

export interface NotificationSendResult {
  readonly notificationId: string;
  readonly status:
    'pending' | 'processing' | 'completed' | 'partial' | 'failed' | 'unknown';
  readonly deliveries: readonly {
    readonly id: string;
    readonly channel: string;
    readonly status:
      | 'pending'
      | 'preparing'
      | 'submitting'
      | 'accepted'
      | 'failed'
      | 'unknown';
  }[];
}

export interface NotificationProviderConfig {
  readonly type: string;
  readonly name: string;
  readonly enabled?: boolean;
}

export interface NotificationChannelConfig {
  readonly type: string;
  readonly enabled: boolean;
  readonly providers: readonly NotificationProviderConfig[];
}

export interface NotificationConfig {
  readonly channels: readonly NotificationChannelConfig[];
}

export interface NotificationProviderSendError {
  readonly code?: string;
  readonly message: string;
  readonly category?: string;
}

export type NotificationRetryDisposition =
  'never' | 'same_provider' | 'next_provider';

export type ProviderSendResult =
  | {
      readonly status: 'accepted';
      readonly providerMessageId?: string;
    }
  | {
      readonly status: 'failed';
      readonly error: NotificationProviderSendError;
      readonly disposition: NotificationRetryDisposition;
      readonly retryAfterMs?: number;
    }
  | {
      readonly status: 'submission_unknown';
      readonly error: NotificationProviderSendError;
    };

export interface NotificationProviderSendInput<TMessage = object> {
  readonly message: TMessage;
  readonly notificationId: string;
  readonly deliveryId: string;
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly deadline: string;
  readonly signal: AbortSignal;
}

export interface NotificationProvider<TMessage = object> {
  readonly name: string;
  readonly type: string;
  send(
    input: NotificationProviderSendInput<TMessage>,
  ): Promise<ProviderSendResult>;
  close?(): Promise<void>;
}

export interface NotificationChannel<
  TRecipient = object,
  TMessage = object,
  TPrepared = object,
> {
  readonly type: string;
  prepare(input: {
    readonly deliveryId: string;
    readonly notificationId: string;
    readonly recipient: TRecipient;
    readonly message: TMessage;
    readonly signal: AbortSignal;
  }): Promise<TPrepared>;
  mount?(router: Hono): void;
}

export interface NotificationProviderContext {
  readonly database?: DatabaseManager;
  readonly logger: Logger;
  readonly queue: NocoBaseQueueManager;
  readonly store: NotificationStore;
}

export type NotificationChannelContext = NotificationProviderContext;

export interface NotificationProviderDefinition<
  TConfig extends {
    readonly type: string;
    readonly name: string;
    readonly enabled?: boolean;
  } = NotificationProviderConfig,
  TPrepared = object,
> {
  readonly type: TConfig['type'];
  createProvider(
    context: NotificationProviderContext,
    config: TConfig,
  ): Promise<NotificationProvider<TPrepared>>;
}

export interface NotificationChannelDefinition<
  TConfig extends {
    readonly type: string;
    readonly enabled: boolean;
    readonly providers: readonly {
      readonly type: string;
      readonly name: string;
      readonly enabled?: boolean;
    }[];
  } = NotificationChannelConfig,
  TRecipient = object,
  TMessage = object,
  TPrepared = object,
> {
  readonly type: TConfig['type'];
  createChannel(
    context: NotificationChannelContext,
    config: TConfig,
  ): Promise<NotificationChannel<TRecipient, TMessage, TPrepared>>;
}

export interface NotificationManagerOptions<
  TChannels extends {
    readonly [TType in keyof TChannels]: NotificationChannelSchema;
  },
> {
  readonly database: DatabaseManager;
  readonly queue: NocoBaseQueueManager;
  readonly logger: Logger;
  readonly config: NotificationConfig;
  readonly store?: NotificationStore;
  readonly reconcileIntervalMs?: number;
  readonly reconcileBatchSize?: number;
  readonly providerTimeoutMs?: number;
  readonly leaseMs?: number;
  readonly retry?: {
    readonly maxAttemptsPerProvider?: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly jitterRatio?: number;
  };
}

import type { Logger } from '@nocobase/logging';
import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import type { NotificationStore } from './store.js';
import type { NotificationRegistry } from './registry.js';

export interface NotificationChannelSchema {
  readonly recipient: object;
  readonly message: object;
}

export type NotificationChannelMap = Record<string, NotificationChannelSchema>;

export type NotificationService =
  import('./manager.js').NotificationManager<NotificationChannelMap>;

export interface NotificationContent {
  readonly title?: string;
  readonly body: string;
  readonly actionUrl?: string;
}

export interface NotificationProviderIdentity {
  readonly name: string;
  readonly type: string;
}

export type NotificationRecipient =
  | { readonly type: 'user'; readonly id: string }
  | { readonly type: 'email'; readonly address: string }
  | { readonly type: 'phone'; readonly number: string }
  | {
      readonly type: 'provider';
      readonly provider: NotificationProviderIdentity;
    };

export interface NotificationSendInput<
  TChannels extends NotificationChannelMap,
> {
  readonly source?: {
    readonly type: string;
    readonly referenceId?: string;
  };
  readonly to: NotificationRecipient | readonly NotificationRecipient[];
  readonly channels: readonly (keyof TChannels & string)[];
  readonly content: NotificationContent;
  readonly channelOverrides?: Partial<{
    readonly [TType in keyof TChannels & string]: Partial<
      TChannels[TType]['message']
    >;
  }>;
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
  readonly category?: NotificationProviderErrorCategory;
}

export const NOTIFICATION_PROVIDER_ERROR_CATEGORIES: readonly [
  'authentication',
  'channel',
  'configuration',
  'content',
  'network',
  'provider',
  'rate_limit',
  'recipient',
  'storage',
  'timeout',
  'unknown',
] = [
  'authentication',
  'channel',
  'configuration',
  'content',
  'network',
  'provider',
  'rate_limit',
  'recipient',
  'storage',
  'timeout',
  'unknown',
];

export type NotificationProviderErrorCategory =
  (typeof NOTIFICATION_PROVIDER_ERROR_CATEGORIES)[number];

export function isNotificationProviderErrorCategory(
  value: unknown,
): value is NotificationProviderErrorCategory {
  return NOTIFICATION_PROVIDER_ERROR_CATEGORIES.some(
    (category) => category === value,
  );
}

export type NotificationRetryDisposition = 'never' | 'same_provider';

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
  resolveRecipient?(input: {
    readonly recipient: NotificationRecipient;
    readonly provider: NotificationProviderIdentity;
  }): TRecipient | undefined | Promise<TRecipient | undefined>;
  render?(input: {
    readonly content: NotificationContent;
    readonly override?: Partial<TMessage>;
  }): TMessage;
  prepare(input: {
    readonly deliveryId: string;
    readonly notificationId: string;
    readonly recipient: TRecipient;
    readonly message: TMessage;
    readonly provider: NotificationProviderIdentity;
    readonly signal: AbortSignal;
  }): Promise<TPrepared>;
}

export interface NotificationProviderContext {
  readonly logger: Logger;
  now(): Promise<string>;
}

export interface NotificationChannelContext {
  readonly logger: Logger;
}

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
  readonly registry?: NotificationRegistry;
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

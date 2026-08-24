import { randomUUID } from 'node:crypto';

import type { Logger } from '@nocobase/logging';

import type {
  NotificationAttemptRecord,
  NotificationDeliveryRecord,
  NotificationStore,
} from './store.js';
import type {
  NotificationChannel,
  NotificationProvider,
  NotificationProviderSendError,
  ProviderSendResult,
} from './types.js';

export interface ChannelRuntime {
  readonly channel: NotificationChannel;
  readonly providers: readonly NotificationProvider[];
}

export interface ChannelManagerOptions {
  readonly logger: Logger;
  readonly store: NotificationStore;
  readonly leaseMs?: number;
}

export class ChannelManager {
  private readonly runtimes = new Map<string, ChannelRuntime>();

  constructor(private readonly options: ChannelManagerOptions) {}

  register(type: string, runtime: ChannelRuntime): void {
    if (this.runtimes.has(type))
      throw new Error(`Notification Channel "${type}" is already registered.`);
    this.runtimes.set(type, runtime);
  }

  has(type: string): boolean {
    return this.runtimes.has(type);
  }

  providerNames(type: string): readonly string[] {
    return (
      this.runtimes.get(type)?.providers.map((provider) => provider.name) ?? []
    );
  }

  async send(
    deliveryId: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const stored = await this.options.store.getDelivery(deliveryId);
    if (!stored || stored.status !== 'pending') return stored;
    const runtime = this.runtimes.get(stored.channel);
    if (!runtime || runtime.providers.length === 0) {
      this.options.logger.error(
        { deliveryId, channel: stored.channel },
        'Notification Channel has no available Provider.',
      );
      return undefined;
    }
    const now = await this.options.store.now();
    const claimed = await this.options.store.claimDelivery(
      stored.id,
      randomUUID(),
      new Date(
        Date.parse(now) + (this.options.leaseMs ?? 30_000),
      ).toISOString(),
    );
    if (!claimed) return undefined;

    let prepared: object;
    try {
      prepared = await runtime.channel.prepare({
        deliveryId: claimed.id,
        notificationId: claimed.notificationId,
        recipient: claimed.recipientSnapshot,
        message: claimed.messageSnapshot,
      });
    } catch (error) {
      this.options.logger.error(
        {
          event: 'notification.delivery.prepare_failed',
          err: error,
          notificationId: claimed.notificationId,
          deliveryId: claimed.id,
          channel: claimed.channel,
        },
        'Failed to prepare notification Delivery.',
      );
      return this.options.store.finishDelivery(
        claimed,
        'failed',
        normalizeError(error, 'channel'),
      );
    }

    let current = claimed;
    for (
      let cursor = claimed.providerCursor;
      cursor < claimed.providerChain.length;
      cursor += 1
    ) {
      const providerName = claimed.providerChain[cursor];
      const provider = runtime.providers.find(
        (candidate) => candidate.name === providerName,
      );
      if (!provider) {
        const error = {
          code: 'provider_unavailable',
          message: `Snapshotted notification Provider "${providerName}" is unavailable.`,
          category: 'configuration',
        };
        this.options.logger.error(
          {
            event: 'notification.delivery.provider_unavailable',
            deliveryId: claimed.id,
            channel: claimed.channel,
            provider: providerName,
          },
          'Snapshotted notification Provider is unavailable.',
        );
        return this.options.store.finishDelivery(current, 'failed', error);
      }
      const startedAt = await this.options.store.now();
      const attempt: NotificationAttemptRecord = {
        id: randomUUID(),
        deliveryId: current.id,
        sequence: current.attemptCount + 1,
        providerName: provider.name,
        providerType: provider.type,
        status: 'sending',
        startedAt,
      };
      const started = await this.options.store.startAttempt(
        { ...current, providerCursor: cursor },
        attempt,
      );
      if (!started) return undefined;
      current = started;
      this.options.logger.debug(
        {
          event: 'notification.delivery.attempt_started',
          notificationId: current.notificationId,
          deliveryId: current.id,
          channel: current.channel,
          provider: provider.name,
          providerType: provider.type,
          attempt: attempt.sequence,
        },
        'Notification delivery attempt started.',
      );
      const result = await invoke(provider, prepared);
      const finishedAt = await this.options.store.now();

      if (result.status === 'accepted') {
        await this.options.store.finishAttempt({
          ...attempt,
          status: 'sent',
          finishedAt,
          providerMessageId: result.providerMessageId,
        });
        const finished = await this.options.store.finishDelivery(
          current,
          'sent',
        );
        this.options.logger.debug(
          {
            event: 'notification.delivery.sent',
            notificationId: current.notificationId,
            deliveryId: current.id,
            channel: current.channel,
            provider: provider.name,
            providerType: provider.type,
            attempt: attempt.sequence,
            providerMessageId: result.providerMessageId,
          },
          'Notification Delivery sent.',
        );
        return finished;
      }
      if (result.status === 'submission_unknown') {
        await this.options.store.finishAttempt({
          ...attempt,
          status: 'unknown',
          finishedAt,
          error: result.error,
        });
        const finished = await this.options.store.finishDelivery(
          current,
          'unknown',
          result.error,
        );
        this.options.logger.warn(
          {
            event: 'notification.delivery.submission_unknown',
            notificationId: current.notificationId,
            deliveryId: current.id,
            channel: current.channel,
            provider: provider.name,
            providerType: provider.type,
            attempt: attempt.sequence,
            error: result.error,
          },
          'Notification Provider submission result is unknown.',
        );
        return finished;
      }

      await this.options.store.finishAttempt({
        ...attempt,
        status: 'failed',
        finishedAt,
        error: result.error,
      });
      const hasNext = cursor + 1 < claimed.providerChain.length;
      if (!result.allowNextProvider || !hasNext) {
        const finished = await this.options.store.finishDelivery(
          current,
          'failed',
          result.error,
        );
        this.options.logger.warn(
          {
            event: 'notification.delivery.failed',
            notificationId: current.notificationId,
            deliveryId: current.id,
            channel: current.channel,
            provider: provider.name,
            providerType: provider.type,
            attempt: attempt.sequence,
            error: result.error,
          },
          'Notification Delivery failed.',
        );
        return finished;
      }
      this.options.logger.debug(
        {
          event: 'notification.delivery.fallback',
          notificationId: current.notificationId,
          deliveryId: current.id,
          channel: current.channel,
          provider: provider.name,
          providerType: provider.type,
          attempt: attempt.sequence,
          error: result.error,
        },
        'Notification Delivery is falling back to the next Provider.',
      );
    }
    return current;
  }

  async close(): Promise<void> {
    const providers = [...this.runtimes.values()]
      .flatMap((runtime) => runtime.providers)
      .reverse();
    for (const provider of providers) {
      try {
        await provider.close?.();
      } catch (error) {
        this.options.logger.warn(
          {
            event: 'notification.provider.close_failed',
            err: error,
            provider: provider.name,
            providerType: provider.type,
          },
          'Failed to close notification Provider.',
        );
      }
    }
    this.runtimes.clear();
  }
}

async function invoke(
  provider: NotificationProvider,
  message: object,
): Promise<ProviderSendResult> {
  try {
    return await provider.send(message);
  } catch (error) {
    return {
      status: 'failed',
      error: normalizeError(error, 'provider'),
      allowNextProvider: false,
    };
  }
}

function normalizeError(
  error: unknown,
  category: string,
): NotificationProviderSendError {
  return {
    category,
    message: error instanceof Error ? error.message : String(error),
  };
}

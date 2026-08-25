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
  readonly providerTimeoutMs?: number;
  readonly retry?: {
    readonly maxAttemptsPerProvider?: number;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly jitterRatio?: number;
  };
}

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;

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
    if (!stored || !isRunnable(stored, await this.options.store.now()))
      return stored;
    const runtime = this.runtimes.get(stored.channel);
    if (!runtime || runtime.providers.length === 0) return undefined;

    const leaseToken = randomUUID();
    const claimed = await this.options.store.claimDelivery(
      stored.id,
      leaseToken,
      await this.leaseExpiry(),
    );
    if (!claimed) return undefined;

    const stopHeartbeat = this.startHeartbeat(claimed.id, leaseToken);
    try {
      const prepared = await this.prepare(runtime.channel, claimed);
      if (!prepared.ok)
        return this.options.store.finishDelivery(
          claimed,
          'failed',
          prepared.error,
        );
      return await this.submit(runtime, claimed, prepared.value);
    } finally {
      stopHeartbeat();
    }
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

  private async prepare(
    channel: NotificationChannel,
    delivery: NotificationDeliveryRecord,
  ): Promise<
    | { readonly ok: true; readonly value: object }
    | { readonly ok: false; readonly error: NotificationProviderSendError }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error('Notification preparation timed out.')),
      this.providerTimeoutMs,
    );
    timeout.unref?.();
    try {
      const value = await Promise.race([
        channel.prepare({
          deliveryId: delivery.id,
          notificationId: delivery.notificationId,
          recipient: delivery.recipientSnapshot,
          message: delivery.messageSnapshot,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () =>
              reject(
                controller.signal.reason instanceof Error
                  ? controller.signal.reason
                  : new Error('Notification preparation timed out.'),
              ),
            { once: true },
          );
        }),
      ]);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: normalizeError(error, 'channel') };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async submit(
    runtime: ChannelRuntime,
    claimed: NotificationDeliveryRecord,
    prepared: object,
  ): Promise<NotificationDeliveryRecord | undefined> {
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
      if (!provider)
        return this.options.store.finishDelivery(current, 'failed', {
          code: 'PROVIDER_UNAVAILABLE',
          message: `Snapshotted notification Provider "${providerName}" is unavailable.`,
          category: 'configuration',
        });

      const attempt: NotificationAttemptRecord = {
        id: randomUUID(),
        deliveryId: current.id,
        sequence: current.attemptCount + 1,
        providerName: provider.name,
        providerType: provider.type,
        status: 'submitting',
        startedAt: await this.options.store.now(),
      };
      const started = await this.options.store.startAttempt(
        { ...current, providerCursor: cursor },
        attempt,
        await this.leaseExpiry(),
      );
      if (!started) return undefined;
      current = started;

      const result = await this.invoke(provider, prepared, current, attempt.id);
      const finishedAt = await this.options.store.now();
      if (result.status === 'accepted') {
        const finished = await this.options.store.finishAttemptAndDelivery(
          {
            ...attempt,
            status: 'accepted',
            finishedAt,
            providerMessageId: result.providerMessageId,
          },
          current,
          'accepted',
        );
        this.options.logger.debug(
          {
            event: 'notification.delivery.accepted',
            notificationId: current.notificationId,
            deliveryId: current.id,
            channel: current.channel,
            provider: provider.name,
            providerType: provider.type,
            providerMessageId: result.providerMessageId,
          },
          'Notification Delivery accepted by Provider.',
        );
        return finished;
      }
      if (result.status === 'submission_unknown') {
        return this.options.store.finishAttemptAndDelivery(
          {
            ...attempt,
            status: 'unknown',
            finishedAt,
            error: result.error,
          },
          current,
          'unknown',
          result.error,
        );
      }

      const failedAttempt: NotificationAttemptRecord = {
        ...attempt,
        status: 'failed',
        finishedAt,
        error: result.error,
      };
      if (result.disposition === 'same_provider') {
        const providerAttempts = (
          await this.options.store.listAttempts(current.id)
        ).filter((item) => item.providerName === provider.name).length;
        if (providerAttempts < this.maxAttemptsPerProvider) {
          const retryAt = new Date(
            Date.parse(finishedAt) +
              this.retryDelay(providerAttempts, result.retryAfterMs),
          ).toISOString();
          return this.options.store.finishAttemptAndDelivery(
            failedAttempt,
            current,
            'failed',
            result.error,
            retryAt,
          );
        }
      }
      const hasNext = cursor + 1 < claimed.providerChain.length;
      if (result.disposition === 'next_provider' && hasNext) {
        const continued = await this.options.store.finishAttemptAndContinue(
          failedAttempt,
          current,
          cursor + 1,
        );
        if (!continued) return undefined;
        current = continued;
        continue;
      }
      return this.options.store.finishAttemptAndDelivery(
        failedAttempt,
        current,
        'failed',
        result.error,
      );
    }
    return current;
  }

  private async invoke(
    provider: NotificationProvider,
    message: object,
    delivery: NotificationDeliveryRecord,
    attemptId: string,
  ): Promise<ProviderSendResult> {
    const controller = new AbortController();
    const deadline = new Date(
      Date.parse(await this.options.store.now()) + this.providerTimeoutMs,
    ).toISOString();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutResult = new Promise<ProviderSendResult>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort(new Error('Notification Provider timed out.'));
        resolve({
          status: 'submission_unknown',
          error: {
            code: 'PROVIDER_TIMEOUT',
            category: 'timeout',
            message: 'Notification Provider result is unknown after timeout.',
          },
        });
      }, this.providerTimeoutMs);
      timeout.unref?.();
    });
    try {
      return await Promise.race([
        provider.send({
          message,
          notificationId: delivery.notificationId,
          deliveryId: delivery.id,
          attemptId,
          idempotencyKey: delivery.idempotencyKey,
          deadline,
          signal: controller.signal,
        }),
        timeoutResult,
      ]);
    } catch (error) {
      return {
        status: 'failed',
        error: normalizeError(error, 'provider'),
        disposition: 'never',
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private startHeartbeat(deliveryId: string, leaseToken: string): () => void {
    const interval = setInterval(
      (): void => {
        void this.renewHeartbeat(deliveryId, leaseToken).catch(
          (error: unknown) => {
            this.options.logger.warn(
              {
                event: 'notification.delivery.lease_renew_failed',
                err: error,
                deliveryId,
              },
              'Failed to renew notification Delivery lease.',
            );
          },
        );
      },
      Math.max(1, Math.floor(this.leaseMs / 3)),
    );
    interval.unref?.();
    return (): void => clearInterval(interval);
  }

  private retryDelay(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined) return Math.max(0, retryAfterMs);
    const initial = this.options.retry?.initialDelayMs ?? 1_000;
    const maximum = this.options.retry?.maxDelayMs ?? 60_000;
    const base = Math.min(maximum, initial * 2 ** Math.max(0, attempt - 1));
    const ratio = this.options.retry?.jitterRatio ?? 0.2;
    return Math.round(base * (1 + (Math.random() * 2 - 1) * ratio));
  }

  private async leaseExpiry(): Promise<string> {
    const now = await this.options.store.now();
    return new Date(Date.parse(now) + this.leaseMs).toISOString();
  }

  private async renewHeartbeat(
    deliveryId: string,
    leaseToken: string,
  ): Promise<void> {
    await this.options.store.renewLease(
      deliveryId,
      leaseToken,
      await this.leaseExpiry(),
    );
  }

  private get leaseMs(): number {
    return this.options.leaseMs ?? DEFAULT_LEASE_MS;
  }

  private get providerTimeoutMs(): number {
    return this.options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  private get maxAttemptsPerProvider(): number {
    return this.options.retry?.maxAttemptsPerProvider ?? 3;
  }
}

function isRunnable(
  delivery: NotificationDeliveryRecord,
  now: string,
): boolean {
  return (
    delivery.status === 'pending' ||
    (delivery.status === 'failed' &&
      delivery.nextRunAt !== undefined &&
      delivery.nextRunAt <= now)
  );
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

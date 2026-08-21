import { randomUUID } from "node:crypto";

import type { Logger } from "@nocobase/logging";

import type {
  NotificationAttemptRecord,
  NotificationDeliveryRecord,
  NotificationStore,
} from "./store.js";
import type {
  NotificationChannel,
  NotificationProvider,
  NotificationProviderSendError,
  ProviderSendResult,
} from "./types.js";

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
    if (!stored || stored.status !== "pending") return stored;
    const runtime = this.runtimes.get(stored.channel);
    if (!runtime || runtime.providers.length === 0) {
      this.options.logger.error(
        { deliveryId, channel: stored.channel },
        "Notification Channel has no available Provider.",
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
      return this.options.store.finishDelivery(
        claimed,
        "failed",
        normalizeError(error, "channel"),
      );
    }

    let current = claimed;
    for (
      let cursor = claimed.providerCursor;
      cursor < runtime.providers.length;
      cursor += 1
    ) {
      const provider = runtime.providers[cursor];
      const startedAt = await this.options.store.now();
      const attempt: NotificationAttemptRecord = {
        id: randomUUID(),
        deliveryId: current.id,
        sequence: current.attemptCount + 1,
        providerName: provider.name,
        providerType: provider.type,
        status: "sending",
        startedAt,
      };
      const started = await this.options.store.startAttempt(
        { ...current, providerCursor: cursor },
        attempt,
      );
      if (!started) return undefined;
      current = started;
      const result = await invoke(provider, prepared);
      const finishedAt = await this.options.store.now();

      if (result.status === "accepted") {
        await this.options.store.finishAttempt({
          ...attempt,
          status: "sent",
          finishedAt,
          providerMessageId: result.providerMessageId,
        });
        return this.options.store.finishDelivery(current, "sent");
      }
      if (result.status === "submission_unknown") {
        await this.options.store.finishAttempt({
          ...attempt,
          status: "unknown",
          finishedAt,
          error: result.error,
        });
        return this.options.store.finishDelivery(
          current,
          "unknown",
          result.error,
        );
      }

      await this.options.store.finishAttempt({
        ...attempt,
        status: "failed",
        finishedAt,
        error: result.error,
      });
      const hasNext = cursor + 1 < runtime.providers.length;
      if (!result.allowNextProvider || !hasNext)
        return this.options.store.finishDelivery(
          current,
          "failed",
          result.error,
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
          { error, provider: provider.name },
          "Failed to close notification Provider.",
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
      status: "failed",
      error: normalizeError(error, "provider"),
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

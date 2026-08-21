import { randomUUID } from "node:crypto";

import { Job, type NocoBaseQueueDispatchableJobClass } from "@nocobase/queue";
import { Hono } from "hono";

import { ChannelManager } from "./channel-manager.js";
import { NotificationLogs } from "./logs.js";
import {
  createDatabaseNotificationStore,
  createMemoryNotificationStore,
  type NotificationDeliveryRecord,
  type NotificationLogRecord,
  type NotificationStore,
} from "./store.js";
import type {
  NotificationChannelDefinition,
  NotificationManagerOptions,
  NotificationSendInput,
  NotificationSendResult,
} from "./types.js";

interface NotificationDeliveryPayload {
  readonly deliveryId: string;
}

export class NotificationManager<
  TChannels extends {
    readonly [
      TType in keyof TChannels
    ]: import("./types.js").NotificationChannelSchema;
  },
> {
  readonly router: Hono;
  readonly logs: NotificationLogs;
  readonly store: NotificationStore;
  readonly channelManager: ChannelManager;

  private readonly definitions = new Map<
    string,
    NotificationChannelDefinition
  >();
  private readonly queueJob: NocoBaseQueueDispatchableJobClass<
    Job<NotificationDeliveryPayload>
  >;
  private started = false;
  private reconcileTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly options: NotificationManagerOptions<TChannels>) {
    if (
      !options.database &&
      !options.store &&
      !options.allowNonPersistentStore
    ) {
      throw new Error(
        "A DatabaseManager is required unless a non-persistent Store is explicitly enabled.",
      );
    }
    this.store =
      options.store ??
      (options.database
        ? createDatabaseNotificationStore(options.database)
        : createMemoryNotificationStore());
    this.logs = new NotificationLogs(this.store);
    this.router = new Hono();
    this.channelManager = new ChannelManager({
      logger: options.logger,
      store: this.store,
    });
    const channelManager = this.channelManager;
    class NotificationDeliveryJob extends Job<NotificationDeliveryPayload> {
      static options = { name: "NotificationDelivery", queue: "default" };
      async execute(): Promise<void> {
        await channelManager.send(this.payload.deliveryId);
      }
    }
    this.queueJob = NotificationDeliveryJob;
    this.mountLogRoutes();
  }

  registerChannel(definition: NotificationChannelDefinition): this {
    if (this.started)
      throw new Error(
        "Notification Channel definitions must be registered before start().",
      );
    if (this.definitions.has(definition.type))
      throw new Error(
        `Notification Channel definition "${definition.type}" is already registered.`,
      );
    this.definitions.set(definition.type, definition);
    return this;
  }

  async start(): Promise<void> {
    if (this.started) return;
    for (const config of this.options.config.channels) {
      if (!config.enabled) continue;
      const definition = this.definitions.get(config.type);
      if (!definition)
        throw new Error(
          `Notification Channel definition "${config.type}" is not registered.`,
        );
      const context = {
        database: this.options.database,
        logger: this.options.logger,
        queue: this.options.queue,
        store: this.store,
      };
      const channel = await definition.createChannel(context, config);
      const providerTypes = new Set<string>();
      const providers = [];
      for (const providerConfig of config.providers) {
        if (providerConfig.enabled === false) continue;
        if (providerTypes.has(providerConfig.name))
          throw new Error(
            `Provider name "${providerConfig.name}" is duplicated in Channel "${config.type}".`,
          );
        providerTypes.add(providerConfig.name);
        const providerDefinition = definition.providerDefinitions.find(
          (item) => item.type === providerConfig.type,
        );
        if (!providerDefinition)
          throw new Error(
            `Provider definition "${providerConfig.type}" is not registered for Channel "${config.type}".`,
          );
        providers.push(
          await providerDefinition.createProvider(context, providerConfig),
        );
      }
      if (providers.length === 0)
        throw new Error(
          `Enabled Channel "${config.type}" requires at least one enabled Provider.`,
        );
      this.channelManager.register(config.type, { channel, providers });
      channel.mount?.(this.router);
    }
    this.options.queue.registerJob(this.queueJob);
    this.started = true;
    const interval = this.options.reconcileIntervalMs ?? 30_000;
    this.reconcileTimer = setInterval((): void => {
      void this.reconcile();
    }, interval);
    this.reconcileTimer.unref?.();
    await this.reconcile();
  }

  async send(
    input: NotificationSendInput<TChannels>,
  ): Promise<NotificationSendResult> {
    if (!this.started)
      throw new Error(
        "NotificationManager.start() must complete before send().",
      );
    if (input.recipients.length === 0)
      throw new Error("At least one notification recipient is required.");
    const now = await this.store.now();
    const notificationId = randomUUID();
    const deliveries: NotificationDeliveryRecord[] = [];
    for (const recipient of input.recipients) {
      for (const target of recipient.channels) {
        const message = input.message[target.channel];
        if (!message)
          throw new Error(
            `Message for Channel "${target.channel}" is required.`,
          );
        if (!this.channelManager.has(target.channel))
          throw new Error(
            `Notification Channel "${target.channel}" is not enabled.`,
          );
        deliveries.push({
          id: randomUUID(),
          notificationId,
          channel: target.channel,
          recipientKey:
            recipient.userId ?? stableRecipientKey(target.recipient),
          recipientSnapshot: target.recipient,
          messageSnapshot: message,
          providerChain: this.channelManager.providerNames(target.channel),
          providerCursor: 0,
          attemptCount: 0,
          status: "pending",
          createdAt: now,
          updatedAt: now,
          version: 1,
        });
      }
    }
    if (deliveries.length === 0)
      throw new Error("At least one notification Channel target is required.");
    const log: NotificationLogRecord = {
      id: notificationId,
      sourceType: input.source?.type ?? "application",
      sourceReferenceId: input.source?.referenceId,
      messageSnapshot: input.message as Readonly<Record<string, object>>,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create({ log, deliveries });
    await Promise.all(
      deliveries.map(async (delivery): Promise<void> =>
        this.dispatch(delivery.id),
      ),
    );
    return {
      notificationId,
      status: "pending",
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        status: "pending",
      })),
    };
  }

  async close(): Promise<void> {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = undefined;
    await this.channelManager.close();
    this.started = false;
  }

  private async dispatch(deliveryId: string): Promise<void> {
    try {
      await this.options.queue.dispatch(this.queueJob, { deliveryId });
    } catch (error) {
      this.options.logger.warn(
        { error, deliveryId },
        "Failed to enqueue notification Delivery; reconciler will enqueue it later.",
      );
    }
  }

  private async reconcile(): Promise<void> {
    const now = await this.store.now();
    await this.store.recoverExpired(now);
    const deliveries = await this.store.listPending(
      this.options.reconcileBatchSize ?? 100,
    );
    await Promise.all(
      deliveries.map(async (delivery): Promise<void> =>
        this.dispatch(delivery.id),
      ),
    );
  }

  private mountLogRoutes(): void {
    this.router.get("/logs", async (context) =>
      context.json({ data: await this.logs.listDetails() }),
    );
    this.router.get("/logs/:id", async (context) => {
      const details = await this.logs.get(context.req.param("id"));
      return details
        ? context.json({ data: details })
        : context.json({ error: "Notification log not found." }, 404);
    });
  }
}

export function createNotificationManager<
  TChannels extends {
    readonly [
      TType in keyof TChannels
    ]: import("./types.js").NotificationChannelSchema;
  },
>(
  options: NotificationManagerOptions<TChannels>,
): NotificationManager<TChannels> {
  return new NotificationManager(options);
}

function stableRecipientKey(recipient: object): string {
  const entries = Object.entries(recipient).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify(Object.fromEntries(entries));
}

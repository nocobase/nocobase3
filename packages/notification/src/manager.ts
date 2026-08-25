import { createHash, randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import { ChannelManager } from './channel-manager.js';
import { createDeliveryJob, type DeliveryJobClass } from './delivery-job.js';
import { NotificationLogs } from './logs.js';
import {
  createDatabaseNotificationStore,
  type NotificationDeliveryRecord,
  type NotificationLogRecord,
  type NotificationStore,
} from './store.js';
import type {
  NotificationChannelDefinition,
  NotificationManagerOptions,
  NotificationProviderDefinition,
  NotificationSendInput,
  NotificationSendResult,
} from './types.js';

export class NotificationManager<
  TChannels extends {
    readonly [
      TType in keyof TChannels
    ]: import('./types.js').NotificationChannelSchema;
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
  private readonly providerDefinitions = new Map<
    string,
    Map<string, NotificationProviderDefinition>
  >();
  private readonly queueJob: DeliveryJobClass;
  private started = false;
  private startPromise?: Promise<void>;
  private queueJobRegistered = false;
  private routesMounted = false;
  private reconcileTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly options: NotificationManagerOptions<TChannels>) {
    this.store =
      options.store ?? createDatabaseNotificationStore(options.database);
    this.logs = new NotificationLogs(this.store);
    this.router = new Hono();
    this.channelManager = new ChannelManager({
      logger: options.logger,
      store: this.store,
      leaseMs: options.leaseMs,
      providerTimeoutMs: options.providerTimeoutMs,
      retry: options.retry,
    });
    this.queueJob = createDeliveryJob(this.channelManager);
  }

  registerChannel(definition: NotificationChannelDefinition): this {
    if (this.started || this.startPromise)
      throw new Error(
        'Notification Channel definitions must be registered before start().',
      );
    if (this.definitions.has(definition.type))
      throw new Error(
        `Notification Channel definition "${definition.type}" is already registered.`,
      );
    this.definitions.set(definition.type, definition);
    this.options.logger.debug(
      {
        event: 'notification.channel.registered',
        channel: definition.type,
      },
      'Notification Channel definition registered.',
    );
    return this;
  }

  registerProvider(
    channelType: string,
    definition: NotificationProviderDefinition,
  ): this {
    if (this.started || this.startPromise)
      throw new Error(
        'Notification Provider definitions must be registered before start().',
      );
    const definitions =
      this.providerDefinitions.get(channelType) ??
      new Map<string, NotificationProviderDefinition>();
    if (definitions.has(definition.type))
      throw new Error(
        `Notification Provider definition "${definition.type}" is already registered for Channel "${channelType}".`,
      );
    definitions.set(definition.type, definition);
    this.providerDefinitions.set(channelType, definitions);
    this.options.logger.debug(
      {
        event: 'notification.provider.registered',
        channel: channelType,
        providerType: definition.type,
      },
      'Notification Provider definition registered.',
    );
    return this;
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    const operation = this.startInternal();
    this.startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.startPromise === operation) this.startPromise = undefined;
    }
  }

  private async startInternal(): Promise<void> {
    const pendingProviders: import('./types.js').NotificationProvider[] = [];
    const enabledConfigs = this.options.config.channels.filter(
      (config) => config.enabled,
    );
    this.options.logger.debug(
      {
        event: 'notification.manager.starting',
        enabledChannelCount: enabledConfigs.length,
      },
      'Starting Notification Manager.',
    );
    try {
      let providerCount = 0;
      const channels: import('./types.js').NotificationChannel[] = [];
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
        const providerDefinitions = this.providerDefinitions.get(config.type);
        const providerTypes = new Set<string>();
        const providers = [];
        for (const providerConfig of config.providers) {
          if (providerConfig.enabled === false) continue;
          if (providerTypes.has(providerConfig.name))
            throw new Error(
              `Provider name "${providerConfig.name}" is duplicated in Channel "${config.type}".`,
            );
          providerTypes.add(providerConfig.name);
          const providerDefinition = providerDefinitions?.get(
            providerConfig.type,
          );
          if (!providerDefinition)
            throw new Error(
              `Provider definition "${providerConfig.type}" is not registered for Channel "${config.type}".`,
            );
          const provider = await providerDefinition.createProvider(
            context,
            providerConfig,
          );
          pendingProviders.push(provider);
          if (provider.name !== providerConfig.name)
            throw new Error(
              `Provider Runtime name "${provider.name}" must match configured name "${providerConfig.name}" in Channel "${config.type}".`,
            );
          providers.push(provider);
        }
        if (providers.length === 0)
          throw new Error(
            `Enabled Channel "${config.type}" requires at least one enabled Provider.`,
          );
        this.channelManager.register(config.type, { channel, providers });
        pendingProviders.length = 0;
        channels.push(channel);
        providerCount += providers.length;
        this.options.logger.debug(
          {
            event: 'notification.channel.started',
            channel: config.type,
            providers: providers.map((provider) => ({
              name: provider.name,
              type: provider.type,
            })),
          },
          'Notification Channel started.',
        );
      }
      const channelRouter = new Hono();
      if (!this.routesMounted) {
        for (const channel of channels) channel.mount?.(channelRouter);
      }
      if (!this.queueJobRegistered) {
        this.options.queue.registerJob(this.queueJob);
        this.queueJobRegistered = true;
      }
      const interval = this.options.reconcileIntervalMs ?? 30_000;
      await this.reconcile();
      if (!this.routesMounted) {
        this.router.route('/', channelRouter);
        this.routesMounted = true;
      }
      this.started = true;
      this.reconcileTimer = setInterval((): void => {
        void this.reconcile().catch((error: unknown) => {
          this.options.logger.error(
            { event: 'notification.reconcile_failed', err: error },
            'Notification reconciliation failed.',
          );
        });
      }, interval);
      this.reconcileTimer.unref?.();
      this.options.logger.info(
        {
          event: 'notification.manager.started',
          channelCount: enabledConfigs.length,
          providerCount,
          reconcileIntervalMs: interval,
        },
        'Notification Manager started.',
      );
    } catch (error) {
      if (this.reconcileTimer) clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
      this.started = false;
      for (const provider of pendingProviders.reverse()) {
        try {
          await provider.close?.();
        } catch {
          // Preserve the startup error; registered Providers are logged by close().
        }
      }
      await this.channelManager.close();
      this.options.logger.error(
        { event: 'notification.manager.start_failed', err: error },
        'Failed to start Notification Manager.',
      );
      throw error;
    }
  }

  async send(
    input: NotificationSendInput<TChannels>,
  ): Promise<NotificationSendResult> {
    if (!this.started)
      throw new Error(
        'NotificationManager.start() must complete before send().',
      );
    if (
      input.idempotencyKey !== undefined &&
      (input.idempotencyKey.length === 0 || input.idempotencyKey.length > 255)
    )
      throw new Error(
        'Notification idempotencyKey must contain between 1 and 255 characters.',
      );
    if (input.recipients.length === 0)
      throw new Error('At least one notification recipient is required.');
    const now = await this.store.now();
    const notificationId = input.idempotencyKey
      ? stableUuid(
          `${input.source?.type ?? 'application'}:${input.idempotencyKey}`,
        )
      : randomUUID();
    const requestHash = stableHash({
      source: input.source,
      recipients: input.recipients,
      message: input.message,
    });
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
        const deliveryId = randomUUID();
        deliveries.push({
          id: deliveryId,
          notificationId,
          channel: target.channel,
          recipientKey:
            recipient.userId ?? stableRecipientKey(target.recipient),
          recipientSnapshot: target.recipient,
          messageSnapshot: message,
          providerChain: this.channelManager.providerNames(target.channel),
          providerCursor: 0,
          attemptCount: 0,
          status: 'pending',
          idempotencyKey: `${notificationId}:${deliveryId}`,
          createdAt: now,
          updatedAt: now,
          version: 1,
        });
      }
    }
    if (deliveries.length === 0)
      throw new Error('At least one notification Channel target is required.');
    const log: NotificationLogRecord = {
      id: notificationId,
      sourceType: input.source?.type ?? 'application',
      sourceReferenceId: input.source?.referenceId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      messageSnapshot: input.message as Readonly<Record<string, object>>,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.create({ log, deliveries });
    const storedDeliveries = created.bundle.deliveries;
    await Promise.all(
      storedDeliveries
        .filter((delivery) => created.created && delivery.status === 'pending')
        .map(async (delivery): Promise<void> => this.dispatch(delivery.id)),
    );
    this.options.logger.debug(
      {
        event: 'notification.queued',
        notificationId,
        sourceType: log.sourceType,
        deliveryCount: storedDeliveries.length,
        channels: [
          ...new Set(storedDeliveries.map((delivery) => delivery.channel)),
        ],
      },
      'Notification queued for delivery.',
    );
    return {
      notificationId: created.bundle.log.id,
      status: created.bundle.log.status,
      deliveries: storedDeliveries.map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
      })),
    };
  }

  async close(): Promise<void> {
    await this.startPromise?.catch(() => undefined);
    const wasStarted = this.started;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = undefined;
    await this.channelManager.close();
    this.started = false;
    if (wasStarted) {
      this.options.logger.info(
        { event: 'notification.manager.closed' },
        'Notification Manager closed.',
      );
    }
  }

  private async dispatch(deliveryId: string): Promise<void> {
    try {
      await this.options.queue.dispatch(this.queueJob, { deliveryId });
    } catch (error) {
      this.options.logger.warn(
        {
          event: 'notification.delivery.enqueue_failed',
          err: error,
          deliveryId,
        },
        'Failed to enqueue notification Delivery; reconciler will enqueue it later.',
      );
    }
  }

  private async reconcile(): Promise<void> {
    const now = await this.store.now();
    const recoveredCount = await this.store.recoverExpired(now);
    const deliveries = await this.store.listReady(
      now,
      this.options.reconcileBatchSize ?? 100,
    );
    await Promise.all(
      deliveries.map(async (delivery): Promise<void> =>
        this.dispatch(delivery.id),
      ),
    );
    if (recoveredCount > 0 || deliveries.length > 0) {
      this.options.logger.info(
        {
          event: 'notification.reconciled',
          recoveredDeliveryCount: recoveredCount,
          pendingDeliveryCount: deliveries.length,
        },
        'Notification deliveries reconciled.',
      );
    }
  }
}

export function createNotificationManager<
  TChannels extends {
    readonly [
      TType in keyof TChannels
    ]: import('./types.js').NotificationChannelSchema;
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

function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function stableUuid(value: string): string {
  const hex = stableHash(value).slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

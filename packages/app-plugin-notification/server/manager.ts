import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import { ChannelManager } from './channel-manager.js';
import { createDeliveryJob, type DeliveryJobClass } from './delivery-job.js';
import { NotificationLogs } from './logs.js';
import {
  createNotificationRegistry,
  type NotificationRegistry,
} from './registry.js';
import { createNotificationRouter } from './router.js';
import {
  createDatabaseNotificationStore,
  type NotificationDeliveryRecord,
  type NotificationErrorRecord,
  type NotificationLogRecord,
  type NotificationLogStatus,
  type NotificationStore,
} from './store.js';
import type {
  NotificationManagerOptions,
  NotificationProviderIdentity,
  NotificationProviderRouting,
  NotificationRecipient,
  NotificationSendInput,
  NotificationSendResult,
} from './types.js';

interface ExpandedRecipientTarget {
  readonly channel: string;
  readonly provider: NotificationProviderIdentity;
  readonly recipient: object;
  readonly error?: NotificationErrorRecord;
}

interface ExpandedRecipient {
  readonly channels: readonly ExpandedRecipientTarget[];
}

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
  readonly registry: NotificationRegistry;
  private readonly channelManager: ChannelManager;

  private readonly queueJob: DeliveryJobClass;
  private readonly runtimePromises = new Map<string, Promise<void>>();
  private activated = false;
  private started = false;
  private startPromise?: Promise<void>;
  private reconcileTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly options: NotificationManagerOptions<TChannels>) {
    this.registry = options.registry ?? createNotificationRegistry();
    this.store =
      options.store ?? createDatabaseNotificationStore(options.database);
    this.logs = new NotificationLogs(this.store);
    this.router = createNotificationRouter({ logs: this.logs });
    this.channelManager = new ChannelManager({
      logger: options.logger,
      store: this.store,
      leaseMs: options.leaseMs,
      providerTimeoutMs: options.providerTimeoutMs,
      retry: options.retry,
      resolveRuntime: async (type): Promise<void> => this.ensureRuntime(type),
    });
    this.queueJob = createDeliveryJob(this.channelManager);
  }

  activate(): void {
    if (
      this.activated ||
      !this.options.config.channels.some((config) => config.enabled)
    )
      return;
    this.options.queue.registerJob(this.queueJob);
    this.activated = true;
    this.startReconciler();
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
    if (enabledConfigs.length === 0) {
      this.started = true;
      this.options.logger.info(
        {
          event: 'notification.manager.started',
          channelCount: 0,
          providerCount: 0,
          reconcileIntervalMs: this.options.reconcileIntervalMs ?? 30_000,
        },
        'Notification Manager started.',
      );
      return;
    }
    try {
      this.activate();
      await Promise.all(
        enabledConfigs.map(async (config): Promise<void> =>
          this.ensureRuntime(config.type),
        ),
      );
      await this.reconcile();
      this.started = true;
      this.options.logger.info(
        {
          event: 'notification.manager.started',
          channelCount: enabledConfigs.length,
          providerCount: enabledConfigs.reduce(
            (count, config) =>
              count +
              config.providers.filter((provider) => provider.enabled !== false)
                .length,
            0,
          ),
          reconcileIntervalMs: this.options.reconcileIntervalMs ?? 30_000,
        },
        'Notification Manager started.',
      );
    } catch (error) {
      if (this.reconcileTimer) clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
      this.started = false;
      await this.channelManager.close();
      this.runtimePromises.clear();
      this.activated = false;
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
    this.activate();
    const recipients: readonly NotificationRecipient[] =
      'type' in input.to ? [input.to] : input.to;
    if (recipients.length === 0)
      throw new Error('At least one notification recipient is required.');
    const channels = [...new Set(input.channels)];
    if (channels.length === 0)
      throw new Error('At least one notification Channel is required.');
    await Promise.all(
      channels.map(async (channel): Promise<void> =>
        this.ensureRuntime(channel),
      ),
    );

    const message: Record<string, object> = {};
    for (const channel of channels) {
      const override = input.channelOverrides?.[channel];
      message[channel] = this.channelManager.render(
        channel,
        input.content,
        override,
      );
    }

    const expandedRecipients: ExpandedRecipient[] = [];
    for (const recipient of recipients) {
      const targets: ExpandedRecipientTarget[] = [];
      for (const channel of channels) {
        const providerRouting = input.routing?.[channel]?.providers;
        const fanout = providerRouting?.strategy === 'all';
        const providers = this.providersForRouting(channel, providerRouting);
        const [fallbackProvider] = providers;
        if (!fallbackProvider)
          throw new Error(
            `Notification Channel "${channel}" has no matching enabled Provider.`,
          );
        let resolvedTarget: ExpandedRecipientTarget | undefined;
        for (const provider of providers) {
          const resolved = await this.channelManager.resolveRecipient(
            channel,
            recipient,
            provider,
          );
          if (resolved) {
            const target = { channel, provider, recipient: resolved };
            if (fanout) {
              targets.push(target);
            } else {
              resolvedTarget = target;
              break;
            }
          } else if (fanout) {
            targets.push(
              unsupportedRecipientTarget(channel, provider, recipient),
            );
          }
        }
        if (fanout) continue;
        targets.push(
          resolvedTarget ??
            unsupportedRecipientTarget(channel, fallbackProvider, recipient),
        );
      }
      expandedRecipients.push({ channels: targets });
    }

    return this.sendExpanded({
      source: input.source,
      recipients: expandedRecipients,
      message,
    });
  }

  private async sendExpanded(input: {
    readonly source?: {
      readonly type: string;
      readonly referenceId?: string;
    };
    readonly recipients: readonly ExpandedRecipient[];
    readonly message: Readonly<Record<string, object | undefined>>;
  }): Promise<NotificationSendResult> {
    if (input.recipients.length === 0)
      throw new Error('At least one notification recipient is required.');
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
          recipientSnapshot: target.recipient,
          messageSnapshot: message,
          providerName: target.provider.name,
          providerType: target.provider.type,
          attemptCount: 0,
          status: target.error ? 'failed' : 'pending',
          lastError: target.error,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (deliveries.length === 0)
      throw new Error('At least one notification Channel target is required.');
    const log: NotificationLogRecord = {
      id: notificationId,
      sourceType: input.source?.type ?? 'application',
      sourceReferenceId: input.source?.referenceId,
      messageSnapshot: input.message as Readonly<Record<string, object>>,
      status: initialNotificationStatus(deliveries),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create({ log, deliveries });
    await Promise.all(
      deliveries
        .filter((delivery) => delivery.status === 'pending')
        .map(async (delivery): Promise<void> => this.dispatch(delivery.id)),
    );
    this.options.logger.debug(
      {
        event: 'notification.queued',
        notificationId,
        sourceType: log.sourceType,
        deliveryCount: deliveries.length,
        channels: [...new Set(deliveries.map((delivery) => delivery.channel))],
      },
      'Notification queued for delivery.',
    );
    return {
      notificationId: log.id,
      status: log.status,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        provider: {
          name: delivery.providerName,
          type: delivery.providerType,
        },
        status: delivery.status,
      })),
    };
  }

  async close(): Promise<void> {
    await this.startPromise?.catch(() => undefined);
    const wasActive = this.activated;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = undefined;
    await this.channelManager.close();
    this.runtimePromises.clear();
    this.activated = false;
    this.started = false;
    if (wasActive) {
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

  private startReconciler(): void {
    const interval = this.options.reconcileIntervalMs ?? 30_000;
    this.reconcileTimer = setInterval((): void => {
      void this.reconcile().catch((error: unknown) => {
        this.options.logger.error(
          { event: 'notification.reconcile_failed', err: error },
          'Notification reconciliation failed.',
        );
      });
    }, interval);
    this.reconcileTimer.unref?.();
  }

  private ensureRuntime(type: string): Promise<void> {
    if (this.channelManager.has(type)) return Promise.resolve();
    const existing = this.runtimePromises.get(type);
    if (existing) return existing;
    const operation = this.createRuntime(type);
    this.runtimePromises.set(type, operation);
    void operation.catch(() => {
      if (this.runtimePromises.get(type) === operation) {
        this.runtimePromises.delete(type);
      }
    });
    return operation;
  }

  private providersForRouting(
    channel: string,
    routing: NotificationProviderRouting | undefined,
  ): readonly NotificationProviderIdentity[] {
    if (!routing) return this.channelManager.providerCandidates(channel);
    if (routing.strategy !== 'all') {
      if (!routing.provider)
        return this.channelManager.providerIdentities(channel);
      return [this.enabledProvider(channel, routing.provider)];
    }
    if (!routing.providers)
      return this.channelManager.providerIdentities(channel, { all: true });

    const providers = new Map<string, NotificationProviderIdentity>();
    for (const identity of routing.providers) {
      const provider = this.enabledProvider(channel, identity);
      providers.set(`${provider.name}\0${provider.type}`, provider);
    }
    return [...providers.values()];
  }

  private enabledProvider(
    channel: string,
    identity: NotificationProviderIdentity,
  ): NotificationProviderIdentity {
    const providers = this.channelManager.providerIdentities(channel, {
      providerName: identity.name,
    });
    const [provider] = providers;
    if (!provider || provider.type !== identity.type)
      throw new Error(
        `Notification Provider "${identity.name}" (${identity.type}) is not enabled for Channel "${channel}".`,
      );
    return provider;
  }

  private async createRuntime(type: string): Promise<void> {
    const config = this.options.config.channels.find(
      (candidate) => candidate.type === type,
    );
    if (!config?.enabled)
      throw new Error(`Notification Channel "${type}" is not enabled.`);
    const definition = this.registry.channel(type);
    if (!definition)
      throw new Error(
        `Notification Channel definition "${type}" is not registered.`,
      );
    const channel = await definition.createChannel(
      { logger: this.options.logger },
      config,
    );
    const providerContext = {
      logger: this.options.logger,
      now: (): Promise<string> => this.store.now(),
    };
    const providers: import('./types.js').NotificationProvider[] = [];
    try {
      const providerNames = new Set<string>();
      for (const providerConfig of config.providers) {
        if (providerConfig.enabled === false) continue;
        if (providerNames.has(providerConfig.name))
          throw new Error(
            `Provider name "${providerConfig.name}" is duplicated in Channel "${type}".`,
          );
        providerNames.add(providerConfig.name);
        const providerDefinition = this.registry.provider(
          type,
          providerConfig.type,
        );
        if (!providerDefinition)
          throw new Error(
            `Provider definition "${providerConfig.type}" is not registered for Channel "${type}".`,
          );
        const provider = await providerDefinition.createProvider(
          providerContext,
          providerConfig,
        );
        providers.push(provider);
        if (provider.name !== providerConfig.name)
          throw new Error(
            `Provider Runtime name "${provider.name}" must match configured name "${providerConfig.name}" in Channel "${type}".`,
          );
        if (provider.type !== providerConfig.type)
          throw new Error(
            `Provider Runtime type "${provider.type}" must match configured type "${providerConfig.type}" for Provider "${providerConfig.name}" in Channel "${type}".`,
          );
      }
      if (providers.length === 0)
        throw new Error(
          `Enabled Channel "${type}" requires at least one enabled Provider.`,
        );
      this.channelManager.register(type, { channel, providers });
      this.options.logger.debug(
        {
          event: 'notification.channel.started',
          channel: type,
          providers: providers.map((provider) => ({
            name: provider.name,
            type: provider.type,
          })),
        },
        'Notification Channel started.',
      );
    } catch (error) {
      for (const provider of providers.reverse()) {
        try {
          await provider.close?.();
        } catch {
          // Preserve the Runtime creation error.
        }
      }
      throw error;
    }
  }
}

function unsupportedRecipientTarget(
  channel: string,
  provider: NotificationProviderIdentity,
  recipient: NotificationRecipient,
): ExpandedRecipientTarget {
  return {
    channel,
    provider,
    recipient,
    error: {
      code: 'RECIPIENT_UNSUPPORTED',
      category: 'recipient',
      message: `Notification Channel "${channel}" does not support recipient type "${recipient.type}".`,
    },
  };
}

function initialNotificationStatus(
  deliveries: readonly NotificationDeliveryRecord[],
): NotificationLogStatus {
  if (deliveries.every((delivery) => delivery.status === 'failed'))
    return 'failed';
  if (deliveries.some((delivery) => delivery.status === 'failed'))
    return 'processing';
  return 'pending';
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

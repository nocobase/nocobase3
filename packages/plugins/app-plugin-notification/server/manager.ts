import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';

import { ChannelManager } from './channel-manager.js';
import { createDeliveryJob, type DeliveryJobClass } from './delivery-job.js';
import { NotificationLogs } from './logs.js';
import { NotificationReconcileJob } from './notification-reconcile-job.js';
import {
  notificationRequestFingerprint,
  validateNotificationIdempotencyKey,
} from './idempotency.js';
import { notificationTestError } from './types.js';
import {
  createNotificationRegistry,
  type NotificationRegistry,
} from './registry.js';
import { createNotificationRouter } from './router.js';
import {
  createDatabaseNotificationStore,
  summarizeNotificationDeliveries,
  type NotificationDeliveryRecord,
  type NotificationErrorRecord,
  type NotificationLogRecord,
  type NotificationLogStatus,
  type NotificationRetryResolutionRecord,
  type NotificationStore,
} from './store.js';
import type {
  NotificationDeliveryRetryDecision,
  NotificationDeliveryStatusSnapshot,
  NotificationManagerOptions,
  NotificationProviderIdentity,
  NotificationProviderRouting,
  NotificationRecipient,
  NotificationRetryDeliveryInput,
  NotificationSendInput,
  NotificationSendResult,
  NotificationStatusChangedEvent,
  NotificationStatusChangedFilter,
  NotificationStatusChangedListener,
  NotificationStatusSnapshot,
  NotificationTestActor,
  NotificationTestSendRequest,
  NotificationTestTargetDescriptor,
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

interface StatusSubscription {
  readonly filter: NotificationStatusChangedFilter;
  readonly listener: NotificationStatusChangedListener;
  lastDeliveredSequence: number;
}

export class NotificationIdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT';
  constructor(readonly idempotencyKey: string) {
    super(
      `Notification idempotency key "${idempotencyKey}" was already used with a different request.`,
    );
    this.name = 'NotificationIdempotencyConflictError';
  }
}

export class NotificationDeliveryRetryError extends Error {
  readonly code = 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED';
  constructor(
    readonly deliveryId: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationDeliveryRetryError';
  }
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
  private readonly reconcileJob: NotificationReconcileJob;
  private readonly runtimePromises = new Map<string, Promise<void>>();
  private readonly statusSubscriptions = new Map<string, StatusSubscription>();
  private nextStatusSequence = 0;
  private activated = false;
  private started = false;
  private startPromise?: Promise<void>;

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
      onDeliveryChanged: (delivery): void => {
        this.scheduleStatusChanged(delivery.notificationId);
      },
    });
    this.queueJob = createDeliveryJob(this.channelManager);
    this.reconcileJob = new NotificationReconcileJob({
      intervalMs: options.reconcileIntervalMs ?? 30_000,
      logger: options.logger,
      execute: async (): Promise<void> => this.reconcile(),
    });
  }

  activate(): void {
    if (
      this.activated ||
      !this.options.config.channels.some((config) => config.enabled)
    )
      return;
    this.registry.validate(this.options.config);
    this.options.queue.registerJob(this.queueJob);
    this.activated = true;
    this.reconcileJob.start();
  }

  listTestTargets(): readonly NotificationTestTargetDescriptor[] {
    return this.registry.testTargets(this.options.config);
  }

  async sendTest(
    request: NotificationTestSendRequest,
    actor: NotificationTestActor,
  ): Promise<NotificationSendResult> {
    const target = this.resolveTestTarget(request);
    const channelConfig = this.options.config.channels.find(
      (candidate) => candidate.type === request.channel && candidate.enabled,
    );
    const providerConfig = channelConfig?.providers.find(
      (candidate) =>
        candidate.name === request.provider.name &&
        candidate.type === request.provider.type &&
        candidate.enabled !== false,
    );
    const definition = this.registry.channel(request.channel);
    if (!channelConfig || !providerConfig || !definition?.test) {
      throw notificationTestError(
        'NOTIFICATION_TEST_TARGET_UNAVAILABLE',
        'errors.testTargetUnavailable',
      );
    }
    const converted = definition.test.toSendInput({
      actor,
      values: request.values,
      channelConfig,
      providerConfig,
    });
    const channel = target.channel.type as keyof TChannels & string;
    const routing = {
      [channel]: { providers: { provider: target.provider.name } },
    } as NotificationSendInput<TChannels>['routing'];
    const channelOverrides = converted.channelOverride
      ? ({
          [channel]: converted.channelOverride,
        } as NotificationSendInput<TChannels>['channelOverrides'])
      : undefined;
    return this.send({
      idempotencyKey: `notification-test:${randomUUID()}`,
      ...(converted.to === undefined ? {} : { to: converted.to }),
      channels: [channel],
      routing,
      content: converted.content,
      channelOverrides,
      source: { type: 'notification-test', referenceId: actor.userId },
    });
  }

  async getTestStatus(
    notificationId: string,
    actor: NotificationTestActor,
  ): Promise<import('./logs.js').NotificationLogDetails | undefined> {
    const details = await this.logs.get(notificationId);
    return details?.log.sourceType === 'notification-test' &&
      details.log.sourceReferenceId === actor.userId
      ? details
      : undefined;
  }

  private resolveTestTarget(
    request: NotificationTestSendRequest,
  ): NotificationTestTargetDescriptor {
    const target = this.listTestTargets().find(
      (candidate) =>
        candidate.channel.type === request.channel &&
        candidate.provider.name === request.provider.name &&
        candidate.provider.type === request.provider.type,
    );
    if (!target)
      throw notificationTestError(
        'NOTIFICATION_TEST_TARGET_UNAVAILABLE',
        'errors.testTargetUnavailable',
      );
    const fieldNames = new Set(target.fields.map((field) => field.name));
    for (const name of Object.keys(request.values)) {
      if (!fieldNames.has(name)) {
        throw notificationTestError(
          'NOTIFICATION_TEST_UNKNOWN_FIELD',
          'errors.testUnknownField',
          { params: { name } },
        );
      }
    }
    for (const field of target.fields) {
      const value = request.values[field.name]?.trim() ?? '';
      if (field.required && !value) {
        throw notificationTestError(
          'NOTIFICATION_TEST_REQUIRED_FIELD',
          'errors.testRequiredField',
          { params: { name: field.name } },
        );
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        throw notificationTestError(
          'NOTIFICATION_TEST_FIELD_TOO_LONG',
          'errors.testFieldTooLong',
          { params: { name: field.name, maxLength: field.maxLength } },
        );
      }
    }
    return target;
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
      await this.reconcileJob.stop();
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
    validateNotificationIdempotencyKey(input.idempotencyKey);
    const requestFingerprint = notificationRequestFingerprint(input);
    const existing = await this.store.getLogByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new NotificationIdempotencyConflictError(input.idempotencyKey);
      }
      const existingDeliveries = await this.store.listDeliveries(existing.id);
      await Promise.all(
        existingDeliveries
          .filter((delivery) => delivery.status === 'pending')
          .map(async (delivery): Promise<void> => this.dispatch(delivery.id)),
      );
      const snapshot = await this.statusSnapshot(existing);
      return {
        notificationId: snapshot.notificationId,
        idempotencyKey: input.idempotencyKey,
        deduplicated: true,
        status: snapshot.status,
        deliveries: snapshot.deliveries,
      };
    }
    const recipients: readonly (NotificationRecipient | undefined)[] =
      input.to === undefined
        ? [undefined]
        : 'type' in input.to
          ? [input.to]
          : input.to;
    if (input.to !== undefined && recipients.length === 0)
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
            targets.push(unsupportedRecipient(channel, provider, recipient));
          }
        }
        if (fanout) continue;
        targets.push(
          resolvedTarget ??
            unsupportedRecipient(channel, fallbackProvider, recipient),
        );
      }
      expandedRecipients.push({ channels: targets });
    }

    return this.sendExpanded({
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      source: input.source,
      recipients: expandedRecipients,
      message,
    });
  }

  private async sendExpanded(input: {
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
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
      throw new Error(
        'At least one notification Channel delivery is required.',
      );
    const log: NotificationLogRecord = {
      id: notificationId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      sourceType: input.source?.type ?? 'application',
      sourceReferenceId: input.source?.referenceId,
      messageSnapshot: input.message as Readonly<Record<string, object>>,
      status: initialNotificationStatus(deliveries),
      createdAt: now,
      updatedAt: now,
    };
    const persisted = await this.store.createOrGetByIdempotency({
      log,
      deliveries,
    });
    if (persisted.outcome === 'conflict') {
      throw new NotificationIdempotencyConflictError(input.idempotencyKey);
    }
    const currentDeliveries = persisted.bundle.deliveries;
    if (persisted.outcome === 'created') {
      this.scheduleStatusChanged(persisted.bundle.log.id);
    }
    await Promise.all(
      currentDeliveries
        .filter((delivery) => delivery.status === 'pending')
        .map(async (delivery): Promise<void> => this.dispatch(delivery.id)),
    );
    this.options.logger.debug(
      {
        event: 'notification.queued',
        notificationId: persisted.bundle.log.id,
        sourceType: persisted.bundle.log.sourceType,
        deliveryCount: currentDeliveries.length,
        channels: [
          ...new Set(currentDeliveries.map((delivery) => delivery.channel)),
        ],
        deduplicated: persisted.outcome === 'existing',
      },
      'Notification queued for delivery.',
    );
    const snapshot = await this.getNotification(persisted.bundle.log.id);
    if (!snapshot)
      throw new Error(
        'Persisted notification could not be read after creation.',
      );
    return {
      notificationId: snapshot.notificationId,
      idempotencyKey: input.idempotencyKey,
      deduplicated: persisted.outcome === 'existing',
      status: snapshot.status,
      deliveries: snapshot.deliveries,
    };
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationStatusSnapshot | undefined> {
    validateNotificationIdempotencyKey(idempotencyKey);
    const log = await this.store.getLogByIdempotencyKey(idempotencyKey);
    return log ? this.statusSnapshot(log) : undefined;
  }

  async getNotification(
    notificationId: string,
  ): Promise<NotificationStatusSnapshot | undefined> {
    const log = await this.store.getLog(notificationId);
    return log ? this.statusSnapshot(log) : undefined;
  }

  onStatusChanged(
    filter: NotificationStatusChangedFilter,
    listener: NotificationStatusChangedListener,
  ): () => void {
    if (!filter.notificationId && !filter.idempotencyKey) {
      throw new Error(
        'Notification status subscription requires notificationId or idempotencyKey.',
      );
    }
    if (filter.idempotencyKey)
      validateNotificationIdempotencyKey(filter.idempotencyKey);
    const id = randomUUID();
    const sequence = this.issueStatusSequence();
    const subscription = {
      filter,
      listener,
      lastDeliveredSequence: sequence - 1,
    };
    this.statusSubscriptions.set(id, subscription);
    void this.emitCurrentStatus(id, subscription, sequence).catch(
      (error: unknown) => {
        this.options.logger.warn(
          { event: 'notification.status_initial_read_failed', err: error },
          'Failed to read initial notification status for a listener.',
        );
      },
    );
    return (): void => {
      this.statusSubscriptions.delete(id);
    };
  }

  async retryDelivery(
    input: NotificationRetryDeliveryInput,
  ): Promise<NotificationDeliveryStatusSnapshot> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new NotificationDeliveryRetryError(
        input.deliveryId,
        'A retry reason is required.',
      );
    }
    const delivery = await this.store.getDelivery(input.deliveryId);
    if (!delivery) {
      throw new NotificationDeliveryRetryError(
        input.deliveryId,
        `Notification Delivery "${input.deliveryId}" was not found.`,
      );
    }
    await this.ensureRuntime(delivery.channel);
    const decision = await this.retryDecision(delivery);
    if (delivery.status !== 'failed' && delivery.status !== 'unknown') {
      throw new NotificationDeliveryRetryError(
        delivery.id,
        decision.reason ?? 'Notification Delivery is not retryable.',
      );
    }
    const resolution = this.retryResolution(
      delivery,
      decision,
      reason,
      await this.store.now(),
    );
    const retried = await this.store.retryDelivery(
      delivery.id,
      delivery.status,
      resolution,
    );
    if (!retried) {
      throw new NotificationDeliveryRetryError(
        delivery.id,
        'Notification Delivery changed while the retry was requested.',
      );
    }
    this.scheduleStatusChanged(retried.notificationId);
    await this.dispatch(retried.id);
    return this.deliverySnapshot(
      (await this.store.getDelivery(retried.id)) ?? retried,
    );
  }

  async close(): Promise<void> {
    await this.startPromise?.catch(() => undefined);
    const wasActive = this.activated;
    await this.reconcileJob.stop();
    await this.channelManager.close();
    this.runtimePromises.clear();
    this.activated = false;
    this.started = false;
    this.statusSubscriptions.clear();
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
    const recovered = await this.store.recoverExpired(now);
    for (const delivery of recovered)
      this.scheduleStatusChanged(delivery.notificationId);
    const deliveries = await this.store.listReady(
      now,
      this.options.reconcileBatchSize ?? 100,
    );
    await Promise.all(
      deliveries.map(async (delivery): Promise<void> =>
        this.dispatch(delivery.id),
      ),
    );
    if (recovered.length > 0 || deliveries.length > 0) {
      this.options.logger.info(
        {
          event: 'notification.reconciled',
          recoveredDeliveryCount: recovered.length,
          pendingDeliveryCount: deliveries.length,
        },
        'Notification deliveries reconciled.',
      );
    }
  }

  private async statusSnapshot(
    log: NotificationLogRecord,
  ): Promise<NotificationStatusSnapshot> {
    const deliveries = await this.store.listDeliveries(log.id);
    const snapshots = await Promise.all(
      deliveries.map(async (delivery) => this.deliverySnapshot(delivery)),
    );
    const summary = {
      total: snapshots.length,
      pending: snapshots.filter((item) => item.status === 'pending').length,
      processing: snapshots.filter((item) =>
        ['preparing', 'submitting'].includes(item.status),
      ).length,
      accepted: snapshots.filter((item) => item.status === 'accepted').length,
      failed: snapshots.filter((item) => item.status === 'failed').length,
      unknown: snapshots.filter((item) => item.status === 'unknown').length,
    };
    const status = summarizeNotificationDeliveries(deliveries);
    const updatedAt = deliveries.reduce(
      (latest, delivery) =>
        delivery.updatedAt > latest ? delivery.updatedAt : latest,
      log.updatedAt,
    );
    return {
      notificationId: log.id,
      idempotencyKey: log.idempotencyKey,
      status,
      terminal: ['completed', 'partial', 'failed', 'unknown'].includes(status),
      requiresAction:
        summary.unknown > 0 ||
        snapshots.some(
          (item) =>
            item.status === 'failed' &&
            item.retry.mode !== 'automatic_retry_scheduled',
        ),
      updatedAt,
      summary,
      deliveries: snapshots,
    };
  }

  private async deliverySnapshot(
    delivery: NotificationDeliveryRecord,
  ): Promise<NotificationDeliveryStatusSnapshot> {
    return {
      id: delivery.id,
      channel: delivery.channel,
      provider: {
        name: delivery.providerName,
        type: delivery.providerType,
      },
      attemptCount: delivery.attemptCount,
      status: delivery.status,
      nextRunAt: delivery.nextRunAt,
      error: delivery.lastError,
      retry: await this.retryDecision(delivery),
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }

  private async retryDecision(
    delivery: NotificationDeliveryRecord,
  ): Promise<NotificationDeliveryRetryDecision> {
    if (delivery.status === 'failed' && delivery.nextRunAt) {
      return {
        allowed: false,
        mode: 'automatic_retry_scheduled',
        nextRunAt: delivery.nextRunAt,
        reason: 'The Provider already scheduled an automatic retry.',
      };
    }
    if (delivery.status === 'failed') {
      if (delivery.lastError?.code === 'RECIPIENT_UNSUPPORTED') {
        return {
          allowed: false,
          mode: 'not_allowed',
          reason:
            'An unsupported recipient must be corrected with a new logical send.',
        };
      }
      return {
        allowed: true,
        mode: 'safe',
        reason: 'The previous attempt is known to have failed.',
      };
    }
    if (delivery.status === 'unknown') {
      const idempotency = delivery.providerIdempotency;
      const capabilities = this.channelManager.providerCapabilities(
        delivery.channel,
        { name: delivery.providerName, type: delivery.providerType },
      ).idempotency;
      if (
        idempotency &&
        capabilities.supported &&
        (idempotency.expiresAt === undefined ||
          idempotency.expiresAt > (await this.store.now()))
      ) {
        return {
          allowed: true,
          mode: 'safe',
          reason: 'The Provider can retry with the original deliveryId.',
        };
      }
      return {
        allowed: true,
        mode: 'duplicate_risk_confirmation_required',
        reason:
          'The Provider cannot guarantee an idempotent retry for this unknown submission.',
      };
    }
    return {
      allowed: false,
      mode: 'not_allowed',
      reason: `A Delivery in status "${delivery.status}" cannot be retried.`,
    };
  }

  private retryResolution(
    delivery: NotificationDeliveryRecord,
    decision: NotificationDeliveryRetryDecision,
    reason: string,
    requestedAt: string,
  ): NotificationRetryResolutionRecord {
    if (delivery.status === 'failed') {
      if (!decision.allowed) {
        throw new NotificationDeliveryRetryError(
          delivery.id,
          decision.reason ?? 'Notification Delivery is not retryable.',
        );
      }
      return {
        type: 'terminal_failure',
        reason,
        requestedAt,
      };
    }
    if (decision.allowed && decision.mode === 'safe') {
      return {
        type: 'safe_provider_idempotency',
        reason,
        requestedAt,
      };
    }
    return {
      type: 'duplicate_risk_accepted',
      reason,
      requestedAt,
    };
  }

  private async emitStatusChanged(
    notificationId: string,
    sequence: number,
  ): Promise<void> {
    if (this.statusSubscriptions.size === 0) return;
    const snapshot = await this.getNotification(notificationId);
    if (!snapshot?.idempotencyKey) return;
    const event: NotificationStatusChangedEvent = {
      ...snapshot,
      idempotencyKey: snapshot.idempotencyKey,
    };
    for (const subscription of this.statusSubscriptions.values()) {
      if (
        subscription.filter.notificationId &&
        subscription.filter.notificationId !== event.notificationId
      )
        continue;
      if (
        subscription.filter.idempotencyKey &&
        subscription.filter.idempotencyKey !== event.idempotencyKey
      )
        continue;
      this.notifySubscription(subscription, event, sequence);
    }
  }

  private scheduleStatusChanged(notificationId: string): void {
    const sequence = this.issueStatusSequence();
    void this.emitStatusChanged(notificationId, sequence).catch(
      (error: unknown) => {
        this.options.logger.warn(
          {
            event: 'notification.status_emit_failed',
            err: error,
            notificationId,
          },
          'Failed to emit a notification status change.',
        );
      },
    );
  }

  private async emitCurrentStatus(
    subscriptionId: string,
    subscription: StatusSubscription,
    sequence: number,
  ): Promise<void> {
    const snapshot = subscription.filter.notificationId
      ? await this.getNotification(subscription.filter.notificationId)
      : await this.getByIdempotencyKey(subscription.filter.idempotencyKey!);
    if (
      !snapshot?.idempotencyKey ||
      this.statusSubscriptions.get(subscriptionId) !== subscription
    )
      return;
    this.notifySubscription(
      subscription,
      {
        ...snapshot,
        idempotencyKey: snapshot.idempotencyKey,
      },
      sequence,
    );
  }

  private notifySubscription(
    subscription: StatusSubscription,
    event: NotificationStatusChangedEvent,
    sequence: number,
  ): void {
    if (sequence <= subscription.lastDeliveredSequence) return;
    subscription.lastDeliveredSequence = sequence;
    void Promise.resolve()
      .then(() => subscription.listener(event))
      .catch((error: unknown) => {
        this.options.logger.warn(
          {
            event: 'notification.status_listener_failed',
            err: error,
            notificationId: event.notificationId,
          },
          'Notification status listener failed.',
        );
      });
  }

  private issueStatusSequence(): number {
    this.nextStatusSequence += 1;
    return this.nextStatusSequence;
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
    if (!routing) return this.channelManager.providerIdentities(channel);
    if (routing.strategy !== 'all') {
      if (!routing.provider)
        return this.channelManager.providerIdentities(channel);
      return [this.enabledProvider(channel, routing.provider)];
    }
    if (!routing.providers)
      return this.channelManager.providerIdentities(channel, { all: true });

    const providers = new Map<string, NotificationProviderIdentity>();
    for (const name of routing.providers) {
      const provider = this.enabledProvider(channel, name);
      providers.set(`${provider.name}\0${provider.type}`, provider);
    }
    return [...providers.values()];
  }

  private enabledProvider(
    channel: string,
    name: string,
  ): NotificationProviderIdentity {
    const providers = this.channelManager.providerIdentities(channel, {
      providerName: name,
    });
    const [provider] = providers;
    if (!provider)
      throw new Error(
        `Notification Provider "${name}" is not enabled for Channel "${channel}".`,
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
        providers.push({
          name: provider.name,
          type: provider.type,
          capabilities: provider.capabilities ??
            providerDefinition.capabilities ?? {
              idempotency: { supported: false },
            },
          send: (input) => provider.send(input),
          close: provider.close ? () => provider.close!() : undefined,
        });
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

function unsupportedRecipient(
  channel: string,
  provider: NotificationProviderIdentity,
  recipient: NotificationRecipient | undefined,
): ExpandedRecipientTarget {
  return {
    channel,
    provider,
    recipient: recipient ?? {},
    error: {
      code: 'RECIPIENT_UNSUPPORTED',
      category: 'recipient',
      message:
        recipient === undefined
          ? `Notification Channel "${channel}" requires a recipient.`
          : `Notification Channel "${channel}" does not support recipient type "${recipient.type}".`,
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

import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseLogger } from '@nocobase/logger';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { Hono } from 'hono';
import { Job } from '@nocobase/queue';
import {
  createDatabaseNotificationStore,
  createMemoryNotificationStore,
  type NotificationChannel,
  type NotificationStore,
} from './domain.js';
import { createLivePublishingNotificationStore, type NotificationLiveTarget } from './live.js';

export * from './domain.js';
export type { InboxLiveEventType, NotificationLiveTarget } from './live.js';

export type NotificationHealthStatus = 'ok' | 'degraded' | 'unavailable';

export interface NotificationCloseOptions {
  readonly deadlineAt: number;
}

export interface NotificationCloseResult {
  readonly status: 'closed';
  readonly errors: readonly string[];
}

export interface NotificationHealth {
  readonly status: NotificationHealthStatus;
  readonly persistence: 'database' | 'memory';
  readonly queue: NotificationHealthStatus;
  readonly started: boolean;
  readonly closed: boolean;
}

export interface NotificationService {
  readonly store: NotificationStore;
  trigger(input: NotificationTriggerInput): Promise<NotificationTriggerResult>;
}

export interface NotificationTriggerInput {
  readonly principalService: string;
  readonly source: { readonly type: string; readonly referenceId?: string };
  readonly targets: readonly { readonly userId: string; readonly channels: readonly ['in-app'] }[];
  readonly content: { readonly title: string; readonly body: string; readonly actionUrl?: string };
}

export interface NotificationTriggerResult {
  readonly notificationId: string;
  readonly status: 'queued';
  readonly deliveries: readonly { readonly id: string; readonly channel: NotificationChannel; readonly status: 'queued' }[];
}

export interface NotificationModule {
  readonly service: NotificationService;
  readonly router: Hono;
  health(): Promise<NotificationHealth>;
  start(): Promise<void>;
  close(options: NotificationCloseOptions): Promise<NotificationCloseResult>;
}

export interface CreateNotificationModuleOptions {
  readonly database?: DatabaseManager;
  readonly queueManager: NocoBaseQueueManager;
  readonly logger: NocoBaseLogger;
  readonly allowNonPersistentStore?: boolean;
  readonly live?: NotificationLiveTarget;
}

export interface NotificationModuleConfig {
  readonly enabled?: boolean;
  readonly allowNonPersistentStore?: boolean;
}

export class NotificationModuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationModuleError';
  }
}

export function createNotificationModule(options: CreateNotificationModuleOptions): NotificationModule {
  if (!options.database && !options.allowNonPersistentStore) {
    throw new NotificationModuleError(
      'NOTIFICATION_PERSISTENT_STORE_REQUIRED',
      'A DatabaseManager is required unless non-persistent development use is explicit.',
    );
  }

  const router = createNotificationRouter();
  const baseStore = options.database
      ? createDatabaseNotificationStore(options.database)
      : createMemoryNotificationStore();
  const store = options.live
    ? createLivePublishingNotificationStore(baseStore, options.live, options.logger)
    : baseStore;
  let service: NotificationService;
  class NotificationDeliveryJob extends Job<{ deliveryId: string }> {
    static options = { name: 'NotificationDelivery', queue: 'default' };
    async execute(): Promise<void> {
      await dispatchNotificationDelivery(store, this.payload.deliveryId);
    }
  }
  service = {
    store,
    async trigger(input: NotificationTriggerInput): Promise<NotificationTriggerResult> {
      validateTrigger(input);
      const now = new Date().toISOString();
      const notificationId = randomUUID();
      const deliveries = input.targets.map((target) => ({
        id: randomUUID(), notificationId, channel: 'in-app' as const, recipientKey: `user:${target.userId}`,
        recipientSnapshot: { kind: 'user', userId: target.userId }, recipientSchemaVersion: 1,
        contentSnapshot: { title: input.content.title, body: input.content.body, actionUrl: input.content.actionUrl }, contentSchemaVersion: 1,
        providerChainSnapshot: ['in-app-db'], providerChainSchemaVersion: 1, providerCursor: 0, currentAttempt: 0,
        status: 'queued' as const, statusChangedAt: now, version: 1, createdAt: now, updatedAt: now,
      }));
      const items = deliveries.map((delivery, index) => ({
        id: randomUUID(), deliveryId: delivery.id, notificationId, userId: input.targets[index].userId, channel: 'in-app' as const,
        createdAt: now, updatedAt: now, version: 1,
      }));
      await store.createNotificationBundle({
        notification: { id: notificationId, sourceType: input.source.type, sourceReferenceId: input.source.referenceId,
          principalService: input.principalService, triggeredAt: now, messageMode: 'direct', summaryStatus: 'queued', version: 1, createdAt: now, updatedAt: now },
        deliveries, userNotificationItems: items,
      });
      for (const delivery of deliveries) await options.queueManager.dispatch(NotificationDeliveryJob, { deliveryId: delivery.id });
      return { notificationId, status: 'queued', deliveries: deliveries.map(({ id, channel }) => ({ id, channel, status: 'queued' as const })) };
    },
  };
  let started = false;
  let closed = false;
  let queueStatus: NotificationHealthStatus = 'degraded';
  let startPromise: Promise<void> | undefined;
  let closePromise: Promise<NotificationCloseResult> | undefined;

  return {
    service,
    router,
    async health(): Promise<NotificationHealth> {
      return {
        status: queueStatus,
        persistence: options.database ? 'database' : 'memory',
        queue: queueStatus,
        started,
        closed,
      };
    },
    start(): Promise<void> {
      if (closed) {
        return Promise.reject(
          new NotificationModuleError('NOTIFICATION_MODULE_CLOSED', 'The notification module is already closed.'),
        );
      }

      startPromise ??= options.queueManager.init().then(() => {
        started = true;
        queueStatus = 'ok';
        options.logger.info({ module: 'notification' }, 'Notification module started');
      });
      return startPromise;
    },
    close(_closeOptions: NotificationCloseOptions): Promise<NotificationCloseResult> {
      closePromise ??= Promise.resolve(startPromise)
        .catch(() => undefined)
        .then(() => {
        closed = true;
        options.logger.info({ module: 'notification' }, 'Notification module closed');
        return { status: 'closed' as const, errors: [] };
      });
      return closePromise;
    },
  };
}

export async function dispatchNotificationDelivery(store: NotificationStore, deliveryId: string): Promise<void> {
  const delivery = await store.getDelivery(deliveryId);
  if (!delivery || delivery.status !== 'queued') return;
  const now = new Date().toISOString();
  const sending = await store.claimDelivery({ deliveryId, expectedVersion: delivery.version, leaseToken: randomUUID(), leaseOwner: 'notification-worker', leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(), claimedAt: now,
    attempt: { id: randomUUID(), deliveryId, attemptSequence: delivery.currentAttempt + 1, providerInstance: 'in-app-db', providerType: 'in-app', status: 'sending', startedAt: now, invocationStartedAt: now, metadataSchemaVersion: 1, createdAt: now, updatedAt: now },
    event: { id: randomUUID(), deliveryId, sequence: 1, fromStatus: 'queued', toStatus: 'sending', occurredAt: now, metadataSchemaVersion: 1 }, });
  if (!sending) return;
  await store.transitionDelivery({ deliveryId, expectedVersion: sending.version, fromStatus: 'sending', toStatus: 'delivered', statusChangedAt: new Date().toISOString(), leaseToken: sending.leaseToken,
    event: { id: randomUUID(), deliveryId, sequence: 2, fromStatus: 'sending', toStatus: 'delivered', occurredAt: new Date().toISOString(), metadataSchemaVersion: 1 }, });
}

function validateTrigger(input: NotificationTriggerInput): void {
  if (!input.principalService || !input.source.type || input.targets.length === 0 || input.targets.length > 1000) throw new NotificationModuleError('NOTIFICATION_TRIGGER_INVALID', 'Trigger requires a service, source, and 1-1000 targets.');
  if (!input.content.title || !input.content.body || input.content.title.length > 200 || input.content.body.length > 10_000) throw new NotificationModuleError('NOTIFICATION_CONTENT_INVALID', 'In-app title and body are required and bounded.');
  const seen = new Set<string>();
  for (const target of input.targets) {
    if (!target.userId || target.channels.length !== 1 || target.channels[0] !== 'in-app' || seen.has(target.userId)) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', 'Targets must contain unique explicit user IDs and the in-app channel.');
    seen.add(target.userId);
  }
  if (input.content.actionUrl && (!input.content.actionUrl.startsWith('/') || input.content.actionUrl.startsWith('//'))) throw new NotificationModuleError('NOTIFICATION_ACTION_URL_INVALID', 'In-app actionUrl must be a relative Portal path.');
}

function createNotificationRouter(): Hono {
  const router = new Hono();

  router.post('/trigger', (context) =>
    context.json(
      {
        error: {
          code: 'HTTP_TRIGGER_DISABLED',
          message: 'HTTP notification triggering is disabled.',
          requestId: context.req.header('x-request-id') ?? randomUUID(),
        },
      },
      403,
    ),
  );

  return router;
}

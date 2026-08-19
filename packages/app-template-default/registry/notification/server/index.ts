import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseLogger } from '@nocobase/logger';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { Hono } from 'hono';
import { Job } from '@nocobase/queue';
import type { EmailProviderRegistry } from '../providers/index.js';
import {
  createDatabaseNotificationStore,
  createMemoryNotificationStore,
  type DeliveryRecord,
  type NotificationChannel,
  type NotificationStore,
} from './domain.js';
import { dispatchEmailDelivery } from './email-dispatcher.js';
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
  readonly targets: readonly NotificationTarget[];
  readonly content: NotificationDirectContent;
}

export type NotificationTarget =
  | { readonly kind?: 'user'; readonly userId: string; readonly channels: readonly NotificationChannel[] }
  | { readonly kind: 'email'; readonly address: string };

export interface NotificationDirectContent {
  readonly title?: string;
  readonly body?: string;
  readonly actionUrl?: string;
  readonly email?: { readonly subject: string; readonly text: string; readonly html?: string };
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
  readonly emailProviders?: EmailProviderRegistry;
  readonly resolveUserEmail?: (userId: string) => Promise<string | undefined>;
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
      const delivery = await store.getDelivery(this.payload.deliveryId);
      if (delivery?.channel === 'email' && options.emailProviders) {
        await dispatchEmailDelivery({ store, providers: options.emailProviders, deliveryId: delivery.id, workerId: 'notification-worker' });
        return;
      }
      await dispatchNotificationDelivery(store, this.payload.deliveryId);
    }
  }
  service = {
    store,
    async trigger(input: NotificationTriggerInput): Promise<NotificationTriggerResult> {
      validateTrigger(input);
      const now = new Date().toISOString();
      const notificationId = randomUUID();
      const expanded = await expandTargets(input, options, notificationId, now);
      const deliveries = expanded.map((item) => item.delivery);
      const items = expanded.flatMap((item) => item.userId ? [{ id: randomUUID(), deliveryId: item.delivery.id, notificationId, userId: item.userId, channel: item.delivery.channel, createdAt: now, updatedAt: now, version: 1 }] : []);
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
  const seen = new Set<string>();
  for (const target of input.targets) {
    if (target.kind === 'email') {
      const address = normalizeEmail(target.address);
      if (!address || seen.has(`email:${address}`)) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', 'Direct Email targets must contain unique valid addresses.');
      seen.add(`email:${address}`);
      validateEmailContent(input.content);
      continue;
    }
    if (!target.userId || target.channels.length === 0 || new Set(target.channels).size !== target.channels.length) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', 'User targets require an explicit user ID and unique channels.');
    for (const channel of target.channels) {
      const key = `user:${target.userId}:${channel}`;
      if ((channel !== 'in-app' && channel !== 'email') || seen.has(key)) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', 'Expanded user targets must be unique.');
      seen.add(key);
      if (channel === 'email') validateEmailContent(input.content);
    }
    if (target.channels.includes('in-app') && (!input.content.title || !input.content.body || input.content.title.length > 200 || input.content.body.length > 10_000)) throw new NotificationModuleError('NOTIFICATION_CONTENT_INVALID', 'In-app title and body are required and bounded.');
  }
  if (input.content.actionUrl && (!input.content.actionUrl.startsWith('/') || input.content.actionUrl.startsWith('//'))) throw new NotificationModuleError('NOTIFICATION_ACTION_URL_INVALID', 'In-app actionUrl must be a relative Portal path.');
}

interface ExpandedTarget {
  readonly delivery: DeliveryRecord;
  readonly userId?: string;
}

async function expandTargets(input: NotificationTriggerInput, options: CreateNotificationModuleOptions, notificationId: string, now: string): Promise<readonly ExpandedTarget[]> {
  const expanded: ExpandedTarget[] = [];
  const emailRecipients = new Set<string>();
  const emailProviderChain = options.emailProviders?.list().filter((instance) => instance.enabled).map((instance) => instance.id) ?? [];
  for (const target of input.targets) {
    if (target.kind === 'email') {
      const address = normalizeEmail(target.address)!;
      if (emailRecipients.has(address)) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', 'Expanded Email recipients must be unique.');
      emailRecipients.add(address);
      expanded.push({ delivery: createEmailDelivery(notificationId, address, input.content, emailProviderChain, now) });
      continue;
    }
    for (const channel of target.channels) {
      if (channel === 'in-app') {
        expanded.push({ userId: target.userId, delivery: createInAppDelivery(notificationId, target.userId, input.content, now) });
        continue;
      }
      const email = await options.resolveUserEmail?.(target.userId);
      const normalized = normalizeEmail(email ?? '');
      if (!normalized) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', `No valid Email address is available for user "${target.userId}".`);
      if (emailRecipients.has(normalized)) throw new NotificationModuleError('NOTIFICATION_RECIPIENT_INVALID', 'Expanded Email recipients must be unique.');
      emailRecipients.add(normalized);
      expanded.push({ userId: target.userId, delivery: createEmailDelivery(notificationId, normalized, input.content, emailProviderChain, now, target.userId) });
    }
  }
  if (expanded.some((item) => item.delivery.channel === 'email') && emailProviderChain.length === 0) throw new NotificationModuleError('NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE', 'No enabled Email provider is configured.');
  if (expanded.length > 2000) throw new NotificationModuleError('NOTIFICATION_TRIGGER_INVALID', 'A trigger may expand to at most 2000 deliveries.');
  return expanded;
}

function createInAppDelivery(notificationId: string, userId: string, content: NotificationDirectContent, now: string): DeliveryRecord {
  return { id: randomUUID(), notificationId, channel: 'in-app', recipientKey: `user:${userId}`, recipientSnapshot: { kind: 'user', userId }, recipientSchemaVersion: 1, contentSnapshot: { title: content.title, body: content.body, actionUrl: content.actionUrl }, contentSchemaVersion: 1, providerChainSnapshot: ['in-app-db'], providerChainSchemaVersion: 1, providerCursor: 0, currentAttempt: 0, status: 'queued', statusChangedAt: now, version: 1, createdAt: now, updatedAt: now };
}

function createEmailDelivery(notificationId: string, address: string, content: NotificationDirectContent, providerChainSnapshot: readonly string[], now: string, userId?: string): DeliveryRecord {
  const id = randomUUID();
  return { id, notificationId, channel: 'email', recipientKey: userId ? `user:${userId}` : `email:${address}`, recipientSnapshot: userId ? { kind: 'user', userId, email: address } : { kind: 'email', email: address }, recipientSchemaVersion: 1, contentSnapshot: { ...content.email, messageId: `<${id}@notification.local>` }, contentSchemaVersion: 1, providerChainSnapshot, providerChainSchemaVersion: 1, providerCursor: 0, currentAttempt: 0, status: 'queued', statusChangedAt: now, version: 1, createdAt: now, updatedAt: now };
}

function validateEmailContent(content: NotificationDirectContent): void {
  if (!content.email?.subject || !content.email.text || /[\r\n]/.test(content.email.subject) || content.email.subject.length > 998 || content.email.text.length > 100_000 || (content.email.html?.length ?? 0) > 1_048_576) throw new NotificationModuleError('NOTIFICATION_CONTENT_INVALID', 'Email subject and text are required and bounded.');
}

function normalizeEmail(address: string): string | undefined {
  const normalized = address.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined;
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

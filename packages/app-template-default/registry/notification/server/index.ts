import { randomUUID } from "node:crypto";

import type { DatabaseManager } from "@nocobase/database";
import type { Logger } from "@nocobase/logging";
import type { NocoBaseQueueManager } from "@nocobase/queue";
import { Hono } from "hono";
import { Job } from "@nocobase/queue";
import type { EmailProviderRegistry } from "../providers/index.js";
import type { EmailProviderDefinition } from "../config/providers.js";
import type {
  NotificationTemplateRegistry,
  RenderedNotificationTemplate,
} from "../templates/index.js";
import {
  createDatabaseNotificationStore,
  createMemoryNotificationStore,
  type DeliveryRecord,
  type NotificationChannel,
  type NotificationStore,
} from "./domain.js";
import { dispatchEmailDelivery } from "./email-dispatcher.js";
import {
  createLivePublishingNotificationStore,
  type NotificationLiveTarget,
} from "./live.js";
import { createNotificationAdminRouter } from "./admin.js";
import { createNotificationInboxRouter } from "./inbox.js";
import { reconcileNotificationDeliveries } from "./reconciler.js";
import { notificationRoutePaths } from "./http-contracts.js";

export * from "./domain.js";
export * from "./queries.js";
export * from "./reconciler.js";
export * from "./http-contracts.js";
export type { InboxItemDto, InboxListDto } from "./inbox.js";
export type { ProviderConnectionTestDto, ProviderSummaryDto } from "./admin.js";
export type { InboxLiveEventType, NotificationLiveTarget } from "./live.js";

export type NotificationHealthStatus = "ok" | "degraded" | "unavailable";

export interface NotificationCloseOptions {
  readonly deadlineAt: number;
}

export interface NotificationCloseResult {
  readonly status: "closed";
  readonly errors: readonly string[];
}

export interface NotificationHealth {
  readonly status: NotificationHealthStatus;
  readonly persistence: "database" | "memory";
  readonly queue: NotificationHealthStatus;
  readonly started: boolean;
  readonly closed: boolean;
}

export interface NotificationService {
  readonly store: NotificationStore;
  trigger(
    principal: NotificationSystemPrincipal,
    input: NotificationTriggerInput,
  ): Promise<NotificationTriggerResult>;
}

export interface NotificationSystemPrincipal {
  readonly kind: "service";
  readonly serviceId: string;
}

export interface NotificationTriggerInput {
  readonly source: { readonly type: string; readonly referenceId?: string };
  readonly targets: readonly NotificationTarget[];
  readonly message: NotificationMessageInput;
}

export type NotificationMessageInput =
  | { readonly kind: "content"; readonly content: NotificationDirectContent }
  | {
      readonly kind: "template";
      readonly templateKey: string;
      readonly variables?: Record<string, unknown>;
    };

export type NotificationTarget =
  | {
      readonly kind?: "user";
      readonly userId: string;
      readonly channels: readonly NotificationChannel[];
      readonly variables?: Record<string, unknown>;
    }
  | {
      readonly kind: "email";
      readonly address: string;
      readonly variables?: Record<string, unknown>;
    };

export interface NotificationDirectContent {
  readonly title?: string;
  readonly body?: string;
  readonly actionUrl?: string;
  readonly email?: {
    readonly subject: string;
    readonly text: string;
    readonly html?: string;
  };
}

export interface NotificationTriggerResult {
  readonly notificationId: string;
  readonly status: "queued";
  readonly deliveries: readonly {
    readonly id: string;
    readonly channel: NotificationChannel;
    readonly status: "queued";
  }[];
}

export interface NotificationModule {
  readonly service: NotificationService;
  readonly router: Hono;
  health(): Promise<NotificationHealth>;
  start(): Promise<void>;
  beginShutdown(): void;
  close(options: NotificationCloseOptions): Promise<NotificationCloseResult>;
}

export interface CreateNotificationModuleOptions {
  readonly database?: DatabaseManager;
  readonly queueManager: NocoBaseQueueManager;
  readonly logger: Logger;
  readonly allowNonPersistentStore?: boolean;
  readonly live?: NotificationLiveTarget;
  readonly emailProviders?: EmailProviderRegistry;
  readonly emailProviderDefinitions?: readonly EmailProviderDefinition[];
  readonly resolveUserEmail?: (userId: string) => Promise<string | undefined>;
  readonly templates?: NotificationTemplateRegistry;
  readonly reconcileIntervalMs?: number;
  readonly reconcileBatchSize?: number;
}

export interface NotificationModuleConfig {
  readonly enabled?: boolean;
  readonly allowNonPersistentStore?: boolean;
  readonly emailProviders?: EmailProviderRegistry;
  readonly emailProviderDefinitions?: readonly EmailProviderDefinition[];
  readonly resolveUserEmail?: (userId: string) => Promise<string | undefined>;
  readonly templates?: NotificationTemplateRegistry;
}

export class NotificationModuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotificationModuleError";
  }
}

const maxCommonVariableBytes = 64 * 1024;
const maxRecipientVariableBytes = 16 * 1024;

export function createNotificationModule(
  options: CreateNotificationModuleOptions,
): NotificationModule {
  if (!options.database && !options.allowNonPersistentStore) {
    throw new NotificationModuleError(
      "NOTIFICATION_PERSISTENT_STORE_REQUIRED",
      "A DatabaseManager is required unless non-persistent development use is explicit.",
    );
  }

  const baseStore = options.database
    ? createDatabaseNotificationStore(options.database)
    : createMemoryNotificationStore();
  const store = options.live
    ? createLivePublishingNotificationStore(
        baseStore,
        options.live,
        options.logger,
      )
    : baseStore;
  const router = createNotificationRouter(store);
  class NotificationDeliveryJob extends Job<{ deliveryId: string }> {
    static options = { name: "NotificationDelivery", queue: "default" };
    async execute(): Promise<void> {
      const delivery = await store.getDelivery(this.payload.deliveryId);
      if (delivery?.channel === "email" && options.emailProviders) {
        await dispatchEmailDelivery({
          store,
          providers: options.emailProviders,
          deliveryId: delivery.id,
          workerId: "notification-worker",
        });
        return;
      }
      await dispatchNotificationDelivery(store, this.payload.deliveryId);
    }
  }
  const publishDeliveryWakeup = async (deliveryId: string): Promise<void> => {
    await options.queueManager.dispatch(NotificationDeliveryJob, {
      deliveryId,
    });
  };
  const dispatchDeliveryWakeup = async (deliveryId: string): Promise<void> => {
    try {
      await publishDeliveryWakeup(deliveryId);
    } catch (error) {
      options.logger.warn(
        { error, deliveryId },
        "Failed to publish a notification queue wake-up; the Reconciler will retry.",
      );
    }
  };
  router.route(
    "/admin",
    createNotificationAdminRouter({
      store,
      providers: options.emailProviders,
      providerDefinitions: options.emailProviderDefinitions,
      dispatchDelivery: dispatchDeliveryWakeup,
    }),
  );
  const service: NotificationService = {
    store,
    async trigger(
      principal: NotificationSystemPrincipal,
      input: NotificationTriggerInput,
    ): Promise<NotificationTriggerResult> {
      validateTrigger(principal, input, options);
      const now = await store.now();
      const notificationId = randomUUID();
      const expanded = await expandTargets(input, options, notificationId, now);
      const deliveries = expanded.map((item) => item.delivery);
      const statusEvents = deliveries.map((delivery) => ({
        id: randomUUID(),
        deliveryId: delivery.id,
        sequence: 1,
        toStatus: "queued" as const,
        occurredAt: now,
        actor: `service:${principal.serviceId}`,
        metadataSchemaVersion: 1,
      }));
      const items = expanded.flatMap((item) =>
        item.userId
          ? [
              {
                id: randomUUID(),
                deliveryId: item.delivery.id,
                notificationId,
                userId: item.userId,
                channel: item.delivery.channel,
                createdAt: now,
                updatedAt: now,
                version: 1,
              },
            ]
          : [],
      );
      await store.createNotificationBundle({
        notification: {
          id: notificationId,
          sourceType: input.source.type,
          sourceReferenceId: input.source.referenceId,
          principalService: principal.serviceId,
          triggeredAt: now,
          messageMode:
            input.message.kind === "template" ? "template" : "direct",
          templateName: expanded[0].template?.key,
          templateVersion: expanded[0].template?.version,
          summaryStatus: "queued",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        deliveries,
        statusEvents,
        userNotificationItems: items,
      });
      for (const delivery of deliveries)
        await dispatchDeliveryWakeup(delivery.id);
      return {
        notificationId,
        status: "queued",
        deliveries: deliveries.map(({ id, channel }) => ({
          id,
          channel,
          status: "queued" as const,
        })),
      };
    },
  };
  let started = false;
  let closed = false;
  let queueStatus: NotificationHealthStatus = "degraded";
  let startPromise: Promise<void> | undefined;
  let closePromise: Promise<NotificationCloseResult> | undefined;
  let reconcilePromise: Promise<void> | undefined;
  let reconcileTimer: ReturnType<typeof setInterval> | undefined;

  const reconcile = (): Promise<void> => {
    if (closed) return Promise.resolve();
    reconcilePromise ??= reconcileNotificationDeliveries({
      store,
      dispatchDelivery: publishDeliveryWakeup,
      batchSize: options.reconcileBatchSize,
    })
      .then((result) => {
        if (result.dispatchFailures > 0)
          options.logger.warn(
            { module: "notification", ...result },
            "Notification reconciliation completed with queue wake-up failures.",
          );
      })
      .catch((error) =>
        options.logger.warn(
          { error, module: "notification" },
          "Notification reconciliation failed; persisted Delivery state is unchanged.",
        ),
      )
      .finally(() => {
        reconcilePromise = undefined;
      });
    return reconcilePromise;
  };

  const beginShutdown = (): void => {
    if (closed) return;
    closed = true;
    if (reconcileTimer) clearInterval(reconcileTimer);
    reconcileTimer = undefined;
  };

  return {
    service,
    router,
    async health(): Promise<NotificationHealth> {
      return {
        status: queueStatus,
        persistence: options.database ? "database" : "memory",
        queue: queueStatus,
        started,
        closed,
      };
    },
    start(): Promise<void> {
      if (closed) {
        return Promise.reject(
          new NotificationModuleError(
            "NOTIFICATION_MODULE_CLOSED",
            "The notification module is already closed.",
          ),
        );
      }

      startPromise ??= options.queueManager.init().then(async () => {
        started = true;
        queueStatus = "ok";
        await reconcile();
        if (!closed) {
          reconcileTimer = setInterval(() => {
            void reconcile();
          }, options.reconcileIntervalMs ?? 10_000);
          reconcileTimer.unref?.();
        }
        options.logger.info(
          { module: "notification" },
          "Notification module started",
        );
      });
      return startPromise;
    },
    beginShutdown,
    close(
      closeOptions: NotificationCloseOptions,
    ): Promise<NotificationCloseResult> {
      beginShutdown();
      closePromise ??= closeNotificationRuntime({
        startPromise,
        reconcilePromise,
        providers: options.emailProviders,
        deadlineAt: closeOptions.deadlineAt,
        logger: options.logger,
      });
      return closePromise;
    },
  };
}

interface CloseNotificationRuntimeInput {
  readonly startPromise?: Promise<void>;
  readonly reconcilePromise?: Promise<void>;
  readonly providers?: EmailProviderRegistry;
  readonly deadlineAt: number;
  readonly logger: Logger;
}

async function closeNotificationRuntime(
  input: CloseNotificationRuntimeInput,
): Promise<NotificationCloseResult> {
  const errors: string[] = [];
  await settleBeforeDeadline(
    Promise.resolve(input.startPromise).catch(() => undefined),
    input.deadlineAt,
    "startup",
    errors,
  );
  await settleBeforeDeadline(
    Promise.resolve(input.reconcilePromise).catch(() => undefined),
    input.deadlineAt,
    "reconciler",
    errors,
  );
  for (const instance of input.providers?.list() ?? []) {
    await settleBeforeDeadline(
      instance.provider.close(),
      input.deadlineAt,
      `provider:${instance.id}`,
      errors,
    );
  }
  input.logger.info(
    { module: "notification", errors },
    "Notification module closed",
  );
  return { status: "closed", errors };
}

async function settleBeforeDeadline(
  task: Promise<void>,
  deadlineAt: number,
  label: string,
  errors: string[],
): Promise<void> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    errors.push(`${label}: shutdown deadline exceeded`);
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("shutdown deadline exceeded")),
          remaining,
        );
      }),
    ]);
  } catch (error) {
    errors.push(
      `${label}: ${error instanceof Error && error.message === "shutdown deadline exceeded" ? error.message : "close failed"}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dispatchNotificationDelivery(
  store: NotificationStore,
  deliveryId: string,
): Promise<void> {
  const delivery = await store.getDelivery(deliveryId);
  if (!delivery || delivery.status !== "queued") return;
  const now = await store.now();
  const events = await store.listDeliveryStatusEvents(deliveryId);
  const sending = await store.claimDelivery({
    deliveryId,
    expectedVersion: delivery.version,
    leaseToken: randomUUID(),
    leaseOwner: "notification-worker",
    leaseExpiresAt: new Date(Date.parse(now) + 30_000).toISOString(),
    claimedAt: now,
    attempt: {
      id: randomUUID(),
      deliveryId,
      attemptSequence: delivery.currentAttempt + 1,
      providerInstance: "in-app-db",
      providerType: "in-app",
      status: "sending",
      startedAt: now,
      invocationStartedAt: now,
      metadataSchemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
    event: {
      id: randomUUID(),
      deliveryId,
      sequence: events.length + 1,
      fromStatus: "queued",
      toStatus: "sending",
      occurredAt: now,
      metadataSchemaVersion: 1,
    },
  });
  if (!sending) return;
  const deliveredAt = await store.now();
  await store.transitionDelivery({
    deliveryId,
    expectedVersion: sending.version,
    fromStatus: "sending",
    toStatus: "delivered",
    statusChangedAt: deliveredAt,
    leaseToken: sending.leaseToken,
    event: {
      id: randomUUID(),
      deliveryId,
      sequence: events.length + 2,
      fromStatus: "sending",
      toStatus: "delivered",
      occurredAt: deliveredAt,
      metadataSchemaVersion: 1,
    },
  });
}

function validateTrigger(
  principal: NotificationSystemPrincipal,
  input: NotificationTriggerInput,
  options: CreateNotificationModuleOptions,
): void {
  if (principal.kind !== "service" || !principal.serviceId) {
    throw new NotificationModuleError(
      "NOTIFICATION_PRINCIPAL_INVALID",
      "Trigger requires a Host-created service principal.",
    );
  }
  if (
    !input.source.type ||
    input.targets.length === 0 ||
    input.targets.length > 1000
  )
    throw new NotificationModuleError(
      "NOTIFICATION_TRIGGER_INVALID",
      "Trigger requires a source and 1-1000 targets.",
    );
  if (
    input.message.kind === "template" &&
    (!input.message.templateKey ||
      !options.templates?.has(input.message.templateKey))
  )
    throw new NotificationModuleError(
      "NOTIFICATION_TEMPLATE_INVALID",
      `Notification template "${input.message.templateKey}" does not exist.`,
    );
  if (input.message.kind === "template")
    validateVariableBytes(
      input.message.variables,
      maxCommonVariableBytes,
      "common",
    );
  const seen = new Set<string>();
  for (const target of input.targets) {
    validateVariableBytes(
      target.variables,
      maxRecipientVariableBytes,
      "recipient",
    );
    if (target.kind === "email") {
      const address = normalizeEmail(target.address);
      if (!address || seen.has(`email:${address}`))
        throw new NotificationModuleError(
          "NOTIFICATION_RECIPIENT_INVALID",
          "Direct Email targets must contain unique valid addresses.",
        );
      seen.add(`email:${address}`);
      if (input.message.kind === "content")
        validateEmailContent(input.message.content);
      continue;
    }
    if (
      !target.userId ||
      target.channels.length === 0 ||
      new Set(target.channels).size !== target.channels.length
    )
      throw new NotificationModuleError(
        "NOTIFICATION_RECIPIENT_INVALID",
        "User targets require an explicit user ID and unique channels.",
      );
    for (const channel of target.channels) {
      const key = `user:${target.userId}:${channel}`;
      if ((channel !== "in-app" && channel !== "email") || seen.has(key))
        throw new NotificationModuleError(
          "NOTIFICATION_RECIPIENT_INVALID",
          "Expanded user targets must be unique.",
        );
      seen.add(key);
      if (channel === "email" && input.message.kind === "content")
        validateEmailContent(input.message.content);
    }
    if (
      input.message.kind === "content" &&
      target.channels.includes("in-app") &&
      (!input.message.content.title ||
        !input.message.content.body ||
        input.message.content.title.length > 200 ||
        input.message.content.body.length > 10_000)
    )
      throw new NotificationModuleError(
        "NOTIFICATION_CONTENT_INVALID",
        "In-app title and body are required and bounded.",
      );
  }
  if (
    input.message.kind === "content" &&
    input.message.content.actionUrl &&
    (!input.message.content.actionUrl.startsWith("/") ||
      input.message.content.actionUrl.startsWith("//"))
  )
    throw new NotificationModuleError(
      "NOTIFICATION_ACTION_URL_INVALID",
      "In-app actionUrl must be a relative Portal path.",
    );
}

function validateVariableBytes(
  variables: Record<string, unknown> | undefined,
  maximumBytes: number,
  scope: "common" | "recipient",
): void {
  if (!variables) return;
  try {
    const serialized = JSON.stringify(variables);
    if (
      serialized === undefined ||
      Buffer.byteLength(serialized, "utf8") > maximumBytes
    ) {
      throw new Error("too large");
    }
  } catch {
    throw new NotificationModuleError(
      "NOTIFICATION_VARIABLES_INVALID",
      `Template ${scope} variables must be JSON-serializable and at most ${maximumBytes} bytes.`,
    );
  }
}

interface TemplateSnapshotIdentity {
  readonly key: string;
  readonly version: string;
  readonly contentHash: string;
}

interface ExpandedTarget {
  readonly delivery: DeliveryRecord;
  readonly userId?: string;
  readonly template?: TemplateSnapshotIdentity;
}

async function expandTargets(
  input: NotificationTriggerInput,
  options: CreateNotificationModuleOptions,
  notificationId: string,
  now: string,
): Promise<readonly ExpandedTarget[]> {
  const expanded: ExpandedTarget[] = [];
  const emailRecipients = new Set<string>();
  const emailProviderChain =
    options.emailProviders
      ?.list()
      .filter((instance) => instance.enabled)
      .map((instance) => instance.id) ?? [];
  for (const target of input.targets) {
    if (target.kind === "email") {
      const address = normalizeEmail(target.address)!;
      if (emailRecipients.has(address))
        throw new NotificationModuleError(
          "NOTIFICATION_RECIPIENT_INVALID",
          "Expanded Email recipients must be unique.",
        );
      emailRecipients.add(address);
      const rendered = await resolveTargetContent(
        input,
        options,
        ["email"],
        { email: address },
        target.variables,
      );
      expanded.push({
        delivery: createEmailDelivery(
          notificationId,
          address,
          rendered.content,
          emailProviderChain,
          now,
          undefined,
          rendered.template,
        ),
        template: rendered.template,
      });
      continue;
    }
    let email: string | undefined;
    if (target.channels.includes("email")) {
      email = normalizeEmail(
        (await options.resolveUserEmail?.(target.userId)) ?? "",
      );
      if (!email)
        throw new NotificationModuleError(
          "NOTIFICATION_RECIPIENT_INVALID",
          `No valid Email address is available for user "${target.userId}".`,
        );
      if (emailRecipients.has(email))
        throw new NotificationModuleError(
          "NOTIFICATION_RECIPIENT_INVALID",
          "Expanded Email recipients must be unique.",
        );
      emailRecipients.add(email);
    }
    const rendered = await resolveTargetContent(
      input,
      options,
      target.channels,
      { userId: target.userId, email },
      target.variables,
    );
    for (const channel of target.channels) {
      if (channel === "in-app") {
        expanded.push({
          userId: target.userId,
          delivery: createInAppDelivery(
            notificationId,
            target.userId,
            rendered.content,
            now,
            rendered.template,
          ),
          template: rendered.template,
        });
        continue;
      }
      expanded.push({
        userId: target.userId,
        delivery: createEmailDelivery(
          notificationId,
          email!,
          rendered.content,
          emailProviderChain,
          now,
          target.userId,
          rendered.template,
        ),
        template: rendered.template,
      });
    }
  }
  if (
    expanded.some((item) => item.delivery.channel === "email") &&
    emailProviderChain.length === 0
  )
    throw new NotificationModuleError(
      "NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE",
      "No enabled Email provider is configured.",
    );
  if (expanded.length > 2000)
    throw new NotificationModuleError(
      "NOTIFICATION_TRIGGER_INVALID",
      "A trigger may expand to at most 2000 deliveries.",
    );
  return expanded;
}

interface ResolvedTargetContent {
  readonly content: NotificationDirectContent;
  readonly template?: TemplateSnapshotIdentity;
}

async function resolveTargetContent(
  input: NotificationTriggerInput,
  options: CreateNotificationModuleOptions,
  channels: readonly NotificationChannel[],
  identity: { readonly userId?: string; readonly email?: string },
  recipientVariables?: Record<string, unknown>,
): Promise<ResolvedTargetContent> {
  if (input.message.kind === "content")
    return { content: input.message.content };
  const rendered: RenderedNotificationTemplate =
    await options.templates!.render({
      key: input.message.templateKey,
      common: input.message.variables,
      recipient: recipientVariables,
      identity,
      channels,
    });
  return {
    content: {
      title: rendered.inApp?.title,
      body: rendered.inApp?.body,
      actionUrl: rendered.inApp?.actionUrl,
      email: rendered.email,
    },
    template: {
      key: rendered.key,
      version: rendered.version,
      contentHash: rendered.contentHash,
    },
  };
}

function templateSnapshot(
  template?: TemplateSnapshotIdentity,
): Record<string, unknown> {
  return template
    ? {
        templateKey: template.key,
        templateVersion: template.version,
        templateContentHash: template.contentHash,
      }
    : {};
}

function createInAppDelivery(
  notificationId: string,
  userId: string,
  content: NotificationDirectContent,
  now: string,
  template?: TemplateSnapshotIdentity,
): DeliveryRecord {
  return {
    id: randomUUID(),
    notificationId,
    channel: "in-app",
    recipientKey: `user:${userId}`,
    recipientSnapshot: { kind: "user", userId },
    recipientSchemaVersion: 1,
    contentSnapshot: {
      title: content.title,
      body: content.body,
      actionUrl: content.actionUrl,
      ...templateSnapshot(template),
    },
    contentSchemaVersion: 1,
    providerChainSnapshot: ["in-app-db"],
    providerChainSchemaVersion: 1,
    providerCursor: 0,
    currentAttempt: 0,
    status: "queued",
    statusChangedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createEmailDelivery(
  notificationId: string,
  address: string,
  content: NotificationDirectContent,
  providerChainSnapshot: readonly string[],
  now: string,
  userId?: string,
  template?: TemplateSnapshotIdentity,
): DeliveryRecord {
  const id = randomUUID();
  return {
    id,
    notificationId,
    channel: "email",
    recipientKey: userId ? `user:${userId}` : `email:${address}`,
    recipientSnapshot: userId
      ? { kind: "user", userId, email: address }
      : { kind: "email", email: address },
    recipientSchemaVersion: 1,
    contentSnapshot: {
      ...content.email,
      messageId: `<${id}@notification.local>`,
      ...templateSnapshot(template),
    },
    contentSchemaVersion: 1,
    providerChainSnapshot,
    providerChainSchemaVersion: 1,
    providerCursor: 0,
    currentAttempt: 0,
    status: "queued",
    statusChangedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function validateEmailContent(content: NotificationDirectContent): void {
  if (
    !content.email?.subject ||
    !content.email.text ||
    /[\r\n]/.test(content.email.subject) ||
    content.email.subject.length > 998 ||
    content.email.text.length > 100_000 ||
    (content.email.html?.length ?? 0) > 1_048_576
  )
    throw new NotificationModuleError(
      "NOTIFICATION_CONTENT_INVALID",
      "Email subject and text are required and bounded.",
    );
}

function normalizeEmail(address: string): string | undefined {
  const normalized = address.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined;
}

function createNotificationRouter(store: NotificationStore): Hono {
  const router = new Hono();

  router.route(
    notificationRoutePaths.inbox,
    createNotificationInboxRouter({ store }),
  );

  router.post(notificationRoutePaths.trigger, (context) =>
    context.json(
      {
        error: {
          code: "HTTP_TRIGGER_DISABLED",
          message: "HTTP notification triggering is disabled.",
          requestId: context.req.header("x-request-id") ?? randomUUID(),
        },
      },
      403,
    ),
  );

  return router;
}

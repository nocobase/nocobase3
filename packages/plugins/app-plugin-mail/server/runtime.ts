import { createHash, randomUUID } from 'node:crypto';

import type {
  NocoBaseQueueManager,
  NocoBaseQueueWorker,
} from '@nocobase/queue';

import SyncMailboxJob, {
  registerMailSyncJobHandler,
} from './jobs/sync-mailbox.js';
import SendScheduledMailJob, {
  registerMailScheduledSendJobHandler,
} from './jobs/send-scheduled-mail.js';
import { SendMailOperation } from './operations/send-mail.js';
import { SyncMailboxOperation } from './operations/sync-mailbox.js';
import type { MailOutboxPublisher } from './service.js';
import type {
  MailProviderAdapterResolver,
  MailScheduledSendTaskPayload,
  MailStore,
  MailSyncMailboxTaskPayload,
  MailOutboundAttachmentStorage,
} from './types.js';

export interface MailRuntimeLogger {
  info?(data: object, message: string): void;
  error?(data: object, message: string): void;
}

export interface MailRuntimeOptions {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly queue: NocoBaseQueueManager;
  readonly queueName: string;
  readonly logger?: MailRuntimeLogger;
  readonly relayIntervalMs?: number;
  readonly automaticSyncIntervalMs?: number;
  readonly outboundAttachments?: MailOutboundAttachmentStorage;
  readonly pushWebhookUrl?: string;
  readonly pushWebhookSecret?: string;
}

export class MailRuntime implements MailOutboxPublisher {
  private readonly operation: SyncMailboxOperation;
  private readonly handler: (
    payload: MailSyncMailboxTaskPayload,
  ) => Promise<void>;
  private readonly unregisterHandler: () => void;
  private readonly unregisterScheduledSendHandler: () => void;
  private worker?: NocoBaseQueueWorker;
  private workerLoop?: Promise<void>;
  private relayTimer?: NodeJS.Timeout;
  private automaticSyncTimer?: NodeJS.Timeout;
  private publishPromise?: Promise<void>;
  private automaticSyncPromise?: Promise<void>;
  private closed = false;

  public constructor(private readonly options: MailRuntimeOptions) {
    this.operation = new SyncMailboxOperation(options);
    this.handler = (payload): Promise<void> => this.operation.execute(payload);
    this.unregisterHandler = registerMailSyncJobHandler(
      options.queueName,
      this.handler,
    );
    const send = new SendMailOperation(options);
    this.unregisterScheduledSendHandler = registerMailScheduledSendJobHandler(
      options.queueName,
      async (payload: MailScheduledSendTaskPayload): Promise<void> => {
        const scheduled = await options.store.getScheduledSubmission(
          payload.submissionId,
        );
        if (!scheduled || scheduled.submission.status !== 'pending') return;
        try {
          const result = await send.execute(
            { actorId: scheduled.actorId },
            scheduled.input,
            { scheduledDelivery: true },
          );
          if (result.status !== 'pending') {
            await options.store.clearScheduledSubmission(payload.submissionId);
          }
        } catch (error) {
          await options.store.failScheduledSubmission(payload.submissionId, {
            code: 'MAIL_SCHEDULED_SEND_FAILED',
            message:
              error instanceof Error
                ? error.message
                : 'The scheduled message could not be sent.',
            category: 'content',
            retryable: false,
          });
        }
      },
    );
    options.queue.registerJob(SyncMailboxJob);
    options.queue.registerJob(SendScheduledMailJob);
  }

  public start(): void {
    if (this.relayTimer || this.closed) return;
    this.worker = this.options.queue.createWorker({
      queues: [this.options.queueName],
    });
    this.workerLoop = this.worker
      .start([this.options.queueName])
      .catch((error: unknown): void => {
        this.options.logger?.error?.(
          { error },
          'Mail Queue worker stopped unexpectedly.',
        );
      });
    this.relayTimer = setInterval(
      () => this.kick(),
      this.options.relayIntervalMs ?? 1_000,
    );
    this.relayTimer.unref();
    this.automaticSyncTimer = setInterval(
      () => this.scheduleAutomaticSync(),
      this.options.automaticSyncIntervalMs ?? 300_000,
    );
    this.automaticSyncTimer.unref();
    this.kick();
    this.scheduleAutomaticSync();
  }

  public scheduleAutomaticSync(): void {
    if (this.closed || this.automaticSyncPromise) return;
    this.automaticSyncPromise = this.createAutomaticSyncRuns()
      .then(() => undefined)
      .catch((error: unknown): void => {
        this.options.logger?.error?.(
          { error },
          'Automatic Mail synchronization sweep failed.',
        );
      })
      .finally((): void => {
        this.automaticSyncPromise = undefined;
      });
  }

  public async createAutomaticSyncRuns(): Promise<number> {
    let created = 0;
    await this.options.outboundAttachments?.cleanupExpired?.(
      new Date().toISOString(),
    );
    const accounts = await this.options.store.listAllAccounts();
    for (const account of accounts) {
      if (account.status !== 'active') continue;
      try {
        await this.maintainPushSubscription(account);
      } catch (error) {
        this.options.logger?.error?.(
          { accountId: account.id, error },
          'Mail push subscription maintenance failed.',
        );
      }
      try {
        if (await this.createSyncRun(account.id)) created += 1;
      } catch (error) {
        this.options.logger?.error?.(
          { accountId: account.id, error },
          'Automatic Mail synchronization could not be scheduled.',
        );
      }
    }
    if (created > 0) this.kick();
    return created;
  }

  public async schedulePushSync(accountId: string): Promise<boolean> {
    if (this.closed) return false;
    const account = await this.options.store.getAccount(accountId);
    if (!account || account.status !== 'active') return false;
    const requestToken = randomUUID();
    await this.options.store.markPushSyncPending(
      accountId,
      account.userId,
      requestToken,
    );
    const created = await this.createSyncRun(accountId);
    if (created) {
      await this.options.store.clearPushSyncPending(accountId, requestToken);
      this.kick();
    }
    return created;
  }

  public async schedulePushSyncBatch(
    accounts: readonly import('./types.js').MailAccount[],
  ): Promise<void> {
    if (this.closed || accounts.length === 0) return;
    const requestToken = randomUUID();
    await this.options.store.markPushSyncPendingBatch(
      accounts.map((account) => ({
        accountId: account.id,
        requestedBy: account.userId,
      })),
      requestToken,
    );
    queueMicrotask(() => {
      void this.activatePushSyncBatch(accounts, requestToken);
    });
  }

  private async activatePushSyncBatch(
    accounts: readonly import('./types.js').MailAccount[],
    requestToken: string,
  ): Promise<void> {
    for (const account of accounts) {
      try {
        if (await this.createSyncRun(account.id)) {
          await this.options.store.clearPushSyncPending(
            account.id,
            requestToken,
          );
          this.kick();
        } else {
          const current = await this.options.store.getAccount(account.id);
          if (!current || current.status !== 'active') {
            await this.options.store.clearPushSyncPending(
              account.id,
              requestToken,
            );
          }
        }
      } catch (error) {
        this.options.logger?.error?.(
          { accountId: account.id, error },
          'Push-triggered Mail synchronization could not be activated.',
        );
      }
    }
  }

  private async createSyncRun(accountId: string): Promise<boolean> {
    const account = await this.options.store.getAccount(accountId);
    if (!account || account.status !== 'active') return false;
    if (await this.options.store.findActiveSyncRun(account.id)) return false;
    const cursor = await this.options.store.getSyncCursor(account.id);
    const id = randomUUID();
    const run = await this.options.store.createSyncRun({
      id,
      accountId: account.id,
      requestedBy: account.userId,
      mode: cursor ? 'incremental' : 'initial',
      policy: { maxMessages: 10_000, batchSize: 200 },
    });
    return run.id === id;
  }

  private async maintainPushSubscription(
    account: import('./types.js').MailAccount,
  ): Promise<void> {
    const { pushWebhookUrl, pushWebhookSecret } = this.options;
    if (!pushWebhookUrl || !pushWebhookSecret) return;
    const notificationUrl = `${pushWebhookUrl.replace(/\/$/, '')}/${encodeURIComponent(account.provider.type)}/${encodeURIComponent(account.provider.name)}/${encodeURIComponent(pushWebhookSecret)}`;
    const configurationFingerprint = createHash('sha256')
      .update(`${notificationUrl}\0${pushWebhookSecret}`)
      .digest('hex');
    const current = await this.options.store.getPushSubscription(account.id);
    if (
      current &&
      current.configurationFingerprint === configurationFingerprint &&
      Date.parse(current.renewAfter) > Date.now()
    ) {
      return;
    }
    const leaseToken = randomUUID();
    const now = new Date();
    const lease = await this.options.store.claimPushSubscriptionMaintenance(
      account,
      leaseToken,
      now.toISOString(),
      new Date(now.getTime() + 60_000).toISOString(),
    );
    if (!lease) return;
    const existing = lease.subscription;
    if (
      existing &&
      existing.configurationFingerprint === configurationFingerprint &&
      Date.parse(existing.renewAfter) > Date.now()
    ) {
      await this.options.store.releasePushSubscriptionMaintenance(
        account.id,
        leaseToken,
      );
      return;
    }
    let adapter: import('./types.js').MailProviderAdapter | undefined;
    const renewLease = (): Promise<boolean> =>
      this.options.store.renewPushSubscriptionMaintenance(
        account.id,
        leaseToken,
        new Date(Date.now() + 60_000).toISOString(),
      );
    const leaseHeartbeat = setInterval(() => {
      void renewLease().catch((error: unknown) => {
        this.options.logger?.error?.(
          { accountId: account.id, error },
          'Mail push subscription lease could not be renewed.',
        );
      });
    }, 20_000);
    leaseHeartbeat.unref();
    try {
      adapter = await this.options.adapters.resolve(account);
      if (
        !adapter.capabilities.pushNotifications ||
        adapter.pushNotificationsConfigured === false ||
        !adapter.upsertPushSubscription
      ) {
        return;
      }
      const configurationChanged =
        existing !== undefined &&
        existing.configurationFingerprint !== configurationFingerprint;
      const deletePushSubscription =
        adapter.deletePushSubscription?.bind(adapter);
      if (configurationChanged) {
        if (!deletePushSubscription) {
          this.options.logger?.error?.(
            { accountId: account.id },
            'The Provider cannot replace a stale Mail push subscription.',
          );
          return;
        }
        const removed = await deletePushSubscription(
          existing.providerSubscriptionId,
        );
        if (!removed.ok) {
          this.options.logger?.error?.(
            { accountId: account.id, error: removed.error },
            'The stale Mail push subscription could not be removed before replacement.',
          );
          return;
        }
        if (
          !(await this.options.store.markPushSubscriptionReplacementNeeded(
            account.id,
            leaseToken,
            new Date().toISOString(),
          ))
        ) {
          return;
        }
      }
      const result = await adapter.upsertPushSubscription({
        notificationUrl,
        clientState: pushWebhookSecret,
        providerSubscriptionId: configurationChanged
          ? undefined
          : existing?.providerSubscriptionId,
      });
      if (!result.ok) {
        this.options.logger?.error?.(
          { accountId: account.id, error: result.error },
          'Mail push subscription could not be renewed.',
        );
        return;
      }
      const providerSubscriptionIdChanged =
        existing !== undefined &&
        result.value.providerSubscriptionId !== existing.providerSubscriptionId;
      const createdOrReplacedSubscription =
        !existing || configurationChanged || providerSubscriptionIdChanged;
      const compensateCreatedSubscription = async (): Promise<void> => {
        if (!createdOrReplacedSubscription) return;
        const latestAccount = await this.options.store.getAccount(account.id);
        if (
          !latestAccount ||
          latestAccount.status !== 'active' ||
          providerSubscriptionIdChanged
        ) {
          await adapter?.deletePushSubscription?.(
            result.value.providerSubscriptionId,
          );
        }
      };
      if (!(await renewLease())) {
        await compensateCreatedSubscription();
        return;
      }
      const refreshedAccount = await this.options.store.getAccount(account.id);
      if (!refreshedAccount || refreshedAccount.status !== 'active') {
        await adapter.deletePushSubscription?.(
          result.value.providerSubscriptionId,
        );
        return;
      }
      const persisted = await this.options.store.savePushSubscription(
        {
          accountId: account.id,
          provider: account.provider,
          configurationFingerprint,
          ...result.value,
          updatedAt: new Date().toISOString(),
        },
        leaseToken,
      );
      if (!persisted) {
        await compensateCreatedSubscription();
        return;
      }
      if (
        existing &&
        !configurationChanged &&
        existing.providerSubscriptionId !== result.value.providerSubscriptionId
      ) {
        await adapter.deletePushSubscription?.(existing.providerSubscriptionId);
      }
    } finally {
      clearInterval(leaseHeartbeat);
      await this.options.store.releasePushSubscriptionMaintenance(
        account.id,
        leaseToken,
      );
      await adapter?.close?.();
    }
  }

  public kick(): void {
    if (this.closed || this.publishPromise) return;
    queueMicrotask(() => {
      if (this.closed || this.publishPromise) return;
      this.publishPromise = this.publishPending()
        .catch((error: unknown): void => {
          this.options.logger?.error?.({ error }, 'Mail Outbox Relay failed.');
        })
        .finally((): void => {
          this.publishPromise = undefined;
        });
    });
  }

  public async publishPending(): Promise<void> {
    const now = new Date();
    const claimed = await this.options.store.claimOutbox(
      now.toISOString(),
      randomUUID(),
      new Date(now.getTime() + 30_000).toISOString(),
      50,
    );
    for (const record of claimed) {
      try {
        if (record.type === 'syncMailbox') {
          await this.options.queue.dispatch(SyncMailboxJob, record.payload, {
            queue: this.options.queueName,
            dedup: { id: record.deduplicationKey, ttl: '1d' },
          });
        } else {
          await this.options.queue.dispatch(
            SendScheduledMailJob,
            record.payload,
            {
              queue: this.options.queueName,
              dedup: { id: record.deduplicationKey, ttl: '1d' },
            },
          );
        }
        await this.options.store.markOutboxPublished(
          record.id,
          record.leaseToken ?? '',
          new Date().toISOString(),
        );
      } catch (error) {
        const delay = Math.max(
          65_000,
          Math.min(300_000, 1_000 * 2 ** Math.min(record.attempts, 8)),
        );
        await this.options.store.releaseOutbox(
          record.id,
          record.leaseToken ?? '',
          new Date(Date.now() + delay).toISOString(),
        );
        this.options.logger?.error?.(
          { error, outboxId: record.id },
          'Mail Outbox message could not be published.',
        );
      }
    }
    if (claimed.length > 0) {
      this.options.logger?.info?.(
        { count: claimed.length },
        'Mail Outbox Relay processed messages.',
      );
    }
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.relayTimer) clearInterval(this.relayTimer);
    if (this.automaticSyncTimer) clearInterval(this.automaticSyncTimer);
    this.relayTimer = undefined;
    this.automaticSyncTimer = undefined;
    await this.publishPromise;
    await this.automaticSyncPromise;
    await this.worker?.stop();
    await this.workerLoop;
    this.unregisterHandler();
    this.unregisterScheduledSendHandler();
    this.worker = undefined;
    this.workerLoop = undefined;
  }
}

export function createMailRuntime(options: MailRuntimeOptions): MailRuntime {
  return new MailRuntime(options);
}

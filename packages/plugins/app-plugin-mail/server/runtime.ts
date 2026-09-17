import { MailBackgroundTasks } from './runtime/background-tasks.js';
import { MailOutboxRelay } from './runtime/outbox-relay.js';
import { MailPushSubscriptions } from './runtime/push-subscriptions.js';
import { MailSyncScheduler } from './operations/schedule-sync.js';
import { randomUUID } from 'node:crypto';

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
import { mailLogError, writeMailLog, type MailLogger } from './logging.js';
import { SendMailOperation } from './operations/send-mail.js';
import { SyncMailboxOperation } from './operations/sync-mailbox.js';
import {
  DEFAULT_MAIL_AUTOMATIC_SYNC_INTERVAL_MS,
  resolveMailSyncBatchSize,
} from './config.js';
import type { MailMessageChangeNotifier } from './realtime.js';
import type { MailOutboxPublisher } from './service.js';
import type {
  MailProviderAdapterResolver,
  MailCredentialVault,
} from './contracts/provider.js';
import type {
  MailScheduledSendTaskPayload,
  MailStore,
  MailSyncMailboxTaskPayload,
} from './contracts/persistence.js';
import type { MailOutboundAttachmentStorage } from '../shared/mail.js';
import type { MailRuntimeService } from './contracts/service.js';

export type MailRuntimeLogger = MailLogger;

export interface MailRuntimeOptions {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly queue: NocoBaseQueueManager;
  readonly queueName: string;
  readonly logger?: MailRuntimeLogger;
  readonly relayIntervalMs?: number;
  readonly automaticSyncIntervalMs?: number;
  readonly syncBatchSize?: number;
  readonly outboundAttachments?: MailOutboundAttachmentStorage;
  readonly credentials?: MailCredentialVault;
  readonly pushWebhookUrl?: string;
  readonly pushWebhookSecret?: string;
  readonly messageChangeNotifier?: MailMessageChangeNotifier;
}

export class MailRuntime implements MailOutboxPublisher, MailRuntimeService {
  private readonly operation: SyncMailboxOperation;
  private readonly scheduler: MailSyncScheduler;
  private readonly subscriptions: MailPushSubscriptions;
  private readonly relay: MailOutboxRelay;
  private readonly tasks = new MailBackgroundTasks();
  private closePromise?: Promise<void>;
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
    this.scheduler = new MailSyncScheduler(
      options.store,
      resolveMailSyncBatchSize(options.syncBatchSize),
    );
    this.subscriptions = new MailPushSubscriptions(options);
    this.relay = new MailOutboxRelay(options, (accountId) =>
      this.activatePushSync(accountId),
    );
    this.operation = new SyncMailboxOperation(options);
    this.handler = (payload): Promise<void> => this.operation.execute(payload);
    this.unregisterHandler = registerMailSyncJobHandler(
      options.queueName,
      this.handler,
    );
    const send = new SendMailOperation({ ...options, outbox: this });
    this.unregisterScheduledSendHandler = registerMailScheduledSendJobHandler(
      options.queueName,
      async (payload: MailScheduledSendTaskPayload): Promise<void> => {
        const scheduled = await options.store.getScheduledSubmission(
          payload.submissionId,
        );
        if (!scheduled || scheduled.submission.status !== 'pending') return;
        try {
          await send.execute({ actorId: scheduled.actorId }, scheduled.input, {
            scheduledDelivery: true,
          });
        } catch (error) {
          writeMailLog(
            options.logger,
            'error',
            {
              event: 'mail.send.scheduled_failed',
              submissionId: payload.submissionId,
              err: mailLogError(error),
            },
            'Scheduled Mail submission failed.',
          );
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
        writeMailLog(
          this.options.logger,
          'error',
          { err: mailLogError(error) },
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
      60_000,
    );
    this.automaticSyncTimer.unref();
    this.kick();
    this.scheduleAutomaticSync();
  }

  public scheduleAutomaticSync(): void {
    if (this.closed || this.automaticSyncPromise) return;
    this.automaticSyncPromise = this.tasks
      .run(async () => {
        await this.runMaintenance();
        await this.createAutomaticSyncRuns();
      }, undefined)
      .then(() => undefined)
      .catch((error: unknown): void => {
        writeMailLog(
          this.options.logger,
          'error',
          { err: mailLogError(error) },
          'Automatic Mail synchronization sweep failed.',
        );
      })
      .finally((): void => {
        this.automaticSyncPromise = undefined;
      });
  }

  public createAutomaticSyncRuns(): Promise<number> {
    return this.tasks.run(() => this.sweepAccounts(), 0);
  }

  private async sweepAccounts(): Promise<number> {
    let created = 0;
    const accounts = await this.options.store.listAllAccounts();
    for (const account of accounts) {
      if (account.status !== 'active') continue;
      try {
        await this.subscriptions.maintain(account);
      } catch (error) {
        writeMailLog(
          this.options.logger,
          'error',
          { accountId: account.id, err: mailLogError(error) },
          'Mail push subscription maintenance failed.',
        );
      }
      const lastSyncedAt = await this.options.store.getLastSyncedAt?.(
        account.id,
      );
      if (
        !isAutomaticSyncDue(lastSyncedAt, this.options.automaticSyncIntervalMs)
      ) {
        continue;
      }
      try {
        if (await this.createSyncRun(account.id)) created += 1;
      } catch (error) {
        writeMailLog(
          this.options.logger,
          'error',
          { accountId: account.id, err: mailLogError(error) },
          'Automatic Mail synchronization could not be scheduled.',
        );
      }
    }
    if (created > 0) this.kick();
    return created;
  }

  private async runMaintenance(): Promise<void> {
    const now = new Date().toISOString();
    if (await this.options.store.recoverSyncRuns(now)) this.kick();
    await this.options.outboundAttachments?.cleanupExpired?.(now);
    await this.options.store.deleteExpiredAuthorizationTransactions?.(now);
    await this.options.credentials?.deleteExpired?.(now);
    await this.options.store.deletePublishedOutboxBefore?.(
      new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(),
    );
  }

  public schedulePushSync(accountId: string): Promise<boolean> {
    return this.tasks.run(() => this.activatePushSync(accountId), false);
  }

  private async activatePushSync(accountId: string): Promise<boolean> {
    const account = await this.options.store.getAccount(accountId);
    if (!account || account.status !== 'active') return false;
    const requestToken = randomUUID();
    await this.options.store.markPushSyncPending(accountId, requestToken);
    const created = await this.createSyncRun(accountId);
    if (created) {
      await this.options.store.clearPushSyncPending(accountId, requestToken);
      this.kick();
    }
    return created;
  }

  public schedulePushSyncBatch(
    accounts: readonly import('../shared/mail.js').MailAccount[],
  ): Promise<void> {
    return this.tasks.run(async () => {
      if (accounts.length === 0) return;
      const requestToken = randomUUID();
      await this.options.store.markPushSyncPendingBatch(
        accounts.map((account) => account.id),
        requestToken,
      );
      // Persist before acknowledging the webhook; shutdown can leave pending work for recovery.
      void this.tasks.run(
        () => this.activatePushSyncBatch(accounts, requestToken),
        undefined,
      );
    }, undefined);
  }

  private async activatePushSyncBatch(
    accounts: readonly import('../shared/mail.js').MailAccount[],
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
        writeMailLog(
          this.options.logger,
          'error',
          { accountId: account.id, err: mailLogError(error) },
          'Push-triggered Mail synchronization could not be activated.',
        );
      }
    }
  }

  private async createSyncRun(accountId: string): Promise<boolean> {
    const account = await this.options.store.getAccount(accountId);
    if (!account || account.status !== 'active') return false;
    return (await this.scheduler.request(account, account.userId)).created;
  }

  public kick(): void {
    if (this.closed || this.publishPromise) return;
    queueMicrotask(() => {
      if (this.closed || this.publishPromise) return;
      this.publishPromise = this.publishPending()
        .catch((error: unknown): void => {
          writeMailLog(
            this.options.logger,
            'error',
            { err: mailLogError(error) },
            'Mail Outbox Relay failed.',
          );
        })
        .finally((): void => {
          this.publishPromise = undefined;
        });
    });
  }

  public publishPending(): Promise<void> {
    return this.tasks.run(() => this.relay.publish(), undefined);
  }

  public close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = this.shutdown();
    return this.closePromise;
  }

  private async shutdown(): Promise<void> {
    if (this.relayTimer) clearInterval(this.relayTimer);
    if (this.automaticSyncTimer) clearInterval(this.automaticSyncTimer);
    this.relayTimer = undefined;
    this.automaticSyncTimer = undefined;
    await this.tasks.close();
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

export function isAutomaticSyncDue(
  lastSyncedAt: string | undefined,
  intervalMs: number = DEFAULT_MAIL_AUTOMATIC_SYNC_INTERVAL_MS,
  now: number = Date.now(),
): boolean {
  if (!lastSyncedAt) return true;
  const last = Date.parse(lastSyncedAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= intervalMs;
}

import { randomUUID } from 'node:crypto';

import type {
  NocoBaseQueueManager,
  NocoBaseQueueWorker,
} from '@nocobase/queue';

import SyncMailboxJob, {
  registerMailSyncJobHandler,
} from './jobs/sync-mailbox.js';
import { SyncMailboxOperation } from './operations/sync-mailbox.js';
import type { MailOutboxPublisher } from './service.js';
import type {
  MailProviderAdapterResolver,
  MailStore,
  MailSyncMailboxTaskPayload,
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
}

export class MailRuntime implements MailOutboxPublisher {
  private readonly operation: SyncMailboxOperation;
  private readonly handler: (
    payload: MailSyncMailboxTaskPayload,
  ) => Promise<void>;
  private readonly unregisterHandler: () => void;
  private worker?: NocoBaseQueueWorker;
  private workerLoop?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private publishPromise?: Promise<void>;
  private closed = false;

  public constructor(private readonly options: MailRuntimeOptions) {
    this.operation = new SyncMailboxOperation(options);
    this.handler = (payload): Promise<void> => this.operation.execute(payload);
    this.unregisterHandler = registerMailSyncJobHandler(
      options.queueName,
      this.handler,
    );
    options.queue.registerJob(SyncMailboxJob);
  }

  public start(): void {
    if (this.timer || this.closed) return;
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
    this.timer = setInterval(
      () => this.kick(),
      this.options.relayIntervalMs ?? 1_000,
    );
    this.timer.unref();
    this.kick();
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
        await this.options.queue.dispatch(SyncMailboxJob, record.payload, {
          queue: this.options.queueName,
          dedup: { id: record.deduplicationKey, ttl: '1d' },
        });
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
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.publishPromise;
    await this.worker?.stop();
    await this.workerLoop;
    this.unregisterHandler();
    this.worker = undefined;
    this.workerLoop = undefined;
  }
}

export function createMailRuntime(options: MailRuntimeOptions): MailRuntime {
  return new MailRuntime(options);
}

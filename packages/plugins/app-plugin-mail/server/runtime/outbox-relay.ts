import { randomUUID } from 'node:crypto';
import SyncMailboxJob from '../jobs/sync-mailbox.js';
import SendScheduledMailJob from '../jobs/send-scheduled-mail.js';
import { mailLogError, writeMailLog } from '../logging.js';
import type { MailStore } from '../contracts/persistence.js';
import type { MailLogger } from '../logging.js';
import type { NocoBaseQueueManager } from '@nocobase/queue';

export class MailOutboxRelay {
  public constructor(
    private readonly options: {
      readonly store: Pick<
        MailStore,
        'claimOutbox' | 'markOutboxPublished' | 'releaseOutbox'
      >;
      readonly logger?: MailLogger;
      readonly queue: NocoBaseQueueManager;
      readonly queueName: string;
    },
    private readonly requestSync: (accountId: string) => Promise<boolean>,
  ) {}
  public async publish(): Promise<void> {
    const now = new Date();
    const claimed = await this.options.store.claimOutbox(
      now.toISOString(),
      randomUUID(),
      new Date(now.getTime() + 30_000).toISOString(),
      50,
    );
    for (const record of claimed) {
      try {
        if (record.type === 'requestMailboxSync') {
          await this.requestSync(record.payload.accountId);
        } else if (record.type === 'syncMailbox') {
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
        writeMailLog(
          this.options.logger,
          'error',
          { err: mailLogError(error), outboxId: record.id },
          'Mail Outbox message could not be published.',
        );
      }
    }
    if (claimed.length > 0) {
      writeMailLog(
        this.options.logger,
        'info',
        { count: claimed.length },
        'Mail Outbox Relay processed messages.',
      );
    }
  }
}

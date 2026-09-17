import { randomUUID } from 'node:crypto';
import type {
  MailAccount,
  MailStartSyncInput,
  MailSyncRun,
} from '../../shared/mail.js';
import type { MailStore } from '../contracts/persistence.js';

type SyncSchedulingStore = Pick<
  MailStore,
  'findActiveSyncRun' | 'getSyncCursor' | 'createSyncRun'
>;

/** Shared scheduling policy for user requests, automatic sweeps, and push delivery. */
export class MailSyncScheduler {
  public constructor(
    private readonly store: SyncSchedulingStore,
    private readonly batchSize: number,
  ) {}

  public async request(
    account: MailAccount,
    requestedBy: string,
    input: Pick<MailStartSyncInput, 'mode' | 'receivedAfter'> = {},
  ): Promise<{ readonly run: MailSyncRun; readonly created: boolean }> {
    if (
      input.receivedAfter !== undefined &&
      !Number.isFinite(Date.parse(input.receivedAfter))
    )
      throw new TypeError('Mail synchronization start date is invalid.');
    const active = await this.store.findActiveSyncRun(account.id);
    if (active) return { run: active, created: false };
    const cursor = await this.store.getSyncCursor(account.id);
    const mode = input.mode ?? (cursor ? 'incremental' : 'initial');
    if (mode === 'incremental' && !cursor)
      throw new Error(
        'Initial mailbox sync must complete before incremental sync.',
      );
    const id = randomUUID();
    const run = await this.store.createSyncRun({
      id,
      accountId: account.id,
      requestedBy,
      mode,
      policy: {
        receivedAfter:
          input.receivedAfter ??
          (mode === 'initial' ? account.initialSyncReceivedAfter : undefined),
        batchSize: this.batchSize,
      },
    });
    return { run, created: run.id === id };
  }
}

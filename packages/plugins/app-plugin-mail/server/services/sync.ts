import { randomUUID } from 'node:crypto';
import {
  type MailOperationContext,
  type MailOffsetPage,
  type MailStartSyncInput,
  type MailSyncRun,
  type MailSyncRunView,
} from '../types.js';
import { toSyncRunView } from '../views.js';
import { requireActiveAccount, requireOwnedAccount } from './access.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';

export class MailSyncService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      'store' | 'outbox'
    >,
    private readonly syncBatchSize: number,
  ) {}

  public async startSync(
    context: MailOperationContext,
    input: MailStartSyncInput,
  ): Promise<MailSyncRunView> {
    const account = await requireActiveAccount(
      this.dependencies.store,
      context,
      input.accountId,
    );
    if (
      input.receivedAfter !== undefined &&
      !Number.isFinite(Date.parse(input.receivedAfter))
    )
      throw new TypeError('Mail synchronization start date is invalid.');
    const active = await this.dependencies.store.findActiveSyncRun(
      input.accountId,
    );
    if (active) return toSyncRunView(active);
    const cursor = await this.dependencies.store.getSyncCursor(input.accountId);
    const mode = input.mode ?? (cursor ? 'incremental' : 'initial');
    if (mode === 'incremental' && !cursor) {
      throw new Error(
        'Initial mailbox sync must complete before incremental sync.',
      );
    }
    const run = await this.dependencies.store.createSyncRun({
      id: randomUUID(),
      accountId: input.accountId,
      requestedBy: context.actorId,
      mode,
      policy: {
        receivedAfter:
          input.receivedAfter ??
          (mode === 'initial' ? account.initialSyncReceivedAfter : undefined),
        batchSize: this.syncBatchSize,
      },
    });
    this.dependencies.outbox.kick();
    return toSyncRunView(run);
  }

  public async getSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView | undefined> {
    const run = await this.dependencies.store.getSyncRun(syncRunId);
    if (!run) return undefined;
    const account = await this.dependencies.store.getAccount(run.accountId);
    return account?.userId === context.actorId ? toSyncRunView(run) : undefined;
  }

  public async listSyncRunsPage(
    context: MailOperationContext,
    offset = 0,
    limit = 20,
  ): Promise<MailOffsetPage<MailSyncRunView>> {
    const [items, total] = await Promise.all([
      this.listSyncRuns(context, offset, limit),
      this.dependencies.store.countSyncRuns(context.actorId),
    ]);
    return { items, total };
  }

  public async listSyncRuns(
    context: MailOperationContext,
    offset = 0,
    limit = 100,
  ): Promise<readonly MailSyncRunView[]> {
    return (
      await this.dependencies.store.listSyncRuns(context.actorId, offset, limit)
    ).map(toSyncRunView);
  }

  public async retrySyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView> {
    const run = await this.requireOwnedSyncRun(context, syncRunId);
    if (!['failed', 'cancelled'].includes(run.status)) {
      throw new Error('Only failed or cancelled sync runs can be retried.');
    }
    return this.startSync(context, {
      accountId: run.accountId,
      mode: run.mode,
      receivedAfter: run.policy.receivedAfter,
    });
  }

  public async cancelSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView> {
    const run = await this.requireOwnedSyncRun(context, syncRunId);
    if (!['pending', 'running'].includes(run.status)) {
      throw new Error('Only active sync runs can be cancelled.');
    }
    const cancelled = await this.dependencies.store.cancelSyncRun(syncRunId);
    if (!cancelled) throw new Error('Mail sync run is no longer active.');
    return toSyncRunView(cancelled);
  }

  private async requireOwnedSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRun> {
    const run = await this.dependencies.store.getSyncRun(syncRunId);
    if (!run) throw new Error('Mail sync run was not found.');
    await requireOwnedAccount(this.dependencies.store, context, run.accountId);
    return run;
  }
}

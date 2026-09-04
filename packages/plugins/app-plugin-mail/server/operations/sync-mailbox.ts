import { randomUUID } from 'node:crypto';

import type {
  MailProviderAdapter,
  MailProviderAdapterResolver,
  MailProviderError,
  MailProviderResult,
  MailStore,
  MailSyncCursor,
  MailSyncMailboxTaskPayload,
  MailSyncRun,
} from '../types.js';

export interface SyncMailboxOperationDependencies {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly leaseMs?: number;
}

export class SyncMailboxOperation {
  public constructor(
    private readonly dependencies: SyncMailboxOperationDependencies,
  ) {}

  public async execute(payload: MailSyncMailboxTaskPayload): Promise<void> {
    const now = Date.now();
    const leaseToken = randomUUID();
    const run = await this.dependencies.store.claimSyncRun(
      payload.syncRunId,
      payload.expectedRevision,
      payload.expectedPhase,
      leaseToken,
      new Date(now + (this.dependencies.leaseMs ?? 60_000)).toISOString(),
    );
    if (!run) {
      const current = await this.dependencies.store.getSyncRun(
        payload.syncRunId,
      );
      if (
        (current?.status === 'pending' || current?.status === 'running') &&
        current.revision === payload.expectedRevision &&
        current.phase === payload.expectedPhase
      ) {
        throw new Error('Mail sync run is currently leased by another worker.');
      }
      return;
    }
    if (run.status === 'completed' || run.status === 'cancelled') return;

    const account = await this.dependencies.store.getAccount(run.accountId);
    if (!account || account.status !== 'active') {
      await this.dependencies.store.failSyncRun(
        run,
        terminalError(
          account ? 'MAIL_ACCOUNT_INACTIVE' : 'MAIL_ACCOUNT_NOT_FOUND',
          account
            ? 'Mail account is not active.'
            : 'Mail account was not found.',
        ),
      );
      return;
    }

    let adapter: MailProviderAdapter;
    try {
      adapter = await this.dependencies.adapters.resolve(account);
    } catch (error) {
      await this.dependencies.store.failSyncRun(
        run,
        terminalError(
          'MAIL_PROVIDER_UNAVAILABLE',
          error instanceof Error
            ? error.message
            : 'The selected mail Provider is unavailable.',
        ),
      );
      return;
    }
    try {
      await this.executeStep(run, adapter);
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.retryable) {
        await this.dependencies.store.releaseSyncRun(
          run,
          normalized,
          new Date(
            Date.now() + (normalized.retryAfterMs ?? 30_000),
          ).toISOString(),
        );
        return;
      }
      await this.dependencies.store.failSyncRun(run, normalized);
    } finally {
      await closeQuietly(adapter);
    }
  }

  private async executeStep(
    run: MailSyncRun,
    adapter: MailProviderAdapter,
  ): Promise<void> {
    if (run.phase === 'preparing') {
      await this.prepare(run, adapter);
      return;
    }
    if (run.phase === 'history') {
      await this.importHistoryPage(run, adapter);
      return;
    }
    if (run.phase === 'catchUp' || run.phase === 'incremental') {
      await this.importChangePage(run, adapter);
    }
  }

  private async prepare(
    run: MailSyncRun,
    adapter: MailProviderAdapter,
  ): Promise<void> {
    if (run.mode === 'incremental') {
      const folders = adapter.listFolders
        ? unwrap(await adapter.listFolders())
        : [];
      await this.dependencies.store.commitSyncStep({
        run,
        folders,
        messages: [],
        phase: 'incremental',
        status: 'running',
        changeCursor: await this.dependencies.store.getSyncCursor(
          run.accountId,
        ),
        createNextTask: true,
      });
      return;
    }
    if (!adapter.listMessages || !adapter.getCurrentSyncCursor) {
      throw new MailOperationError(
        terminalError(
          'MAIL_INITIAL_SYNC_NOT_SUPPORTED',
          'The selected mail Provider does not support resumable initial sync.',
        ),
      );
    }
    const baseline = unwrap(await adapter.getCurrentSyncCursor());
    const folders = adapter.listFolders
      ? unwrap(await adapter.listFolders())
      : [];
    await this.dependencies.store.commitSyncStep({
      run,
      folders,
      messages: [],
      phase: 'history',
      status: 'running',
      baselineCursor: baseline,
      createNextTask: true,
    });
  }

  private async importHistoryPage(
    run: MailSyncRun,
    adapter: MailProviderAdapter,
  ): Promise<void> {
    if (!adapter.listMessages) {
      throw new MailOperationError(
        terminalError(
          'MAIL_HISTORY_SYNC_NOT_SUPPORTED',
          'The selected mail Provider does not support history sync.',
        ),
      );
    }
    const remaining = Math.max(
      0,
      run.policy.maxMessages - run.processedMessages,
    );
    if (remaining === 0) {
      await this.completeHistory(run);
      return;
    }
    const page = unwrap(
      await adapter.listMessages({
        receivedAfter: run.policy.receivedAfter,
        cursor: run.historyCursor,
        limit: Math.min(run.policy.batchSize, remaining),
      }),
    );
    // Never discard records covered by the Provider's returned cursor. A
    // Provider may exceed its requested limit; importing the complete page can
    // exceed maxMessages slightly, but slicing it would permanently skip mail.
    const imported = page.messages;
    const hasMore =
      page.nextCursor !== undefined &&
      run.processedMessages + imported.length < run.policy.maxMessages;
    await this.dependencies.store.commitSyncStep({
      run,
      messages: imported,
      phase: hasMore ? 'history' : 'catchUp',
      status: 'running',
      historyCursor: hasMore ? page.nextCursor : undefined,
      baselineCursor: run.baselineCursor,
      changeCursor: hasMore ? undefined : run.baselineCursor,
      createNextTask: true,
    });
  }

  private async completeHistory(run: MailSyncRun): Promise<void> {
    await this.dependencies.store.commitSyncStep({
      run,
      messages: [],
      phase: 'catchUp',
      status: 'running',
      baselineCursor: run.baselineCursor,
      changeCursor: run.baselineCursor,
      createNextTask: true,
    });
  }

  private async importChangePage(
    run: MailSyncRun,
    adapter: MailProviderAdapter,
  ): Promise<void> {
    if (!adapter.listChanges) {
      throw new MailOperationError(
        terminalError(
          'MAIL_INCREMENTAL_SYNC_NOT_SUPPORTED',
          'The selected mail Provider does not support incremental sync.',
        ),
      );
    }
    const page = unwrap(
      await adapter.listChanges({
        cursor: run.changeCursor,
        limit: run.policy.batchSize,
      }),
    );
    await this.dependencies.store.commitSyncStep({
      run,
      messages: page.messages,
      deletedProviderMessageIds: page.deletedProviderMessageIds,
      phase: page.hasMore ? run.phase : 'completed',
      status: page.hasMore ? 'running' : 'completed',
      baselineCursor: run.baselineCursor,
      changeCursor: page.nextCursor,
      createNextTask: page.hasMore,
    });
  }
}

function unwrap<T>(result: MailProviderResult<T>): T {
  if (!result.ok) throw new MailOperationError(result.error);
  return result.value;
}

class MailOperationError extends Error {
  public constructor(public readonly mailError: MailProviderError) {
    super(mailError.message);
  }
}

function terminalError(code: string, message: string): MailProviderError {
  return {
    code,
    message,
    category: 'configuration',
    retryable: false,
  };
}

function normalizeError(error: unknown): MailProviderError {
  if (error instanceof MailOperationError) return error.mailError;
  return {
    code: 'MAIL_SYNC_FAILED',
    message: error instanceof Error ? error.message : 'Mailbox sync failed.',
    category: 'unknown',
    retryable: true,
  };
}

export type SyncCursor = MailSyncCursor;

async function closeQuietly(adapter: MailProviderAdapter): Promise<void> {
  try {
    await adapter.close?.();
  } catch {
    // Closing a Provider client must not replay a committed sync step.
  }
}

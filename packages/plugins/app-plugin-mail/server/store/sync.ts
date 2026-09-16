import { type DatabaseManager } from '@nocobase/db';
import { randomUUID } from 'node:crypto';
import {
  MAIL_LOCAL_DRAFT_FOLDER_ID,
  type MailCreateSyncRunInput,
  type MailProviderError,
  type MailStore,
  type MailSyncBatch,
  type MailSyncCursor,
  type MailSyncRun,
  type MailSyncStepCommit,
} from '../types.js';
import { fromSyncRunRow, toSyncRunRow } from './mappers.js';
import {
  deleteMessages,
  removeMessagesFromFolders,
  removeStaleMessageFolders,
  upsertFolders,
  upsertMessages,
} from './message-writes.js';
import {
  type AccountRow,
  type PushPendingRow,
  type SyncRunRow,
  type SyncStateRow,
} from './rows.js';
import { jsonOrNull, parseJson } from './serialization.js';
import { insertOutbox, upsertSyncState } from './sync-writes.js';

export class MailSyncStore {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly accounts: Pick<MailStore, 'getAccount' | 'listAccounts'>,
  ) {}

  public async commitSyncBatch(batch: MailSyncBatch): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await upsertFolders(connection.query, batch.accountId, batch.folders);
      await upsertMessages(connection.query, batch.accountId, batch.messages);
      await removeMessagesFromFolders(
        connection.query,
        batch.accountId,
        batch.removedFromFolders ?? [],
      );
      await deleteMessages(
        connection.query,
        batch.accountId,
        batch.deletedProviderMessageIds,
      );
      await upsertSyncState(
        connection.query,
        batch.accountId,
        batch.nextCursor,
      );
    });
  }

  public async getSyncCursor(
    accountId: string,
  ): Promise<MailSyncCursor | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SyncStateRow>('mailSyncStates')
      .selectAll()
      .where('accountId', '=', accountId)
      .executeTakeFirst<SyncStateRow>();
    return row
      ? parseJson<MailSyncCursor>(row.cursor, 'sync cursor')
      : undefined;
  }

  public async getLastSyncedAt(accountId: string): Promise<string | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SyncStateRow>('mailSyncStates')
      .select('lastSyncedAt')
      .where('accountId', '=', accountId)
      .executeTakeFirst<Pick<SyncStateRow, 'lastSyncedAt'>>();
    return row?.lastSyncedAt;
  }

  public async clearSyncCursor(accountId: string): Promise<void> {
    await this.database
      .query()
      .deleteFrom('mailSyncStates')
      .where('accountId', '=', accountId)
      .execute();
  }

  public async createSyncRun(
    input: MailCreateSyncRunInput,
  ): Promise<MailSyncRun> {
    const now = new Date().toISOString();
    const run: MailSyncRun = {
      ...input,
      phase: 'preparing',
      status: 'pending',
      revision: 0,
      processedMessages: 0,
      processedPages: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.database.transaction(async (connection): Promise<void> => {
        const account = await connection.query
          .updateTable<AccountRow>('mailAccounts')
          // This conditional update serializes sync creation with account
          // removal while keeping the account status unchanged.
          .set({ status: 'active' })
          .where('id', '=', input.accountId)
          .where('status', '=', 'active')
          .execute();
        if (account.updatedCount !== 1) {
          throw new Error('Mail account is not active.');
        }
        await connection.query
          .insertInto<SyncRunRow>('mailSyncRuns')
          .values(toSyncRunRow(run))
          .execute();
        await insertOutbox(connection.query, run, 0, now);
      });
    } catch (error) {
      const account = await this.accounts.getAccount(input.accountId);
      const active =
        account?.status === 'active'
          ? await this.findActiveSyncRun(input.accountId)
          : undefined;
      if (active) return active;
      throw error;
    }
    return run;
  }

  public async findActiveSyncRun(
    accountId: string,
  ): Promise<MailSyncRun | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SyncRunRow>('mailSyncRuns')
      .selectAll()
      .where('accountId', '=', accountId)
      .where('status', 'in', ['pending', 'running'])
      .orderBy('createdAt', 'asc')
      .executeTakeFirst<SyncRunRow>();
    return row ? fromSyncRunRow(row) : undefined;
  }

  public async getSyncRun(syncRunId: string): Promise<MailSyncRun | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SyncRunRow>('mailSyncRuns')
      .selectAll()
      .where('id', '=', syncRunId)
      .executeTakeFirst<SyncRunRow>();
    return row ? fromSyncRunRow(row) : undefined;
  }

  public async listSyncRuns(userId: string): Promise<readonly MailSyncRun[]> {
    const accounts = await this.accounts.listAccounts(userId);
    if (accounts.length === 0) return [];
    const rows = await this.database
      .query()
      .selectFrom<SyncRunRow>('mailSyncRuns')
      .selectAll()
      .where(
        'accountId',
        'in',
        accounts.map((account) => account.id),
      )
      .orderBy('createdAt', 'desc')
      .limit(100)
      .execute<SyncRunRow>();
    return rows.map(fromSyncRunRow);
  }

  public async listAllSyncRuns(): Promise<readonly MailSyncRun[]> {
    const rows = await this.database
      .query()
      .selectFrom<SyncRunRow>('mailSyncRuns')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute<SyncRunRow>();
    return rows.map(fromSyncRunRow);
  }

  public async cancelSyncRun(
    syncRunId: string,
  ): Promise<MailSyncRun | undefined> {
    const current = await this.getSyncRun(syncRunId);
    if (!current || !['pending', 'running'].includes(current.status)) {
      return undefined;
    }
    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .updateTable<SyncRunRow>('mailSyncRuns')
      .set({
        status: 'cancelled',
        activeKey: null,
        revision: current.revision + 1,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
        completedAt: now,
      })
      .where('id', '=', syncRunId)
      .where('status', 'in', ['pending', 'running'])
      .where('revision', '=', current.revision)
      .execute();
    return result.updatedCount === 1 ? this.getSyncRun(syncRunId) : undefined;
  }

  public async claimSyncRun(
    syncRunId: string,
    expectedRevision: number,
    expectedPhase: MailSyncRun['phase'],
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<MailSyncRun | undefined> {
    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .updateTable<SyncRunRow>('mailSyncRuns')
      .set({ status: 'running', leaseToken, leaseExpiresAt, updatedAt: now })
      .where('id', '=', syncRunId)
      .where('revision', '=', expectedRevision)
      .where('phase', '=', expectedPhase)
      .where('status', 'in', ['pending', 'running'])
      .where((builder) =>
        builder.or([
          builder.eb('leaseToken', 'is', null),
          builder.eb('leaseExpiresAt', '<=', now),
        ]),
      )
      .execute();
    return result.updatedCount === 1 ? this.getSyncRun(syncRunId) : undefined;
  }

  public async renewSyncRunLease(
    syncRunId: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<SyncRunRow>('mailSyncRuns')
      .set({ leaseExpiresAt, updatedAt: new Date().toISOString() })
      .where('id', '=', syncRunId)
      .where('status', '=', 'running')
      .where('leaseToken', '=', leaseToken)
      .execute();
    return result.updatedCount === 1;
  }

  public async commitSyncStep(input: MailSyncStepCommit): Promise<MailSyncRun> {
    const now = new Date().toISOString();
    await this.database.transaction(async (connection): Promise<void> => {
      await upsertFolders(
        connection.query,
        input.run.accountId,
        input.folders ?? [],
      );
      if (input.completeProviderFolderIds) {
        let staleFolders = connection.query
          .deleteFrom('mailFolders')
          .where('accountId', '=', input.run.accountId);
        staleFolders = staleFolders.where(
          'providerFolderId',
          '!=',
          MAIL_LOCAL_DRAFT_FOLDER_ID,
        );
        if (input.completeProviderFolderIds.length > 0) {
          staleFolders = staleFolders.where(
            'providerFolderId',
            'not in',
            input.completeProviderFolderIds,
          );
        }
        await staleFolders.execute();
        await removeStaleMessageFolders(
          connection.query,
          input.run.accountId,
          input.completeProviderFolderIds,
        );
      }
      await upsertMessages(
        connection.query,
        input.run.accountId,
        input.messages,
      );
      await removeMessagesFromFolders(
        connection.query,
        input.run.accountId,
        input.removedFromFolders ?? [],
      );
      await deleteMessages(
        connection.query,
        input.run.accountId,
        input.deletedProviderMessageIds ?? [],
      );
      const pendingPush =
        input.status === 'completed'
          ? await connection.query
              .selectFrom<PushPendingRow>('mailPushPending')
              .select(['accountId', 'requestToken'])
              .where('accountId', '=', input.run.accountId)
              .executeTakeFirst<
                Pick<PushPendingRow, 'accountId' | 'requestToken'>
              >()
          : undefined;
      if (pendingPush) {
        await connection.query
          .deleteFrom<PushPendingRow>('mailPushPending')
          .where('accountId', '=', input.run.accountId)
          .where('requestToken', '=', pendingPush.requestToken)
          .execute();
      }
      const status = pendingPush ? 'running' : input.status;
      const phase = pendingPush ? 'incremental' : input.phase;
      const createNextTask = pendingPush || input.createNextTask;
      const result = await connection.query
        .updateTable<SyncRunRow>('mailSyncRuns')
        .set({
          phase,
          status,
          revision: input.run.revision + 1,
          activeKey: status === 'completed' ? null : input.run.accountId,
          processedMessages:
            input.run.processedMessages + input.messages.length,
          processedPages: input.run.processedPages + 1,
          historyCursor: input.historyCursor ?? null,
          folderCursor: input.folderCursor ?? null,
          baselineCursor: jsonOrNull(input.baselineCursor),
          changeCursor: jsonOrNull(input.changeCursor),
          leaseToken: null,
          leaseExpiresAt: null,
          error: null,
          updatedAt: now,
          completedAt: status === 'completed' ? now : null,
        })
        .where('id', '=', input.run.id)
        .where('status', '=', 'running')
        .where('leaseToken', '=', input.run.leaseToken ?? '')
        .execute();
      if (result.updatedCount !== 1) {
        throw new Error('Mail sync run lease was lost before commit.');
      }
      if (input.status === 'completed' && input.changeCursor) {
        await upsertSyncState(
          connection.query,
          input.run.accountId,
          input.changeCursor,
        );
      }
      if (createNextTask) {
        await insertOutbox(
          connection.query,
          {
            ...input.run,
            phase,
            revision: input.run.revision + 1,
          },
          input.run.processedPages + 1,
          now,
        );
      }
    });
    const updated = await this.getSyncRun(input.run.id);
    if (!updated) throw new Error('Committed mail sync run could not be read.');
    return updated;
  }

  public async failSyncRun(
    run: MailSyncRun,
    error: MailProviderError,
  ): Promise<MailSyncRun> {
    const now = new Date().toISOString();
    await this.database
      .query()
      .updateTable<SyncRunRow>('mailSyncRuns')
      .set({
        status: 'failed',
        activeKey: null,
        error: JSON.stringify(error),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where('id', '=', run.id)
      .where('leaseToken', '=', run.leaseToken ?? '')
      .execute();
    const updated = await this.getSyncRun(run.id);
    if (!updated) throw new Error('Failed mail sync run could not be read.');
    return updated;
  }

  public async releaseSyncRun(
    run: MailSyncRun,
    error: MailProviderError,
    availableAt: string,
  ): Promise<MailSyncRun> {
    const now = new Date().toISOString();
    await this.database.transaction(async (connection): Promise<void> => {
      const result = await connection.query
        .updateTable<SyncRunRow>('mailSyncRuns')
        .set({
          status: 'pending',
          activeKey: run.accountId,
          error: JSON.stringify(error),
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where('id', '=', run.id)
        .where('leaseToken', '=', run.leaseToken ?? '')
        .execute();
      if (result.updatedCount !== 1) {
        throw new Error('Mail sync run lease was lost before retry planning.');
      }
      await insertOutbox(
        connection.query,
        run,
        run.processedPages,
        availableAt,
        randomUUID(),
      );
    });
    const updated = await this.getSyncRun(run.id);
    if (!updated) throw new Error('Released mail sync run could not be read.');
    return updated;
  }
}

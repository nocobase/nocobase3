import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type { DatabaseManager, QueryAdapter, Row } from '@nocobase/db';

import type {
  MailAccount,
  MailAccountView,
  MailAttachment,
  MailCreateSyncRunInput,
  MailFolder,
  MailIdentity,
  MailListMessagesInput,
  MailListConversationMessagesInput,
  MailMessage,
  MailMessageSummary,
  MailOutboxRecord,
  MailPage,
  MailProviderError,
  MailStore,
  MailStoredSubmission,
  MailSubmission,
  MailSyncBatch,
  MailSyncCursor,
  MailSyncRun,
  MailSyncStepCommit,
  NormalizedMailMessage,
  NormalizedMailAttachment,
  MailAddress,
  MailAuthorizationTransaction,
  MailProviderIdentity,
} from './types.js';

interface AuthorizationStateRow extends Row {
  stateHash: string;
  userId: string;
  providerType: string;
  providerName: string;
  redirectUri: string;
  verifierCredentialReference: string;
  scopes: readonly string[] | string;
  expiresAt: string;
  consumedAt?: string | null;
  createdAt: string;
}

interface AccountRow extends Row {
  id: string;
  userId: string;
  providerType: string;
  providerName: string;
  address: string;
  displayName?: string | null;
  credentialReference: string;
  authorizationSubject?: string | null;
  scopes: readonly string[] | string;
  credentialExpiresAt?: string | null;
  status: MailAccount['status'];
  isDefault: boolean | number;
  createdAt: string;
  updatedAt: string;
}

interface IdentityRow extends Row {
  id: string;
  accountId: string;
  address: string;
  displayName?: string | null;
  isPrimary: boolean | number;
  canSend: boolean | number;
}

interface FolderRow extends Row {
  id: string;
  accountId: string;
  providerFolderId: string;
  type: MailFolder['type'];
  name: string;
  unreadCount?: number | null;
  kind: MailFolder['kind'];
}

interface MessageRow extends Row {
  id: string;
  accountId: string;
  providerMessageId: string;
  internetMessageId?: string | null;
  providerConversationId?: string | null;
  providerFolderIds: readonly string[] | string;
  sender?: MailAddress | string | null;
  recipients:
    | {
        readonly to: readonly MailAddress[];
        readonly cc: readonly MailAddress[];
        readonly bcc: readonly MailAddress[];
      }
    | string;
  replyTo: readonly MailAddress[] | string;
  inReplyTo?: string | null;
  references: readonly string[] | string;
  subject: string;
  preview?: string | null;
  text?: string | null;
  html?: string | null;
  receivedAt?: string | null;
  sentAt?: string | null;
  sortAt: string;
  read: boolean | number;
  starred: boolean | number;
  draft: boolean | number;
  attachments: readonly NormalizedMailAttachment[] | string;
  createdAt: string;
  updatedAt: string;
}

interface MessageFolderRow extends Row {
  id: string;
  accountId: string;
  messageId: string;
  providerFolderId: string;
}

interface SyncStateRow extends Row {
  accountId: string;
  cursor: MailSyncCursor | string;
  lastSyncedAt: string;
}

interface SyncRunRow extends Row {
  id: string;
  accountId: string;
  requestedBy: string;
  mode: MailSyncRun['mode'];
  phase: MailSyncRun['phase'];
  status: MailSyncRun['status'];
  revision: number;
  activeKey?: string | null;
  policy: MailSyncRun['policy'] | string;
  processedMessages: number;
  processedPages: number;
  historyCursor?: string | null;
  folderCursor?: string | null;
  baselineCursor?: MailSyncCursor | string | null;
  changeCursor?: MailSyncCursor | string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  error?: MailProviderError | string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

interface SubmissionRow extends Row {
  id: string;
  accountId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: MailSubmission['status'];
  providerMessageId?: string | null;
  error?: MailProviderError | string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OutboxRow extends Row {
  id: string;
  type: MailOutboxRecord['type'];
  aggregateId: string;
  deduplicationKey: string;
  payload: MailOutboxRecord['payload'] | string;
  status: MailOutboxRecord['status'];
  attempts: number;
  availableAt: string;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  createdAt: string;
  publishedAt?: string | null;
}

export class DatabaseMailStore implements MailStore {
  public constructor(private readonly database: DatabaseManager) {}

  public async createAuthorizationTransaction(
    transaction: MailAuthorizationTransaction,
  ): Promise<void> {
    await this.database
      .query()
      .insertInto<AuthorizationStateRow>('mailAuthorizationStates')
      .values({
        stateHash: transaction.stateHash,
        userId: transaction.userId,
        providerType: transaction.provider.type,
        providerName: transaction.provider.name,
        redirectUri: transaction.redirectUri,
        verifierCredentialReference: transaction.verifierCredentialReference,
        scopes: JSON.stringify(transaction.scopes),
        expiresAt: transaction.expiresAt,
        createdAt: new Date().toISOString(),
      })
      .execute();
  }

  public async consumeAuthorizationTransaction(
    stateHash: string,
    now: string,
  ): Promise<MailAuthorizationTransaction | undefined> {
    return this.database.transaction(async (connection) => {
      const row = await connection.query
        .selectFrom<AuthorizationStateRow>('mailAuthorizationStates')
        .selectAll()
        .where('stateHash', '=', stateHash)
        .where('consumedAt', 'is', null)
        .where('expiresAt', '>', now)
        .executeTakeFirst<AuthorizationStateRow>();
      if (!row) return undefined;
      const updated = await connection.query
        .updateTable<AuthorizationStateRow>('mailAuthorizationStates')
        .set({ consumedAt: now })
        .where('stateHash', '=', stateHash)
        .where('consumedAt', 'is', null)
        .execute();
      return updated.updatedCount === 1
        ? {
            stateHash: row.stateHash,
            userId: row.userId,
            provider: {
              type: row.providerType,
              name: row.providerName,
            },
            redirectUri: row.redirectUri,
            verifierCredentialReference: row.verifierCredentialReference,
            scopes: parseJson<readonly string[]>(
              row.scopes,
              'authorization scopes',
            ),
            expiresAt: row.expiresAt,
          }
        : undefined;
    });
  }

  public async getAccount(accountId: string): Promise<MailAccount | undefined> {
    const row = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .selectAll()
      .where('id', '=', accountId)
      .executeTakeFirst<AccountRow>();
    return row ? fromAccountRow(row) : undefined;
  }

  public async findAccountByProviderAddress(
    provider: MailProviderIdentity,
    address: string,
  ): Promise<MailAccount | undefined> {
    const row = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .selectAll()
      .where('providerType', '=', provider.type)
      .where('providerName', '=', provider.name)
      .where('address', '=', address)
      .executeTakeFirst<AccountRow>();
    return row ? fromAccountRow(row) : undefined;
  }

  public async listAccounts(userId: string): Promise<readonly MailAccount[]> {
    const rows = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('address', 'asc')
      .execute<AccountRow>();
    return rows.map(fromAccountRow);
  }

  public async saveAccount(account: MailAccount): Promise<MailAccount> {
    await persistAccount(this.database.query(), account);
    return account;
  }

  public async saveAuthorizedAccount(
    account: MailAccount,
    identities: readonly MailIdentity[],
  ): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await persistAccount(connection.query, account);
      await replaceAccountIdentities(connection.query, account.id, identities);
    });
  }

  public async listIdentities(
    accountId: string,
  ): Promise<readonly MailIdentity[]> {
    const rows = await this.database
      .query()
      .selectFrom<IdentityRow>('mailIdentities')
      .selectAll()
      .where('accountId', '=', accountId)
      .orderBy('address', 'asc')
      .execute<IdentityRow>();
    return rows.map(fromIdentityRow);
  }

  public async replaceIdentities(
    accountId: string,
    identities: readonly MailIdentity[],
  ): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await replaceAccountIdentities(connection.query, accountId, identities);
    });
  }

  public async getIdentity(
    identityId: string,
  ): Promise<MailIdentity | undefined> {
    const row = await this.database
      .query()
      .selectFrom<IdentityRow>('mailIdentities')
      .selectAll()
      .where('id', '=', identityId)
      .executeTakeFirst<IdentityRow>();
    return row ? fromIdentityRow(row) : undefined;
  }

  public async listFolders(accountId: string): Promise<readonly MailFolder[]> {
    const rows = await this.database
      .query()
      .selectFrom<FolderRow>('mailFolders')
      .selectAll()
      .where('accountId', '=', accountId)
      .orderBy('name', 'asc')
      .execute<FolderRow>();
    return rows.map(fromFolderRow);
  }

  public async commitSyncBatch(batch: MailSyncBatch): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
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

  public async listMessages(
    userId: string,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    const owned = await this.listAccounts(userId);
    const requested = input.accountIds
      ? owned.filter((account) => input.accountIds?.includes(account.id))
      : owned;
    if (requested.length === 0) return { items: [] };
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const cursor = parseMessageCursor(input.cursor);
    let query = this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll('mailMessages')
      .where(
        'mailMessages.accountId',
        'in',
        requested.map((account) => account.id),
      );
    if (input.folderIds?.length) {
      query = query
        .innerJoin(
          'mailMessageFolders',
          'mailMessages.id',
          'mailMessageFolders.messageId',
        )
        .where('mailMessageFolders.providerFolderId', 'in', input.folderIds)
        .distinct();
    }
    if (input.conversationId)
      query = query.where(
        'mailMessages.providerConversationId',
        '=',
        input.conversationId,
      );
    if (input.unread !== undefined)
      query = query.where('mailMessages.read', '=', !input.unread);
    if (input.starred !== undefined)
      query = query.where('mailMessages.starred', '=', input.starred);
    if (input.query)
      query = query.where((builder) =>
        builder.eb.or([
          builder.eb('mailMessages.subject', 'like', `%${input.query}%`),
          builder.eb('mailMessages.preview', 'like', `%${input.query}%`),
        ]),
      );
    if (cursor) {
      query = query.where((builder) =>
        builder.eb.or([
          builder.eb('mailMessages.sortAt', '<', cursor.sortAt),
          builder.eb.and([
            builder.eb('mailMessages.sortAt', '=', cursor.sortAt),
            builder.eb('mailMessages.id', '<', cursor.id),
          ]),
        ]),
      );
    }
    const rows = await query
      .orderBy('mailMessages.sortAt', 'desc')
      .orderBy('mailMessages.id', 'desc')
      .limit(limit + 1)
      .execute<MessageRow>();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items.at(-1);
    return {
      items: items.map((row) => toMailMessage(row)),
      nextCursor:
        hasMore && lastItem ? encodeMessageCursor(lastItem) : undefined,
    };
  }

  public async getMessage(
    userId: string,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined> {
    const account = await this.getAccount(accountId);
    if (!account || account.userId !== userId) return undefined;
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('id', '=', messageId)
      .where('accountId', '=', accountId)
      .executeTakeFirst<MessageRow>();
    return row ? toMailMessage(row) : undefined;
  }

  public async listConversationMessages(
    userId: string,
    accountId: string,
    conversationId: string,
    input: MailListConversationMessagesInput = {},
  ): Promise<MailPage<MailMessage>> {
    const account = await this.getAccount(accountId);
    if (!account || account.userId !== userId) return { items: [] };
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const cursor = parseMessageCursor(input.cursor);
    let query = this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('accountId', '=', accountId)
      .where('providerConversationId', '=', conversationId);
    if (cursor) {
      query = query.where((builder) =>
        builder.eb.or([
          builder.eb('sortAt', '<', cursor.sortAt),
          builder.eb.and([
            builder.eb('sortAt', '=', cursor.sortAt),
            builder.eb('id', '<', cursor.id),
          ]),
        ]),
      );
    }
    const rows = await query
      .orderBy('sortAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .execute<MessageRow>();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items.at(-1);
    return {
      items: [...items].reverse().map(toMailMessage),
      nextCursor:
        hasMore && lastItem ? encodeMessageCursor(lastItem) : undefined,
    };
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
        await connection.query
          .insertInto<SyncRunRow>('mailSyncRuns')
          .values(toSyncRunRow(run))
          .execute();
        await insertOutbox(connection.query, run, 0, now);
      });
    } catch (error) {
      const active = await this.findActiveSyncRun(input.accountId);
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
      const result = await connection.query
        .updateTable<SyncRunRow>('mailSyncRuns')
        .set({
          phase: input.phase,
          status: input.status,
          revision: input.run.revision + 1,
          activeKey: input.status === 'completed' ? null : input.run.accountId,
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
          completedAt: input.status === 'completed' ? now : null,
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
      if (input.createNextTask) {
        await insertOutbox(
          connection.query,
          {
            ...input.run,
            phase: input.phase,
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

  public async getSubmissionByIdempotencyKey(
    accountId: string,
    idempotencyKey: string,
  ): Promise<MailStoredSubmission | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .selectAll()
      .where('accountId', '=', accountId)
      .where('idempotencyKey', '=', idempotencyKey)
      .executeTakeFirst<SubmissionRow>();
    return row ? fromSubmissionRow(row) : undefined;
  }

  public async createSubmission(
    submission: MailSubmission,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<MailStoredSubmission> {
    const now = new Date().toISOString();
    try {
      await this.database
        .query()
        .insertInto<SubmissionRow>('mailSubmissions')
        .values({
          ...submission,
          idempotencyKey,
          requestFingerprint,
          error: jsonOrNull(submission.error),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    } catch (error) {
      const existing = await this.getSubmissionByIdempotencyKey(
        submission.accountId,
        idempotencyKey,
      );
      if (existing) return existing;
      throw error;
    }
    return { ...submission, requestFingerprint };
  }

  public async claimSubmission(
    submissionId: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<SubmissionRow>('mailSubmissions')
      .set({
        status: 'submitting',
        leaseToken,
        leaseExpiresAt,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', submissionId)
      .where('status', '=', 'pending')
      .execute();
    return result.updatedCount === 1;
  }

  public async recoverExpiredSubmissions(now: string): Promise<number> {
    const result = await this.database
      .query()
      .updateTable<SubmissionRow>('mailSubmissions')
      .set({
        status: 'unknown',
        error: JSON.stringify({
          code: 'MAIL_SEND_RESULT_UNKNOWN',
          message: 'The Provider result is unknown after sender interruption.',
          category: 'unknown',
          retryable: false,
        } satisfies MailProviderError),
        leaseExpiresAt: null,
        leaseToken: null,
        updatedAt: now,
      })
      .where('status', '=', 'submitting')
      .where('leaseExpiresAt', '<=', now)
      .execute();
    return result.updatedCount ?? 0;
  }

  public async finishSubmission(
    submission: MailSubmission,
    leaseToken: string,
  ): Promise<MailSubmission> {
    await this.database
      .query()
      .updateTable<SubmissionRow>('mailSubmissions')
      .set({
        status: submission.status,
        providerMessageId: submission.providerMessageId ?? null,
        error: jsonOrNull(submission.error),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', submission.id)
      .where('status', '=', 'submitting')
      .where('leaseToken', '=', leaseToken)
      .execute();
    const row = await this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .selectAll()
      .where('id', '=', submission.id)
      .executeTakeFirst<SubmissionRow>();
    if (!row) throw new Error('Finished mail submission could not be read.');
    return fromSubmissionRow(row);
  }

  public async claimOutbox(
    now: string,
    leaseToken: string,
    leaseExpiresAt: string,
    limit: number,
  ): Promise<readonly MailOutboxRecord[]> {
    const candidates = await this.database
      .query()
      .selectFrom<OutboxRow>('mailOutbox')
      .selectAll()
      .where('availableAt', '<=', now)
      .where((builder) =>
        builder.or([
          builder.eb('status', '=', 'pending'),
          builder.eb.and([
            builder.eb('status', '=', 'publishing'),
            builder.eb('leaseExpiresAt', '<=', now),
          ]),
        ]),
      )
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .execute<OutboxRow>();
    const claimed: MailOutboxRecord[] = [];
    for (const candidate of candidates) {
      const result = await this.database
        .query()
        .updateTable<OutboxRow>('mailOutbox')
        .set({
          status: 'publishing',
          attempts: candidate.attempts + 1,
          leaseToken,
          leaseExpiresAt,
        })
        .where('id', '=', candidate.id)
        .where('availableAt', '<=', now)
        .where((builder) =>
          builder.or([
            builder.eb('status', '=', 'pending'),
            builder.eb.and([
              builder.eb('status', '=', 'publishing'),
              builder.eb('leaseExpiresAt', '<=', now),
            ]),
          ]),
        )
        .execute();
      if (result.updatedCount === 1) {
        claimed.push(
          fromOutboxRow({
            ...candidate,
            status: 'publishing',
            attempts: candidate.attempts + 1,
            leaseToken,
            leaseExpiresAt,
          }),
        );
      }
    }
    return claimed;
  }

  public async markOutboxPublished(
    outboxId: string,
    leaseToken: string,
    publishedAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<OutboxRow>('mailOutbox')
      .set({
        status: 'published',
        leaseToken: null,
        leaseExpiresAt: null,
        publishedAt,
      })
      .where('id', '=', outboxId)
      .where('status', '=', 'publishing')
      .where('leaseToken', '=', leaseToken)
      .execute();
    return result.updatedCount === 1;
  }

  public async releaseOutbox(
    outboxId: string,
    leaseToken: string,
    availableAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<OutboxRow>('mailOutbox')
      .set({
        status: 'pending',
        availableAt,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where('id', '=', outboxId)
      .where('status', '=', 'publishing')
      .where('leaseToken', '=', leaseToken)
      .execute();
    return result.updatedCount === 1;
  }
}

export function createDatabaseMailStore(
  database: DatabaseManager,
): DatabaseMailStore {
  return new DatabaseMailStore(database);
}

async function persistAccount(
  query: QueryAdapter,
  account: MailAccount,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await query
    .selectFrom<AccountRow>('mailAccounts')
    .select('id')
    .where('id', '=', account.id)
    .executeTakeFirst<Pick<AccountRow, 'id'>>();
  const row = toAccountRow(account, now, existing ? undefined : now);
  if (existing) {
    await query
      .updateTable<AccountRow>('mailAccounts')
      .set(row)
      .where('id', '=', account.id)
      .execute();
    return;
  }
  await query.insertInto<AccountRow>('mailAccounts').values(row).execute();
}

async function replaceAccountIdentities(
  query: QueryAdapter,
  accountId: string,
  identities: readonly MailIdentity[],
): Promise<void> {
  await query
    .deleteFrom<IdentityRow>('mailIdentities')
    .where('accountId', '=', accountId)
    .execute();
  if (identities.length > 0) {
    await query
      .insertInto<IdentityRow>('mailIdentities')
      .values(identities.map(toIdentityRow))
      .execute();
  }
}

async function upsertMessages(
  query: QueryAdapter,
  accountId: string,
  messages: readonly NormalizedMailMessage[],
): Promise<void> {
  const uniqueMessages = [
    ...new Map(
      messages.map((message) => [message.providerMessageId, message]),
    ).values(),
  ];
  if (uniqueMessages.length === 0) return;
  const now = new Date().toISOString();
  const existingRows = await query
    .selectFrom<MessageRow>('mailMessages')
    .select(['id', 'providerMessageId', 'createdAt'])
    .where('accountId', '=', accountId)
    .where(
      'providerMessageId',
      'in',
      uniqueMessages.map((message) => message.providerMessageId),
    )
    .execute<Pick<MessageRow, 'id' | 'providerMessageId' | 'createdAt'>>();
  const existingByProviderId = new Map(
    existingRows.map((row) => [row.providerMessageId, row]),
  );
  const rows: MessageRow[] = [];
  for (const message of uniqueMessages) {
    const existing = existingByProviderId.get(message.providerMessageId);
    const row = toMessageRow(
      accountId,
      message,
      existing?.id ?? randomUUID(),
      existing?.createdAt ?? now,
      now,
    );
    rows.push(row);
    if (existing) {
      await query
        .updateTable<MessageRow>('mailMessages')
        .set(row)
        .where('id', '=', existing.id)
        .execute();
    }
  }
  const newRows = rows.filter(
    (row) => !existingByProviderId.has(row.providerMessageId),
  );
  for (const batch of chunks(newRows, 25)) {
    await query.insertInto<MessageRow>('mailMessages').values(batch).execute();
  }
  const messageIds = rows.map((row) => row.id);
  await query
    .deleteFrom<MessageFolderRow>('mailMessageFolders')
    .where('messageId', 'in', messageIds)
    .execute();
  const folderRows = rows.flatMap((row) =>
    [
      ...new Set(
        parseJson<readonly string[]>(
          row.providerFolderIds,
          'message folder IDs',
        ),
      ),
    ].map((providerFolderId): MessageFolderRow => ({
      id: randomUUID(),
      accountId,
      messageId: row.id,
      providerFolderId,
    })),
  );
  for (const batch of chunks(folderRows, 100)) {
    await query
      .insertInto<MessageFolderRow>('mailMessageFolders')
      .values(batch)
      .execute();
  }
}

async function removeStaleMessageFolders(
  query: QueryAdapter,
  accountId: string,
  completeProviderFolderIds: readonly string[],
): Promise<void> {
  let staleRowsQuery = query
    .selectFrom<MessageFolderRow>('mailMessageFolders')
    .selectAll()
    .where('accountId', '=', accountId);
  if (completeProviderFolderIds.length > 0) {
    staleRowsQuery = staleRowsQuery.where(
      'providerFolderId',
      'not in',
      completeProviderFolderIds,
    );
  }
  const staleRows = await staleRowsQuery.execute<MessageFolderRow>();
  if (staleRows.length === 0) return;
  for (const batch of chunks(staleRows, 200)) {
    await query
      .deleteFrom<MessageFolderRow>('mailMessageFolders')
      .where(
        'id',
        'in',
        batch.map((row) => row.id),
      )
      .execute();
  }
  const affectedMessageIds = new Set(staleRows.map((row) => row.messageId));
  const remainingRows: MessageFolderRow[] = [];
  for (const batch of chunks([...affectedMessageIds], 500)) {
    remainingRows.push(
      ...(await query
        .selectFrom<MessageFolderRow>('mailMessageFolders')
        .selectAll()
        .where('messageId', 'in', batch)
        .execute<MessageFolderRow>()),
    );
  }
  const remainingByMessageId = new Map<string, string[]>();
  for (const row of remainingRows) {
    const folderIds = remainingByMessageId.get(row.messageId) ?? [];
    folderIds.push(row.providerFolderId);
    remainingByMessageId.set(row.messageId, folderIds);
  }
  for (const messageId of affectedMessageIds) {
    await query
      .updateTable<MessageRow>('mailMessages')
      .set({
        providerFolderIds: JSON.stringify(
          remainingByMessageId.get(messageId) ?? [],
        ),
      })
      .where('id', '=', messageId)
      .execute();
  }
}

async function upsertFolders(
  query: QueryAdapter,
  accountId: string,
  folders: readonly import('./types.js').NormalizedMailFolder[],
): Promise<void> {
  for (const folder of folders) {
    const existing = await query
      .selectFrom<FolderRow>('mailFolders')
      .select('id')
      .where('accountId', '=', accountId)
      .where('providerFolderId', '=', folder.providerFolderId)
      .executeTakeFirst<Pick<FolderRow, 'id'>>();
    const row: FolderRow = {
      id: existing?.id ?? randomUUID(),
      accountId,
      ...folder,
    };
    if (existing) {
      await query
        .updateTable<FolderRow>('mailFolders')
        .set(row)
        .where('id', '=', existing.id)
        .execute();
    } else {
      await query.insertInto<FolderRow>('mailFolders').values(row).execute();
    }
  }
}

async function deleteMessages(
  query: QueryAdapter,
  accountId: string,
  providerMessageIds: readonly string[],
): Promise<void> {
  if (providerMessageIds.length === 0) return;
  const messages = await query
    .selectFrom<MessageRow>('mailMessages')
    .select('id')
    .where('accountId', '=', accountId)
    .where('providerMessageId', 'in', providerMessageIds)
    .execute<Pick<MessageRow, 'id'>>();
  if (messages.length > 0) {
    await query
      .deleteFrom<MessageFolderRow>('mailMessageFolders')
      .where(
        'messageId',
        'in',
        messages.map((message) => message.id),
      )
      .execute();
  }
  await query
    .deleteFrom<MessageRow>('mailMessages')
    .where('accountId', '=', accountId)
    .where('providerMessageId', 'in', providerMessageIds)
    .execute();
}

async function removeMessagesFromFolders(
  query: QueryAdapter,
  accountId: string,
  removals: readonly import('./types.js').MailProviderFolderRemoval[],
): Promise<void> {
  for (const removal of removals) {
    const row = await query
      .selectFrom<MessageRow>('mailMessages')
      .select(['id', 'providerFolderIds'])
      .where('accountId', '=', accountId)
      .where('providerMessageId', '=', removal.providerMessageId)
      .executeTakeFirst<Pick<MessageRow, 'id' | 'providerFolderIds'>>();
    if (!row) continue;
    const providerFolderIds = parseJson<readonly string[]>(
      row.providerFolderIds,
      'message folder IDs',
    ).filter((folderId) => folderId !== removal.providerFolderId);
    await query
      .updateTable<MessageRow>('mailMessages')
      .set({ providerFolderIds: JSON.stringify(providerFolderIds) })
      .where('id', '=', row.id)
      .execute();
    await query
      .deleteFrom<MessageFolderRow>('mailMessageFolders')
      .where('messageId', '=', row.id)
      .where('providerFolderId', '=', removal.providerFolderId)
      .execute();
  }
}

async function upsertSyncState(
  query: QueryAdapter,
  accountId: string,
  cursor: MailSyncCursor,
): Promise<void> {
  const existing = await query
    .selectFrom<SyncStateRow>('mailSyncStates')
    .select('accountId')
    .where('accountId', '=', accountId)
    .executeTakeFirst();
  const row: SyncStateRow = {
    accountId,
    cursor: JSON.stringify(cursor),
    lastSyncedAt: new Date().toISOString(),
  };
  if (existing) {
    await query
      .updateTable<SyncStateRow>('mailSyncStates')
      .set(row)
      .where('accountId', '=', accountId)
      .execute();
  } else {
    await query
      .insertInto<SyncStateRow>('mailSyncStates')
      .values(row)
      .execute();
  }
}

async function insertOutbox(
  query: QueryAdapter,
  run: Pick<MailSyncRun, 'id' | 'phase' | 'revision'>,
  sequence: number,
  now: string,
  retryId?: string,
): Promise<void> {
  await query
    .insertInto<OutboxRow>('mailOutbox')
    .values({
      id: randomUUID(),
      type: 'syncMailbox',
      aggregateId: run.id,
      deduplicationKey: `sync:${run.id}:${sequence}:${run.phase}${retryId ? `:retry:${retryId}` : ''}`,
      payload: JSON.stringify({
        version: 1,
        syncRunId: run.id,
        expectedRevision: run.revision,
        expectedPhase: run.phase,
      }),
      status: 'pending',
      attempts: 0,
      availableAt: now,
      createdAt: now,
    })
    .execute();
}

function toAccountRow(
  account: MailAccount,
  updatedAt: string,
  createdAt?: string,
): AccountRow {
  return {
    id: account.id,
    userId: account.userId,
    providerType: account.provider.type,
    providerName: account.provider.name,
    address: account.address,
    displayName: account.displayName,
    credentialReference: account.credentialReference,
    authorizationSubject: account.authorizationSubject,
    scopes: JSON.stringify(account.scopes),
    credentialExpiresAt: account.credentialExpiresAt,
    status: account.status,
    isDefault: account.isDefault,
    createdAt: createdAt ?? updatedAt,
    updatedAt,
  };
}

function fromAccountRow(row: AccountRow): MailAccount {
  return {
    id: row.id,
    userId: row.userId,
    provider: { type: row.providerType, name: row.providerName },
    address: row.address,
    displayName: row.displayName ?? undefined,
    credentialReference: row.credentialReference,
    authorizationSubject: row.authorizationSubject ?? undefined,
    scopes: parseJson<readonly string[]>(row.scopes, 'account scopes'),
    credentialExpiresAt: row.credentialExpiresAt ?? undefined,
    status: row.status,
    isDefault: Boolean(row.isDefault),
  };
}

export function toMailAccountView(account: MailAccount): MailAccountView {
  return {
    id: account.id,
    userId: account.userId,
    provider: account.provider,
    address: account.address,
    displayName: account.displayName,
    scopes: account.scopes,
    credentialExpiresAt: account.credentialExpiresAt,
    status: account.status,
    isDefault: account.isDefault,
  };
}

function toIdentityRow(identity: MailIdentity): IdentityRow {
  return { ...identity };
}

function fromIdentityRow(row: IdentityRow): MailIdentity {
  return {
    id: row.id,
    accountId: row.accountId,
    address: row.address,
    displayName: row.displayName ?? undefined,
    isPrimary: Boolean(row.isPrimary),
    canSend: Boolean(row.canSend),
  };
}

function fromFolderRow(row: FolderRow): MailFolder {
  return {
    id: row.id,
    accountId: row.accountId,
    providerFolderId: row.providerFolderId,
    type: row.type,
    name: row.name,
    unreadCount: row.unreadCount ?? undefined,
    kind: row.kind,
  };
}

function toMessageRow(
  accountId: string,
  message: NormalizedMailMessage,
  id: string,
  createdAt: string,
  updatedAt: string,
): MessageRow {
  return {
    id,
    accountId,
    providerMessageId: message.providerMessageId,
    internetMessageId: message.internetMessageId,
    providerConversationId: message.providerConversationId,
    providerFolderIds: JSON.stringify(message.providerFolderIds),
    sender: jsonOrNull(message.from),
    recipients: JSON.stringify({
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
    }),
    replyTo: JSON.stringify(message.replyTo),
    inReplyTo: message.inReplyTo,
    references: JSON.stringify(message.references),
    subject: message.subject,
    preview: message.preview,
    text: message.text,
    html: message.html,
    receivedAt: message.receivedAt,
    sentAt: message.sentAt,
    sortAt: message.receivedAt ?? message.sentAt ?? createdAt,
    read: message.read,
    starred: message.starred,
    draft: message.draft,
    attachments: JSON.stringify(message.attachments),
    createdAt,
    updatedAt,
  };
}

function toMailMessage(row: MessageRow): MailMessage {
  const recipients = parseJson<{
    readonly to: MailMessage['to'];
    readonly cc: MailMessage['cc'];
    readonly bcc: MailMessage['bcc'];
  }>(row.recipients, 'message recipients');
  const attachments = parseJson<readonly NormalizedMailAttachment[]>(
    row.attachments,
    'message attachments',
  ).map((attachment): MailAttachment => ({
    ...attachment,
    id: `${row.id}:${attachment.providerAttachmentId}`,
    messageId: row.id,
  }));
  return {
    id: row.id,
    accountId: row.accountId,
    providerMessageId: row.providerMessageId,
    internetMessageId: row.internetMessageId ?? undefined,
    conversationId: row.providerConversationId ?? undefined,
    folderIds: parseJson<readonly string[]>(
      row.providerFolderIds,
      'message folder ids',
    ),
    from: row.sender
      ? parseJson<NonNullable<MailMessage['from']>>(
          row.sender,
          'message sender',
        )
      : undefined,
    ...recipients,
    subject: row.subject,
    preview: row.preview ?? undefined,
    receivedAt: row.receivedAt ?? undefined,
    sentAt: row.sentAt ?? undefined,
    read: Boolean(row.read),
    starred: Boolean(row.starred),
    draft: Boolean(row.draft),
    hasAttachments: attachments.length > 0,
    replyTo: parseJson<MailMessage['replyTo']>(row.replyTo, 'message reply-to'),
    inReplyTo: row.inReplyTo ?? undefined,
    references: parseJson<readonly string[]>(
      row.references,
      'message references',
    ),
    text: row.text ?? undefined,
    html: row.html ?? undefined,
    attachments,
  };
}

function toSyncRunRow(run: MailSyncRun): SyncRunRow {
  return {
    ...run,
    activeKey:
      run.status === 'pending' || run.status === 'running'
        ? run.accountId
        : null,
    policy: JSON.stringify(run.policy),
    baselineCursor: jsonOrNull(run.baselineCursor),
    changeCursor: jsonOrNull(run.changeCursor),
    error: jsonOrNull(run.error),
  };
}

function fromSyncRunRow(row: SyncRunRow): MailSyncRun {
  return {
    id: row.id,
    accountId: row.accountId,
    requestedBy: row.requestedBy,
    mode: row.mode,
    phase: row.phase,
    status: row.status,
    revision: Number(row.revision),
    policy: parseJson<MailSyncRun['policy']>(row.policy, 'sync policy'),
    processedMessages: Number(row.processedMessages),
    processedPages: Number(row.processedPages),
    historyCursor: row.historyCursor ?? undefined,
    folderCursor: row.folderCursor ?? undefined,
    baselineCursor: row.baselineCursor
      ? parseJson<MailSyncCursor>(row.baselineCursor, 'baseline cursor')
      : undefined,
    changeCursor: row.changeCursor
      ? parseJson<MailSyncCursor>(row.changeCursor, 'change cursor')
      : undefined,
    leaseToken: row.leaseToken ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    error: row.error
      ? parseJson<MailProviderError>(row.error, 'sync error')
      : undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    completedAt: row.completedAt ? toIsoString(row.completedAt) : undefined,
  };
}

function fromSubmissionRow(row: SubmissionRow): MailStoredSubmission {
  return {
    id: row.id,
    accountId: row.accountId,
    status: row.status,
    providerMessageId: row.providerMessageId ?? undefined,
    error: row.error
      ? parseJson<MailProviderError>(row.error, 'submission error')
      : undefined,
    requestFingerprint: row.requestFingerprint,
  };
}

function fromOutboxRow(row: OutboxRow): MailOutboxRecord {
  return {
    id: row.id,
    type: row.type,
    aggregateId: row.aggregateId,
    deduplicationKey: row.deduplicationKey,
    payload: parseJson<MailOutboxRecord['payload']>(
      row.payload,
      'outbox payload',
    ),
    status: row.status,
    attempts: Number(row.attempts),
    availableAt: toIsoString(row.availableAt),
    leaseToken: row.leaseToken ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt
      ? toIsoString(row.leaseExpiresAt)
      : undefined,
    createdAt: toIsoString(row.createdAt),
    publishedAt: row.publishedAt ? toIsoString(row.publishedAt) : undefined,
  };
}

function parseJson<T>(value: T | string, label: string): T {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Stored mail ${label} is invalid.`, { cause: error });
  }
}

function jsonOrNull(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

interface MessageCursor {
  readonly sortAt: string;
  readonly id: string;
}

function encodeMessageCursor(row: MessageRow): string {
  return Buffer.from(
    JSON.stringify({ sortAt: row.sortAt, id: row.id } satisfies MessageCursor),
  ).toString('base64url');
}

function parseMessageCursor(
  cursor: string | undefined,
): MessageCursor | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<MessageCursor>;
    if (
      typeof value.sortAt !== 'string' ||
      value.sortAt.length === 0 ||
      Number.isNaN(Date.parse(value.sortAt)) ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.id,
      )
    ) {
      throw new TypeError('Mail page cursor is invalid.');
    }
    return { sortAt: value.sortAt, id: value.id };
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError('Mail page cursor is invalid.', { cause: error });
  }
}

function chunks<T>(values: readonly T[], size: number): readonly T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

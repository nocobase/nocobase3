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
  MailSignature,
  MailListMessagesInput,
  MailListConversationMessagesInput,
  MailMessage,
  MailMessageSummary,
  MailOutboxRecord,
  MailPage,
  MailProviderError,
  MailStore,
  MailStoredSubmission,
  MailScheduledSubmission,
  MailScheduledSendTaskPayload,
  MailSubmission,
  MailComposeInput,
  MailSyncBatch,
  MailSyncMailboxTaskPayload,
  MailSyncCursor,
  MailSyncRun,
  MailSyncStepCommit,
  NormalizedMailMessage,
  NormalizedMailAttachment,
  NormalizedMailFolder,
  MailAddress,
  MailAuthorizationTransaction,
  MailOutboundAttachment,
  MailProviderIdentity,
  MailProviderPushSubscription,
  MailTemplate,
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

interface OutboundAttachmentRow extends Row {
  id: string;
  userId: string;
  disk: string;
  key: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  expiresAt: string;
}

interface TemplateRow extends Row {
  id: string;
  name: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  scope: MailTemplate['scope'];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
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

interface PushSubscriptionRow extends Row {
  accountId: string;
  providerType: string;
  providerName: string;
  providerSubscriptionId?: string | null;
  configurationFingerprint?: string | null;
  renewAfter?: string | null;
  expiresAt?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  updatedAt: string;
}

interface PushPendingRow extends Row {
  accountId: string;
  requestedBy: string;
  requestToken: string;
  requestedAt: string;
}

interface IdentityRow extends Row {
  id: string;
  accountId: string;
  address: string;
  displayName?: string | null;
  signatureText?: string | null;
  signatureHtml?: string | null;
  isPrimary: boolean | number;
  canSend: boolean | number;
}

interface SignatureRow extends Row {
  id: string;
  identityId: string;
  name: string;
  text: string;
  html?: string | null;
  isDefault: boolean | number;
  createdAt: string;
  updatedAt: string;
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
  providerDraftId?: string | null;
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
  note?: string | null;
  todo?: boolean | number;
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
  scheduledAt?: string | null;
  requestedBy?: string | null;
  composeInput?: MailComposeInput | string | null;
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

  public async createOutboundAttachment(
    attachment: MailOutboundAttachment,
  ): Promise<void> {
    await this.database
      .query()
      .insertInto<OutboundAttachmentRow>('mailOutboundAttachments')
      .values({ ...attachment })
      .execute();
  }

  public async getOutboundAttachment(
    userId: string,
    attachmentId: string,
  ): Promise<MailOutboundAttachment | undefined> {
    const row = await this.database
      .query()
      .selectFrom<OutboundAttachmentRow>('mailOutboundAttachments')
      .selectAll()
      .where('id', '=', attachmentId)
      .where('userId', '=', userId)
      .where('expiresAt', '>', new Date().toISOString())
      .executeTakeFirst<OutboundAttachmentRow>();
    return row;
  }

  public async extendOutboundAttachments(
    userId: string,
    attachmentIds: readonly string[],
    expiresAt: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) return;
    await this.database
      .query()
      .updateTable<OutboundAttachmentRow>('mailOutboundAttachments')
      .set({ expiresAt })
      .where('userId', '=', userId)
      .where('id', 'in', attachmentIds)
      .where('expiresAt', '<', expiresAt)
      .execute();
  }

  public async listExpiredOutboundAttachments(
    now: string,
    limit: number,
    after?: Pick<MailOutboundAttachment, 'expiresAt' | 'id'>,
  ): Promise<readonly MailOutboundAttachment[]> {
    let query = this.database
      .query()
      .selectFrom<OutboundAttachmentRow>('mailOutboundAttachments')
      .selectAll()
      .where('expiresAt', '<=', now);
    if (after) {
      query = query.where((builder) =>
        builder.eb.or([
          builder.eb('expiresAt', '>', after.expiresAt),
          builder.eb.and([
            builder.eb('expiresAt', '=', after.expiresAt),
            builder.eb('id', '>', after.id),
          ]),
        ]),
      );
    }
    return query
      .orderBy('expiresAt', 'asc')
      .orderBy('id', 'asc')
      .limit(limit)
      .execute<OutboundAttachmentRow>();
  }

  public async deleteOutboundAttachment(
    attachmentId: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom<OutboundAttachmentRow>('mailOutboundAttachments')
      .where('id', '=', attachmentId)
      .execute();
    return result.deletedCount === 1;
  }

  public async listTemplates(
    ownerId: string,
  ): Promise<readonly MailTemplate[]> {
    const rows = await this.database
      .query()
      .selectFrom<TemplateRow>('mailTemplates')
      .selectAll()
      .where('ownerId', '=', ownerId)
      .orderBy('name', 'asc')
      .execute<TemplateRow>();
    return rows.map(toMailTemplate);
  }

  public async saveTemplate(template: MailTemplate): Promise<MailTemplate> {
    const existing = await this.database
      .query()
      .selectFrom<TemplateRow>('mailTemplates')
      .select('id')
      .where('id', '=', template.id)
      .where('ownerId', '=', template.ownerId ?? '')
      .executeTakeFirst<Pick<TemplateRow, 'id'>>();
    const now = new Date().toISOString();
    const row: TemplateRow = {
      id: template.id,
      name: template.name,
      subject: template.subject,
      text: template.text,
      html: template.html,
      scope: template.scope,
      ownerId: template.ownerId ?? '',
      createdAt: now,
      updatedAt: now,
    };
    if (existing) {
      await this.database
        .query()
        .updateTable<TemplateRow>('mailTemplates')
        .set({
          name: row.name,
          subject: row.subject,
          text: row.text,
          html: row.html,
          scope: row.scope,
          updatedAt: row.updatedAt,
        })
        .where('id', '=', template.id)
        .where('ownerId', '=', row.ownerId)
        .execute();
    } else {
      await this.database
        .query()
        .insertInto<TemplateRow>('mailTemplates')
        .values(row)
        .execute();
    }
    return toMailTemplate(row);
  }

  public async deleteTemplate(
    ownerId: string,
    templateId: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom<TemplateRow>('mailTemplates')
      .where('id', '=', templateId)
      .where('ownerId', '=', ownerId)
      .execute();
    return result.deletedCount === 1;
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

  public async findAccountByProviderIdentity(
    provider: MailProviderIdentity,
    address: string,
    authorizationSubject?: string,
  ): Promise<MailAccount | undefined> {
    if (authorizationSubject) {
      const bySubject = await this.database
        .query()
        .selectFrom<AccountRow>('mailAccounts')
        .selectAll()
        .where('providerType', '=', provider.type)
        .where('providerName', '=', provider.name)
        .where('authorizationSubject', '=', authorizationSubject)
        .executeTakeFirst<AccountRow>();
      if (bySubject) return fromAccountRow(bySubject);
    }
    const row = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .selectAll()
      .where('providerType', '=', provider.type)
      .where('providerName', '=', provider.name)
      .where('address', '=', normalizeAddress(address))
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

  public async listAllAccounts(): Promise<readonly MailAccount[]> {
    const rows = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .selectAll()
      .orderBy('userId', 'asc')
      .orderBy('address', 'asc')
      .execute<AccountRow>();
    return rows.map(fromAccountRow);
  }

  public async getPushSubscription(
    accountId: string,
  ): Promise<MailProviderPushSubscription | undefined> {
    const row = await this.database
      .query()
      .selectFrom<PushSubscriptionRow>('mailPushSubscriptions')
      .selectAll()
      .where('accountId', '=', accountId)
      .executeTakeFirst<PushSubscriptionRow>();
    return row && completePushSubscription(row)
      ? fromPushSubscriptionRow(row)
      : undefined;
  }

  public async findPushSubscription(
    provider: MailProviderIdentity,
    providerSubscriptionId: string,
  ): Promise<MailProviderPushSubscription | undefined> {
    const row = await this.database
      .query()
      .selectFrom<PushSubscriptionRow>('mailPushSubscriptions')
      .selectAll()
      .where('providerType', '=', provider.type)
      .where('providerName', '=', provider.name)
      .where('providerSubscriptionId', '=', providerSubscriptionId)
      .executeTakeFirst<PushSubscriptionRow>();
    return row && completePushSubscription(row)
      ? fromPushSubscriptionRow(row)
      : undefined;
  }

  public async findActiveAccountsForPush(
    provider: MailProviderIdentity,
    providerSubscriptionIds: readonly string[],
    accountAddresses: readonly string[],
  ): Promise<readonly MailAccount[]> {
    const normalizedAddresses = accountAddresses.map(normalizeAddress);
    const accountIds = providerSubscriptionIds.length
      ? await this.database
          .query()
          .selectFrom<PushSubscriptionRow>('mailPushSubscriptions')
          .where('providerType', '=', provider.type)
          .where('providerName', '=', provider.name)
          .where('providerSubscriptionId', 'in', providerSubscriptionIds)
          .pluck<string>('accountId')
      : [];
    if (accountIds.length === 0 && normalizedAddresses.length === 0) return [];
    const rows = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .selectAll()
      .where('providerType', '=', provider.type)
      .where('providerName', '=', provider.name)
      .where('status', '=', 'active')
      .where((builder) =>
        builder.or([
          ...(accountIds.length ? [builder.eb('id', 'in', accountIds)] : []),
          ...(normalizedAddresses.length
            ? [builder.eb('address', 'in', normalizedAddresses)]
            : []),
        ]),
      )
      .execute<AccountRow>();
    return rows.map(fromAccountRow);
  }

  public async savePushSubscription(
    subscription: MailProviderPushSubscription,
    leaseToken?: string,
  ): Promise<boolean> {
    const query = this.database.query();
    let update = query
      .updateTable<PushSubscriptionRow>('mailPushSubscriptions')
      .set({
        providerType: subscription.provider.type,
        providerName: subscription.provider.name,
        providerSubscriptionId: subscription.providerSubscriptionId,
        configurationFingerprint: subscription.configurationFingerprint,
        renewAfter: subscription.renewAfter,
        expiresAt: subscription.expiresAt,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: subscription.updatedAt,
      })
      .where('accountId', '=', subscription.accountId);
    if (leaseToken) update = update.where('leaseToken', '=', leaseToken);
    update = update.where((builder) =>
      builder.exists(
        builder
          .selectFrom('mailAccounts')
          .select('id')
          .whereRef('mailAccounts.id', '=', 'mailPushSubscriptions.accountId')
          .where('mailAccounts.status', '=', 'active'),
      ),
    );
    const result = await update.execute();
    if (result.updatedCount === 1) return true;
    if (leaseToken) return false;
    try {
      await query
        .insertInto<PushSubscriptionRow>('mailPushSubscriptions')
        .values({
          accountId: subscription.accountId,
          providerType: subscription.provider.type,
          providerName: subscription.provider.name,
          providerSubscriptionId: subscription.providerSubscriptionId,
          configurationFingerprint: subscription.configurationFingerprint,
          renewAfter: subscription.renewAfter,
          expiresAt: subscription.expiresAt,
          updatedAt: subscription.updatedAt,
        })
        .execute();
      return true;
    } catch {
      return false;
    }
  }

  public async claimPushSubscriptionMaintenance(
    account: MailAccount,
    leaseToken: string,
    now: string,
    leaseExpiresAt: string,
  ): Promise<
    import('./types.js').MailPushSubscriptionMaintenanceLease | undefined
  > {
    try {
      await this.database
        .query()
        .insertInto<PushSubscriptionRow>('mailPushSubscriptions')
        .values({
          accountId: account.id,
          providerType: account.provider.type,
          providerName: account.provider.name,
          leaseToken,
          leaseExpiresAt,
          updatedAt: now,
        })
        .execute();
      const activeAccount = await this.getAccount(account.id);
      if (activeAccount?.status === 'active') return { leaseToken };
      await this.database
        .query()
        .deleteFrom<PushSubscriptionRow>('mailPushSubscriptions')
        .where('accountId', '=', account.id)
        .where('leaseToken', '=', leaseToken)
        .execute();
      return undefined;
    } catch {
      const result = await this.database
        .query()
        .updateTable<PushSubscriptionRow>('mailPushSubscriptions')
        .set({ leaseToken, leaseExpiresAt, updatedAt: now })
        .where('accountId', '=', account.id)
        .where((builder) =>
          builder.or([
            builder.eb('leaseToken', 'is', null),
            builder.eb('leaseExpiresAt', '<=', now),
          ]),
        )
        .execute();
      if (result.updatedCount !== 1) return undefined;
      const row = await this.database
        .query()
        .selectFrom<PushSubscriptionRow>('mailPushSubscriptions')
        .selectAll()
        .where('accountId', '=', account.id)
        .where('leaseToken', '=', leaseToken)
        .executeTakeFirst<PushSubscriptionRow>();
      const activeAccount = await this.getAccount(account.id);
      if (activeAccount?.status !== 'active') {
        if (row && completePushSubscription(row)) {
          await this.releasePushSubscriptionMaintenance(account.id, leaseToken);
        } else {
          await this.database
            .query()
            .deleteFrom<PushSubscriptionRow>('mailPushSubscriptions')
            .where('accountId', '=', account.id)
            .where('leaseToken', '=', leaseToken)
            .execute();
        }
        return undefined;
      }
      return row
        ? {
            leaseToken,
            subscription: completePushSubscription(row)
              ? fromPushSubscriptionRow(row)
              : undefined,
          }
        : undefined;
    }
  }

  public async releasePushSubscriptionMaintenance(
    accountId: string,
    leaseToken: string,
  ): Promise<void> {
    await this.database
      .query()
      .updateTable<PushSubscriptionRow>('mailPushSubscriptions')
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where('accountId', '=', accountId)
      .where('leaseToken', '=', leaseToken)
      .execute();
  }

  public async renewPushSubscriptionMaintenance(
    accountId: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<PushSubscriptionRow>('mailPushSubscriptions')
      .set({ leaseExpiresAt })
      .where('accountId', '=', accountId)
      .where('leaseToken', '=', leaseToken)
      .execute();
    return result.updatedCount === 1;
  }

  public async markPushSubscriptionReplacementNeeded(
    accountId: string,
    leaseToken: string,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<PushSubscriptionRow>('mailPushSubscriptions')
      .set({
        providerSubscriptionId: null,
        configurationFingerprint: null,
        renewAfter: null,
        expiresAt: null,
        updatedAt,
      })
      .where('accountId', '=', accountId)
      .where('leaseToken', '=', leaseToken)
      .execute();
    return result.updatedCount === 1;
  }

  public async deletePushSubscription(accountId: string): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom<PushSubscriptionRow>('mailPushSubscriptions')
      .where('accountId', '=', accountId)
      .execute();
    return result.deletedCount === 1;
  }

  public async saveAccount(account: MailAccount): Promise<MailAccount> {
    await persistAccount(this.database.query(), account);
    return account;
  }

  public async markAccountRemoving(
    accountId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<AccountRow>('mailAccounts')
      .set({ status: 'removing', updatedAt: new Date().toISOString() })
      .where('id', '=', accountId)
      .where('userId', '=', userId)
      .where('status', '!=', 'removing')
      .execute();
    return result.updatedCount === 1;
  }

  public async setDefaultAccount(
    userId: string,
    accountId: string,
  ): Promise<MailAccount> {
    await this.database.transaction(async (connection): Promise<void> => {
      await connection.query
        .updateTable<AccountRow>('mailAccounts')
        .set({ isDefault: false, updatedAt: new Date().toISOString() })
        .where('userId', '=', userId)
        .execute();
      const result = await connection.query
        .updateTable<AccountRow>('mailAccounts')
        .set({ isDefault: true, updatedAt: new Date().toISOString() })
        .where('id', '=', accountId)
        .where('userId', '=', userId)
        .execute();
      if (result.updatedCount !== 1)
        throw new Error('Mail account was not found.');
    });
    const account = await this.getAccount(accountId);
    if (!account) throw new Error('Mail account was not found.');
    return account;
  }

  public async deleteAccount(accountId: string): Promise<boolean> {
    return this.database.transaction(async (connection): Promise<boolean> => {
      const account = await connection.query
        .selectFrom<AccountRow>('mailAccounts')
        .selectAll()
        .where('id', '=', accountId)
        .executeTakeFirst<AccountRow>();
      if (!account) return false;
      const syncRuns = await connection.query
        .selectFrom<SyncRunRow>('mailSyncRuns')
        .select('id')
        .where('accountId', '=', accountId)
        .execute<Pick<SyncRunRow, 'id'>>();
      const submissions = await connection.query
        .selectFrom<SubmissionRow>('mailSubmissions')
        .select('id')
        .where('accountId', '=', accountId)
        .execute<Pick<SubmissionRow, 'id'>>();
      const identities = await connection.query
        .selectFrom<IdentityRow>('mailIdentities')
        .select('id')
        .where('accountId', '=', accountId)
        .execute<Pick<IdentityRow, 'id'>>();
      const aggregateIds = [
        ...syncRuns.map(({ id }) => id),
        ...submissions.map(({ id }) => id),
      ];
      if (aggregateIds.length > 0) {
        await connection.query
          .deleteFrom<OutboxRow>('mailOutbox')
          .where('aggregateId', 'in', aggregateIds)
          .execute();
      }
      if (identities.length > 0) {
        await connection.query
          .deleteFrom<SignatureRow>('mailSignatures')
          .where(
            'identityId',
            'in',
            identities.map((identity) => identity.id),
          )
          .execute();
      }
      for (const table of [
        'mailMessageFolders',
        'mailMessages',
        'mailFolders',
        'mailIdentities',
        'mailPushSubscriptions',
        'mailPushPending',
        'mailSyncStates',
        'mailSyncRuns',
        'mailSubmissions',
      ] as const) {
        await connection.query
          .deleteFrom(table)
          .where('accountId', '=', accountId)
          .execute();
      }
      const deleted = await connection.query
        .deleteFrom<AccountRow>('mailAccounts')
        .where('id', '=', accountId)
        .execute();
      if (account.isDefault) {
        const replacement = await connection.query
          .selectFrom<AccountRow>('mailAccounts')
          .select('id')
          .where('userId', '=', account.userId)
          .orderBy('createdAt', 'asc')
          .executeTakeFirst<Pick<AccountRow, 'id'>>();
        if (replacement) {
          await connection.query
            .updateTable<AccountRow>('mailAccounts')
            .set({ isDefault: true, updatedAt: new Date().toISOString() })
            .where('id', '=', replacement.id)
            .execute();
        }
      }
      return deleted.deletedCount === 1;
    });
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

  public async updateIdentity(
    identityId: string,
    patch: Pick<
      MailIdentity,
      'displayName' | 'signatureText' | 'signatureHtml'
    >,
  ): Promise<MailIdentity | undefined> {
    await this.database
      .query()
      .updateTable<IdentityRow>('mailIdentities')
      .set({
        displayName: patch.displayName ?? null,
        signatureText: patch.signatureText ?? null,
        signatureHtml: patch.signatureHtml ?? null,
      })
      .where('id', '=', identityId)
      .execute();
    return this.getIdentity(identityId);
  }

  public async listSignatures(
    identityId: string,
  ): Promise<readonly MailSignature[]> {
    const rows = await this.database
      .query()
      .selectFrom<SignatureRow>('mailSignatures')
      .selectAll()
      .where('identityId', '=', identityId)
      .orderBy('isDefault', 'desc')
      .orderBy('name', 'asc')
      .execute<SignatureRow>();
    return rows.map(fromSignatureRow);
  }

  public async getSignature(
    signatureId: string,
  ): Promise<MailSignature | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SignatureRow>('mailSignatures')
      .selectAll()
      .where('id', '=', signatureId)
      .executeTakeFirst<SignatureRow>();
    return row ? fromSignatureRow(row) : undefined;
  }

  public async saveSignature(signature: MailSignature): Promise<MailSignature> {
    await this.database.transaction(async (connection): Promise<void> => {
      if (signature.isDefault) {
        await connection.query
          .updateTable<SignatureRow>('mailSignatures')
          .set({ isDefault: false, updatedAt: signature.updatedAt })
          .where('identityId', '=', signature.identityId)
          .execute();
      }
      const existing = await connection.query
        .selectFrom<SignatureRow>('mailSignatures')
        .select('id')
        .where('id', '=', signature.id)
        .executeTakeFirst<Pick<SignatureRow, 'id'>>();
      const row: SignatureRow = { ...signature };
      if (existing) {
        await connection.query
          .updateTable<SignatureRow>('mailSignatures')
          .set(row)
          .where('id', '=', signature.id)
          .execute();
      } else {
        await connection.query
          .insertInto<SignatureRow>('mailSignatures')
          .values(row)
          .execute();
      }
    });
    return signature;
  }

  public async deleteSignature(
    identityId: string,
    signatureId: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom<SignatureRow>('mailSignatures')
      .where('id', '=', signatureId)
      .where('identityId', '=', identityId)
      .execute();
    return result.deletedCount === 1;
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

  public async saveFolder(
    accountId: string,
    folder: NormalizedMailFolder,
  ): Promise<MailFolder> {
    await upsertFolders(this.database.query(), accountId, [folder]);
    const row = await this.database
      .query()
      .selectFrom<FolderRow>('mailFolders')
      .selectAll()
      .where('accountId', '=', accountId)
      .where('providerFolderId', '=', folder.providerFolderId)
      .executeTakeFirst<FolderRow>();
    if (!row) throw new Error('Saved mail label was not found.');
    return fromFolderRow(row);
  }

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

  public async saveMessage(
    accountId: string,
    message: NormalizedMailMessage,
  ): Promise<MailMessage> {
    await this.database.transaction(async (connection): Promise<void> => {
      await upsertMessages(connection.query, accountId, [message]);
    });
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('accountId', '=', accountId)
      .where('providerMessageId', '=', message.providerMessageId)
      .executeTakeFirst<MessageRow>();
    if (!row) throw new Error('Saved mail message was not found.');
    return toMailMessage(row);
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

  public async updateMessageState(
    accountId: string,
    messageId: string,
    state: {
      readonly read?: boolean;
      readonly starred?: boolean;
      readonly note?: string | null;
      readonly todo?: boolean;
    },
  ): Promise<MailMessage | undefined> {
    const values: Partial<MessageRow> = {
      ...(state.read === undefined ? {} : { read: state.read }),
      ...(state.starred === undefined ? {} : { starred: state.starred }),
      ...(state.note === undefined ? {} : { note: state.note }),
      ...(state.todo === undefined ? {} : { todo: state.todo }),
      updatedAt: new Date().toISOString(),
    };
    await this.database
      .query()
      .updateTable<MessageRow>('mailMessages')
      .set(values)
      .where('id', '=', messageId)
      .where('accountId', '=', accountId)
      .execute();
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('id', '=', messageId)
      .where('accountId', '=', accountId)
      .executeTakeFirst<MessageRow>();
    return row ? toMailMessage(row) : undefined;
  }

  public async updateMessageLabels(
    accountId: string,
    messageId: string,
    addLabelIds: readonly string[],
    removeLabelIds: readonly string[],
  ): Promise<MailMessage | undefined> {
    await this.database.transaction(async (connection): Promise<void> => {
      const row = await connection.query
        .selectFrom<MessageRow>('mailMessages')
        .select(['id', 'providerFolderIds'])
        .where('id', '=', messageId)
        .where('accountId', '=', accountId)
        .executeTakeFirst<Pick<MessageRow, 'id' | 'providerFolderIds'>>();
      if (!row) return;
      const nextIds = [
        ...new Set([
          ...parseJson<readonly string[]>(
            row.providerFolderIds,
            'message folder IDs',
          ).filter((id) => !removeLabelIds.includes(id)),
          ...addLabelIds,
        ]),
      ];
      await connection.query
        .updateTable<MessageRow>('mailMessages')
        .set({
          providerFolderIds: JSON.stringify(nextIds),
          updatedAt: new Date().toISOString(),
        })
        .where('id', '=', messageId)
        .execute();
      if (removeLabelIds.length > 0) {
        await connection.query
          .deleteFrom<MessageFolderRow>('mailMessageFolders')
          .where('messageId', '=', messageId)
          .where('providerFolderId', 'in', removeLabelIds)
          .execute();
      }
      for (const providerFolderId of addLabelIds) {
        const exists = await connection.query
          .selectFrom<MessageFolderRow>('mailMessageFolders')
          .select('id')
          .where('messageId', '=', messageId)
          .where('providerFolderId', '=', providerFolderId)
          .executeTakeFirst();
        if (!exists) {
          await connection.query
            .insertInto<MessageFolderRow>('mailMessageFolders')
            .values({
              id: randomUUID(),
              accountId,
              messageId,
              providerFolderId,
            })
            .execute();
        }
      }
    });
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('id', '=', messageId)
      .where('accountId', '=', accountId)
      .executeTakeFirst<MessageRow>();
    return row ? toMailMessage(row) : undefined;
  }

  public async countUnreadMessages(userId: string): Promise<number> {
    const accounts = await this.listAccounts(userId);
    if (accounts.length === 0) return 0;
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .select((builder) => [builder.fn.countAll<number>().as('count')])
      .where(
        'accountId',
        'in',
        accounts.map((account) => account.id),
      )
      .where('read', '=', false)
      .executeTakeFirst<{ readonly count: number | string }>();
    return Number(row?.count ?? 0);
  }

  public async moveMessage(
    accountId: string,
    messageId: string,
    providerMessageId: string,
    providerFolderId: string,
  ): Promise<MailMessage | undefined> {
    await this.database.transaction(async (connection): Promise<void> => {
      const updated = await connection.query
        .updateTable<MessageRow>('mailMessages')
        .set({
          providerMessageId,
          providerFolderIds: JSON.stringify([providerFolderId]),
          updatedAt: new Date().toISOString(),
        })
        .where('id', '=', messageId)
        .where('accountId', '=', accountId)
        .execute();
      if (updated.updatedCount !== 1) return;
      await connection.query
        .deleteFrom<MessageFolderRow>('mailMessageFolders')
        .where('accountId', '=', accountId)
        .where('messageId', '=', messageId)
        .execute();
      await connection.query
        .insertInto<MessageFolderRow>('mailMessageFolders')
        .values({
          id: randomUUID(),
          accountId,
          messageId,
          providerFolderId,
        })
        .execute();
    });
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('id', '=', messageId)
      .where('accountId', '=', accountId)
      .executeTakeFirst<MessageRow>();
    return row ? toMailMessage(row) : undefined;
  }

  public async deleteMessage(
    accountId: string,
    messageId: string,
  ): Promise<boolean> {
    return this.database.transaction(async (connection): Promise<boolean> => {
      await connection.query
        .deleteFrom<MessageFolderRow>('mailMessageFolders')
        .where('accountId', '=', accountId)
        .where('messageId', '=', messageId)
        .execute();
      const deleted = await connection.query
        .deleteFrom<MessageRow>('mailMessages')
        .where('accountId', '=', accountId)
        .where('id', '=', messageId)
        .execute();
      return deleted.deletedCount === 1;
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

  public async clearSyncCursor(accountId: string): Promise<void> {
    await this.database
      .query()
      .deleteFrom('mailSyncStates')
      .where('accountId', '=', accountId)
      .execute();
  }

  public async markPushSyncPending(
    accountId: string,
    requestedBy: string,
    requestToken: string,
  ): Promise<void> {
    const requestedAt = new Date().toISOString();
    const updated = await this.database
      .query()
      .updateTable<PushPendingRow>('mailPushPending')
      .set({ requestedBy, requestToken, requestedAt })
      .where('accountId', '=', accountId)
      .execute();
    if (updated.updatedCount === 1) return;
    try {
      await this.database
        .query()
        .insertInto<PushPendingRow>('mailPushPending')
        .values({ accountId, requestedBy, requestToken, requestedAt })
        .execute();
    } catch (error) {
      const raced = await this.database
        .query()
        .updateTable<PushPendingRow>('mailPushPending')
        .set({ requestedBy, requestToken, requestedAt })
        .where('accountId', '=', accountId)
        .execute();
      if (raced.updatedCount !== 1) throw error;
    }
  }

  public async markPushSyncPendingBatch(
    accounts: readonly {
      readonly accountId: string;
      readonly requestedBy: string;
    }[],
    requestToken: string,
  ): Promise<void> {
    const unique = [
      ...new Map(accounts.map((item) => [item.accountId, item])).values(),
    ];
    if (unique.length === 0) return;
    const requestedAt = new Date().toISOString();
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.database.transaction(async (connection): Promise<void> => {
          const existingIds = await connection.query
            .selectFrom<PushPendingRow>('mailPushPending')
            .where(
              'accountId',
              'in',
              unique.map(({ accountId }) => accountId),
            )
            .pluck<string>('accountId');
          if (existingIds.length > 0) {
            await connection.query
              .updateTable<PushPendingRow>('mailPushPending')
              .set({ requestToken, requestedAt })
              .where('accountId', 'in', existingIds)
              .execute();
          }
          const existing = new Set(existingIds);
          const missing = unique.filter(
            ({ accountId }) => !existing.has(accountId),
          );
          if (missing.length === 0) return;
          await connection.query
            .insertInto<PushPendingRow>('mailPushPending')
            .values(
              missing.map(({ accountId, requestedBy }) => ({
                accountId,
                requestedBy,
                requestToken,
                requestedAt,
              })),
            )
            .execute();
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  public async clearPushSyncPending(
    accountId: string,
    requestToken: string,
  ): Promise<void> {
    await this.database
      .query()
      .deleteFrom<PushPendingRow>('mailPushPending')
      .where('accountId', '=', accountId)
      .where('requestToken', '=', requestToken)
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

  public async listSyncRuns(userId: string): Promise<readonly MailSyncRun[]> {
    const accounts = await this.listAccounts(userId);
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

  public async listSubmissions(
    userId: string,
  ): Promise<readonly MailStoredSubmission[]> {
    const accounts = await this.listAccounts(userId);
    if (accounts.length === 0) return [];
    const rows = await this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .selectAll()
      .where(
        'accountId',
        'in',
        accounts.map((account) => account.id),
      )
      .orderBy('createdAt', 'desc')
      .limit(100)
      .execute<SubmissionRow>();
    return rows.map(fromSubmissionRow);
  }

  public async listAllSubmissions(): Promise<readonly MailStoredSubmission[]> {
    const rows = await this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute<SubmissionRow>();
    return rows.map(fromSubmissionRow);
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
    return {
      ...submission,
      requestFingerprint,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async createScheduledSubmission(
    submission: MailSubmission,
    idempotencyKey: string,
    requestFingerprint: string,
    actorId: string,
    input: MailComposeInput,
  ): Promise<MailStoredSubmission> {
    const scheduledAt = submission.scheduledAt;
    if (!scheduledAt) throw new Error('Scheduled submission time is required.');
    const now = new Date().toISOString();
    try {
      await this.database.transaction(async (connection): Promise<void> => {
        await connection.query
          .insertInto<SubmissionRow>('mailSubmissions')
          .values({
            ...submission,
            idempotencyKey,
            requestFingerprint,
            scheduledAt,
            requestedBy: actorId,
            composeInput: JSON.stringify(input),
            error: jsonOrNull(submission.error),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await connection.query
          .insertInto<OutboxRow>('mailOutbox')
          .values({
            id: randomUUID(),
            type: 'sendScheduledMail',
            aggregateId: submission.id,
            deduplicationKey: `scheduled-send:${submission.id}`,
            payload: JSON.stringify({
              version: 1,
              submissionId: submission.id,
            }),
            status: 'pending',
            attempts: 0,
            availableAt: scheduledAt,
            createdAt: now,
          })
          .execute();
      });
    } catch (error) {
      const existing = await this.getSubmissionByIdempotencyKey(
        submission.accountId,
        idempotencyKey,
      );
      if (existing) return existing;
      throw error;
    }
    return {
      ...submission,
      requestFingerprint,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async getScheduledSubmission(
    submissionId: string,
  ): Promise<MailScheduledSubmission | undefined> {
    const row = await this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .selectAll()
      .where('id', '=', submissionId)
      .executeTakeFirst<SubmissionRow>();
    if (!row?.requestedBy || !row.composeInput) return undefined;
    return {
      actorId: row.requestedBy,
      input: parseJson<MailComposeInput>(row.composeInput, 'scheduled input'),
      submission: fromSubmissionRow(row),
    };
  }

  public async clearScheduledSubmission(submissionId: string): Promise<void> {
    await this.database
      .query()
      .updateTable<SubmissionRow>('mailSubmissions')
      .set({ requestedBy: null, composeInput: null })
      .where('id', '=', submissionId)
      .execute();
  }

  public async failScheduledSubmission(
    submissionId: string,
    error: MailProviderError,
  ): Promise<void> {
    await this.database
      .query()
      .updateTable<SubmissionRow>('mailSubmissions')
      .set({
        status: 'failed',
        error: JSON.stringify(error),
        requestedBy: null,
        composeInput: null,
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', submissionId)
      .where('status', '=', 'pending')
      .execute();
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
    .select(['id', 'providerMessageId', 'createdAt', 'note', 'todo'])
    .where('accountId', '=', accountId)
    .where(
      'providerMessageId',
      'in',
      uniqueMessages.map((message) => message.providerMessageId),
    )
    .execute<
      Pick<
        MessageRow,
        'id' | 'providerMessageId' | 'createdAt' | 'note' | 'todo'
      >
    >();
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
      existing,
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
    address: normalizeAddress(account.address),
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
  return { ...identity, address: normalizeAddress(identity.address) };
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function fromIdentityRow(row: IdentityRow): MailIdentity {
  return {
    id: row.id,
    accountId: row.accountId,
    address: row.address,
    displayName: row.displayName ?? undefined,
    signatureText: row.signatureText ?? undefined,
    signatureHtml: row.signatureHtml ?? undefined,
    isPrimary: Boolean(row.isPrimary),
    canSend: Boolean(row.canSend),
  };
}

function fromSignatureRow(row: SignatureRow): MailSignature {
  return {
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    text: row.text,
    html: row.html ?? undefined,
    isDefault: Boolean(row.isDefault),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toMailTemplate(row: TemplateRow): MailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    text: row.text ?? undefined,
    html: row.html ?? '',
    scope: row.scope,
    ownerId: row.ownerId,
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
  local?: Pick<MessageRow, 'note' | 'todo'>,
): MessageRow {
  return {
    id,
    accountId,
    providerMessageId: message.providerMessageId,
    providerDraftId: message.providerDraftId,
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
    note: local?.note ?? null,
    todo: local?.todo ?? false,
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
    providerDraftId: row.providerDraftId ?? undefined,
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
    note: row.note ?? undefined,
    todo: Boolean(row.todo),
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
    scheduledAt: row.scheduledAt ? toIsoString(row.scheduledAt) : undefined,
    error: row.error
      ? parseJson<MailProviderError>(row.error, 'submission error')
      : undefined,
    requestFingerprint: row.requestFingerprint,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function fromPushSubscriptionRow(
  row: PushSubscriptionRow,
): MailProviderPushSubscription {
  return {
    accountId: row.accountId,
    provider: { type: row.providerType, name: row.providerName },
    providerSubscriptionId: row.providerSubscriptionId!,
    configurationFingerprint: row.configurationFingerprint!,
    renewAfter: toIsoString(row.renewAfter!),
    expiresAt: toIsoString(row.expiresAt!),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function completePushSubscription(row: PushSubscriptionRow): boolean {
  return Boolean(
    row.providerSubscriptionId &&
    row.configurationFingerprint &&
    row.renewAfter &&
    row.expiresAt,
  );
}

function fromOutboxRow(row: OutboxRow): MailOutboxRecord {
  const base = {
    id: row.id,
    aggregateId: row.aggregateId,
    deduplicationKey: row.deduplicationKey,
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
  return row.type === 'syncMailbox'
    ? {
        ...base,
        type: 'syncMailbox',
        payload: parseJson<MailSyncMailboxTaskPayload>(
          row.payload as string | MailSyncMailboxTaskPayload,
          'sync outbox payload',
        ),
      }
    : {
        ...base,
        type: 'sendScheduledMail',
        payload: parseJson<MailScheduledSendTaskPayload>(
          row.payload as string | MailScheduledSendTaskPayload,
          'scheduled send outbox payload',
        ),
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

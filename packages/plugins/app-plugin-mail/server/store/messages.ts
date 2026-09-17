import { type DatabaseManager } from '@nocobase/db';
import {
  MAIL_LOCAL_DRAFT_FOLDER_ID,
  type MailAccount,
  type MailFolder,
  type MailListConversationMessagesInput,
  type MailListMessagesInput,
  type MailMessage,
  type MailMessageSummary,
  type MailPage,
  type MailStore,
  type NormalizedMailMessage,
} from '../types.js';
import { encodeMessageCursor, parseMessageCursor } from './message-cursor.js';
import {
  conversationGroupKey,
  countMessageConversations,
  loadMailMessages,
  loadMailMessageSummaries,
} from './message-queries.js';
import { upsertMessages } from './message-writes.js';
import {
  type MessageFolderRow,
  type MessageLabelRow,
  type MessageRow,
} from './rows.js';

const SYNTHETIC_FOLDER_TYPES: Readonly<Record<string, MailFolder['type']>> = {
  __nocobase_default_inbox__: 'inbox',
  __nocobase_default_sent__: 'sent',
  __nocobase_default_trash__: 'trash',
  __nocobase_default_junk__: 'junk',
  __nocobase_default_archive__: 'archive',
};

export class MailMessagesStore {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly accounts: Pick<
      MailStore,
      'listAccounts' | 'listAllAccounts' | 'getAccount'
    >,
  ) {}

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
    return (await loadMailMessages(this.database.query(), [row]))[0];
  }

  public async listMessages(
    userId: string,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    const owned = await this.accounts.listAccounts(userId);
    const requested = input.accountIds
      ? owned.filter((account) => input.accountIds?.includes(account.id))
      : owned;
    return this.listMessagesForAccounts(requested, input, true);
  }

  public async listAllMessages(
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    const accounts = await this.accounts.listAllAccounts();
    const requested = input.accountIds
      ? accounts.filter((account) => input.accountIds?.includes(account.id))
      : accounts;
    return this.listMessagesForAccounts(requested, input);
  }

  private async listMessagesForAccounts(
    requested: readonly MailAccount[],
    input: MailListMessagesInput,
    draftsOnlyInDraftFolders = false,
  ): Promise<MailPage<MailMessageSummary>> {
    if (
      input.offset !== undefined &&
      (!Number.isSafeInteger(input.offset) || input.offset < 0)
    )
      throw new TypeError('Mail message offset must be a nonnegative integer.');
    if (input.offset !== undefined && input.cursor !== undefined)
      throw new TypeError('Mail message offset and cursor cannot be combined.');
    if (requested.length === 0)
      return { items: [], ...(input.withTotal ? { total: 0 } : {}) };
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const cursor = parseMessageCursor(input.cursor);
    let query = this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .select([
        'mailMessages.id',
        'mailMessages.accountId',
        'mailMessages.providerMessageId',
        'mailMessages.providerDraftId',
        'mailMessages.providerDraftMessageId',
        'mailMessages.internetMessageId',
        'mailMessages.providerConversationId',
        'mailMessages.sender',
        'mailMessages.recipients',
        'mailMessages.subject',
        'mailMessages.preview',
        'mailMessages.receivedAt',
        'mailMessages.sentAt',
        'mailMessages.sortAt',
        'mailMessages.read',
        'mailMessages.starred',
        'mailMessages.draft',
        'mailMessages.attachments',
        'mailMessages.note',
        'mailMessages.todo',
      ])
      .where(
        'mailMessages.accountId',
        'in',
        requested.map((account) => account.id),
      );
    const requestedFolderId =
      input.folderIds?.length === 1 ? input.folderIds[0] : undefined;
    const syntheticFolderType = requestedFolderId
      ? SYNTHETIC_FOLDER_TYPES[requestedFolderId]
      : undefined;
    if (requestedFolderId === MAIL_LOCAL_DRAFT_FOLDER_ID) {
      query = query.where('mailMessages.draft', '=', true);
    } else if (syntheticFolderType) {
      query = query
        .innerJoin(
          'mailMessageFolders',
          'mailMessages.id',
          'mailMessageFolders.messageId',
        )
        .innerJoin('mailFolders', (join) =>
          join
            .onRef('mailFolders.accountId', '=', 'mailMessages.accountId')
            .onRef(
              'mailFolders.providerFolderId',
              '=',
              'mailMessageFolders.providerFolderId',
            )
            .on('mailFolders.type', '=', syntheticFolderType),
        )
        .distinct();
    } else if (input.folderIds?.length) {
      query = query
        .innerJoin(
          'mailMessageFolders',
          'mailMessages.id',
          'mailMessageFolders.messageId',
        )
        .where('mailMessageFolders.providerFolderId', 'in', input.folderIds)
        .distinct();
    }
    if (
      draftsOnlyInDraftFolders &&
      requestedFolderId !== MAIL_LOCAL_DRAFT_FOLDER_ID
    ) {
      query =
        input.folderIds?.length && !syntheticFolderType
          ? query.where((builder) =>
              builder.eb.or([
                builder.eb('mailMessages.draft', '=', false),
                builder.exists(
                  builder
                    .selectFrom('mailFolders')
                    .select('id')
                    .whereRef(
                      'mailFolders.accountId',
                      '=',
                      'mailMessages.accountId',
                    )
                    .whereRef(
                      'mailFolders.providerFolderId',
                      '=',
                      'mailMessageFolders.providerFolderId',
                    )
                    .where('mailFolders.type', '=', 'drafts'),
                ),
              ]),
            )
          : query.where('mailMessages.draft', '=', false);
    }
    if (input.labelIds?.length) {
      query = query
        .innerJoin(
          'mailMessageLabels',
          'mailMessages.id',
          'mailMessageLabels.messageId',
        )
        .where('mailMessageLabels.labelId', 'in', input.labelIds)
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
          builder.eb('mailMessages.sender', 'like', `%${input.query}%`),
          builder.eb('mailMessages.recipients', 'like', `%${input.query}%`),
        ]),
      );
    const count = input.withTotal
      ? await query
          .clearSelect()
          .select(({ fn }) => [
            fn.count('mailMessages.id').distinct().as('count'),
          ])
          .executeTakeFirst<{ readonly count: number | string }>()
      : undefined;
    const total = input.withTotal ? Number(count?.count ?? 0) : undefined;
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
    if (input.offset !== undefined) query = query.offset(input.offset);
    const rows = await query
      .orderBy('mailMessages.sortAt', 'desc')
      .orderBy('mailMessages.id', 'desc')
      .limit(limit + 1)
      .execute<MessageRow>();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items.at(-1);
    const loaded = await loadMailMessageSummaries(this.database.query(), items);
    const conversationCounts = await countMessageConversations(
      this.database.query(),
      requested.map((account) => account.id),
      items,
    );
    return {
      ...(total === undefined ? {} : { total }),
      items: loaded.map((message) => ({
        ...message,
        ...(message.conversationId
          ? {
              subjectCount:
                conversationCounts.get(
                  conversationGroupKey(
                    message.accountId,
                    message.conversationId,
                  ),
                ) ?? 1,
            }
          : {}),
      })),
      nextCursor:
        hasMore && lastItem ? encodeMessageCursor(lastItem) : undefined,
    };
  }

  public async getMessage(
    userId: string,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined> {
    const account = await this.accounts.getAccount(accountId);
    if (!account || account.userId !== userId) return undefined;
    return this.getMessageForAccount(accountId, messageId);
  }

  public async getMessageForAccount(
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined> {
    const row = await this.database
      .query()
      .selectFrom<MessageRow>('mailMessages')
      .selectAll()
      .where('id', '=', messageId)
      .where('accountId', '=', accountId)
      .executeTakeFirst<MessageRow>();
    return row
      ? (await loadMailMessages(this.database.query(), [row]))[0]
      : undefined;
  }

  public async listConversationMessages(
    userId: string,
    accountId: string,
    conversationId: string,
    input: MailListConversationMessagesInput = {},
  ): Promise<MailPage<MailMessage>> {
    const account = await this.accounts.getAccount(accountId);
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
      items: await loadMailMessages(
        this.database.query(),
        [...items].reverse(),
      ),
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
    return row
      ? (await loadMailMessages(this.database.query(), [row]))[0]
      : undefined;
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
        .select('id')
        .where('id', '=', messageId)
        .where('accountId', '=', accountId)
        .executeTakeFirst<Pick<MessageRow, 'id'>>();
      if (!row) return;
      await connection.query
        .updateTable<MessageRow>('mailMessages')
        .set({ updatedAt: new Date().toISOString() })
        .where('id', '=', messageId)
        .execute();
      if (removeLabelIds.length > 0) {
        await connection.query
          .deleteFrom<MessageLabelRow>('mailMessageLabels')
          .where('messageId', '=', messageId)
          .where('labelId', 'in', removeLabelIds)
          .execute();
      }
      for (const labelId of addLabelIds) {
        const exists = await connection.query
          .selectFrom<MessageLabelRow>('mailMessageLabels')
          .select('messageId')
          .where('messageId', '=', messageId)
          .where('labelId', '=', labelId)
          .executeTakeFirst();
        if (!exists) {
          await connection.query
            .insertInto<MessageLabelRow>('mailMessageLabels')
            .values({
              messageId,
              labelId,
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
    return row
      ? (await loadMailMessages(this.database.query(), [row]))[0]
      : undefined;
  }

  public async countUnreadMessages(userId: string): Promise<number> {
    const accounts = await this.accounts.listAccounts(userId);
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
    return row
      ? (await loadMailMessages(this.database.query(), [row]))[0]
      : undefined;
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
      await connection.query
        .deleteFrom<MessageLabelRow>('mailMessageLabels')
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
}

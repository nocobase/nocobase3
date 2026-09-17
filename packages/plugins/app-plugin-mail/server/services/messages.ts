import { notifyMailMessageChange } from '../realtime.js';
import {
  type MailFolder,
  type MailListConversationMessagesInput,
  type MailListMessagesInput,
  type MailMessage,
  type MailMessageSummary,
  type MailOperationContext,
  type MailPage,
  type MailProviderAdapter,
} from '../types.js';
import { requireOwnedAccount, requireOwnedMessage } from './access.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';
import { isLocalDraftMessage } from './draft-content.js';
import { assertProviderResult } from './errors.js';
import { closeAdapter } from './provider-lifecycle.js';

export class MailMessagesService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      'store' | 'messageChangeNotifier' | 'logger' | 'adapters'
    >,
  ) {}

  public async listFolders(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailFolder[]> {
    await requireOwnedAccount(this.dependencies.store, context, accountId);
    return this.dependencies.store.listFolders(accountId);
  }

  public async updateMessageLabels(
    context: MailOperationContext,
    input: import('../types.js').MailUpdateMessageLabelsInput,
  ): Promise<MailMessage> {
    const { message } = await requireOwnedMessage(
      this.dependencies.store,
      context,
      input.accountId,
      input.messageId,
    );
    const add = [...new Set(input.addLabelIds ?? [])];
    const remove = [...new Set(input.removeLabelIds ?? [])].filter(
      (id) => !add.includes(id),
    );
    const labels = new Set(
      (await this.dependencies.store.listLabels(context.actorId)).map(
        (label) => label.id,
      ),
    );
    if ([...add, ...remove].some((id) => !labels.has(id))) {
      throw new TypeError('Mail label was not found.');
    }
    if (add.length === 0 && remove.length === 0) return message;
    const updated = await this.dependencies.store.updateMessageLabels(
      input.accountId,
      message.id,
      add,
      remove,
    );
    if (!updated) throw new Error('Mail message was not found after update.');
    notifyMailMessageChange(
      this.dependencies.messageChangeNotifier,
      context.actorId,
      this.dependencies.logger,
    );
    return updated;
  }

  public getUnreadCount(context: MailOperationContext): Promise<number> {
    return this.dependencies.store.countUnreadMessages(context.actorId);
  }

  public listMessages(
    context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    return this.dependencies.store.listMessages(context.actorId, input);
  }

  public async retryMessageContent(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage> {
    const { account, message } = await requireOwnedMessage(
      this.dependencies.store,
      context,
      accountId,
      messageId,
    );
    if (!message.contentStatus || message.contentStatus === 'complete')
      return message;
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.getMessage)
        throw new Error('The mail Provider cannot load message content.');
      const refreshed = assertProviderResult(
        await adapter.getMessage(message.providerMessageId, context.signal),
      );
      const saved = await this.dependencies.store.saveMessageContent(
        accountId,
        messageId,
        refreshed,
      );
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
        this.dependencies.logger,
      );
      return saved;
    } finally {
      await closeAdapter(adapter);
    }
  }

  public getMessage(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined> {
    return this.dependencies.store.getMessage(
      context.actorId,
      accountId,
      messageId,
    );
  }

  public async listConversationMessages(
    context: MailOperationContext,
    accountId: string,
    conversationId: string,
    input: MailListConversationMessagesInput = {},
  ): Promise<MailPage<MailMessage>> {
    await requireOwnedAccount(this.dependencies.store, context, accountId);
    return this.dependencies.store.listConversationMessages(
      context.actorId,
      accountId,
      conversationId,
      input,
    );
  }

  public async updateMessage(
    context: MailOperationContext,
    input: import('../types.js').MailUpdateMessageInput,
  ): Promise<MailMessage> {
    const { account, message } = await requireOwnedMessage(
      this.dependencies.store,
      context,
      input.accountId,
      input.messageId,
    );
    if (
      input.read === undefined &&
      input.starred === undefined &&
      input.note === undefined &&
      input.todo === undefined
    )
      return message;
    if (input.read === undefined && input.starred === undefined) {
      const updated = await this.dependencies.store.updateMessageState(
        account.id,
        message.id,
        { note: input.note, todo: input.todo },
      );
      if (!updated) throw new Error('Mail message was not found after update.');
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
        this.dependencies.logger,
      );
      return updated;
    }
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (input.read !== undefined) {
        if (!adapter.setRead)
          throw new Error(
            'The selected Mail Provider cannot change read state.',
          );
        assertProviderResult(
          await adapter.setRead(
            message.providerMessageId,
            input.read,
            context.signal,
          ),
        );
      }
      if (input.starred !== undefined) {
        if (!adapter.setStarred)
          throw new Error(
            'The selected Mail Provider cannot change starred state.',
          );
        assertProviderResult(
          await adapter.setStarred(
            message.providerMessageId,
            input.starred,
            context.signal,
          ),
        );
      }
      const updated = await this.dependencies.store.updateMessageState(
        account.id,
        message.id,
        {
          read: input.read,
          starred: input.starred,
          note: input.note,
          todo: input.todo,
        },
      );
      if (!updated) throw new Error('Mail message was not found after update.');
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
        this.dependencies.logger,
      );
      return updated;
    } finally {
      await closeAdapter(adapter);
    }
  }

  public async moveMessage(
    context: MailOperationContext,
    input: import('../types.js').MailMoveMessageInput,
  ): Promise<MailMessage> {
    const { account, message } = await requireOwnedMessage(
      this.dependencies.store,
      context,
      input.accountId,
      input.messageId,
    );
    const folder = (await this.dependencies.store.listFolders(account.id)).find(
      (item) => item.providerFolderId === input.providerFolderId,
    );
    if (!folder) throw new Error('Mail destination folder was not found.');
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.capabilities.moveMessage || !adapter.moveMessage) {
        throw new Error('The selected Mail Provider cannot move messages.');
      }
      const moved = assertProviderResult(
        await adapter.moveMessage(
          message.providerMessageId,
          input.providerFolderId,
          context.signal,
        ),
      );
      const updated = await this.dependencies.store.moveMessage(
        account.id,
        message.id,
        moved.providerMessageId,
        input.providerFolderId,
      );
      if (!updated) throw new Error('Mail message was not found after move.');
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
        this.dependencies.logger,
      );
      return updated;
    } finally {
      await closeAdapter(adapter);
    }
  }

  public async deleteMessage(
    context: MailOperationContext,
    input: import('../types.js').MailDeleteMessageInput,
  ): Promise<void> {
    const { account, message } = await requireOwnedMessage(
      this.dependencies.store,
      context,
      input.accountId,
      input.messageId,
    );
    if (isLocalDraftMessage(message)) {
      let adapter: MailProviderAdapter | undefined;
      try {
        if (message.providerDraftMessageId) {
          adapter = await this.dependencies.adapters.resolve(
            account,
            context.signal,
          );
          if (adapter.deleteMessage) {
            await adapter.deleteMessage(
              message.providerDraftMessageId,
              true,
              context.signal,
            );
          }
        }
      } catch {
        // Remote draft cleanup is best effort; local deletion remains authoritative.
      } finally {
        if (adapter) await closeAdapter(adapter);
      }
      const deleted = await this.dependencies.store.deleteMessage(
        account.id,
        message.id,
      );
      if (deleted) {
        notifyMailMessageChange(
          this.dependencies.messageChangeNotifier,
          context.actorId,
          this.dependencies.logger,
        );
      }
      return;
    }
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!input.permanently && adapter.moveMessage) {
        const trash = (
          await this.dependencies.store.listFolders(account.id)
        ).find((folder) => folder.type === 'trash');
        if (trash) {
          const moved = assertProviderResult(
            await adapter.moveMessage(
              message.providerMessageId,
              trash.providerFolderId,
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.moveMessage(
            account.id,
            message.id,
            moved.providerMessageId,
            trash.providerFolderId,
          );
          if (!updated)
            throw new Error('Mail message was not found after delete.');
          notifyMailMessageChange(
            this.dependencies.messageChangeNotifier,
            context.actorId,
            this.dependencies.logger,
          );
          return;
        }
      }
      if (!adapter.deleteMessage) {
        throw new Error('The selected Mail Provider cannot delete messages.');
      }
      assertProviderResult(
        await adapter.deleteMessage(
          message.providerMessageId,
          input.permanently ?? false,
          context.signal,
        ),
      );
      const deleted = await this.dependencies.store.deleteMessage(
        account.id,
        message.id,
      );
      if (deleted) {
        notifyMailMessageChange(
          this.dependencies.messageChangeNotifier,
          context.actorId,
          this.dependencies.logger,
        );
      }
    } finally {
      await closeAdapter(adapter);
    }
  }
}

import { notifyMailMessageChange } from '../realtime.js';
import {
  type MailFolder,
  type MailListMessagesInput,
  type MailManagedAccountView,
  type MailManagementMessageActionInput,
  type MailManagementMessageActionItemResult,
  type MailManagementMessageActionResult,
  type MailMessage,
  type MailMessageSummary,
  type MailOperationContext,
  type MailPage,
} from '../types.js';
import {
  toMailAccountView,
  toSubmissionLogView,
  toSyncRunView,
} from '../views.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';
import {
  assertManagedProviderResult,
  toManagementActionError,
} from './errors.js';
import { closeAdapter } from './provider-lifecycle.js';

export class MailManagementService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      | 'store'
      | 'adapters'
      | 'messageChangeNotifier'
      | 'logger'
      | 'registry'
      | 'users'
    >,
  ) {}

  public async listManagedAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailManagedAccountView[]> {
    const accounts = await this.dependencies.store.listAllAccounts();
    const ownerNames = new Map<string, string>();
    if (this.dependencies.users) {
      const userIds = [...new Set(accounts.map((account) => account.userId))];
      for (let offset = 0; offset < userIds.length; offset += 100) {
        const { items } = await this.dependencies.users.list({
          userIds: userIds.slice(offset, offset + 100),
          pageSize: 100,
        });
        for (const user of items) {
          ownerNames.set(user.id, user.username?.trim() || user.name);
        }
      }
    }
    return accounts.map((account) => ({
      ...toMailAccountView(account),
      ownerName: ownerNames.get(account.userId),
      canSync: account.userId === context.actorId,
      canMoveMessages:
        this.dependencies.registry?.definition(account.provider.type)
          ?.capabilities.moveMessage ?? false,
    }));
  }

  public async listManagedOperationLogs(
    context: MailOperationContext,
  ): Promise<import('../types.js').MailManagedOperationLogsView> {
    const [accounts, syncRuns, submissions] = await Promise.all([
      this.dependencies.store.listAllAccounts(),
      this.dependencies.store.listAllSyncRuns(),
      this.dependencies.store.listAllSubmissions(),
    ]);
    return {
      accounts: accounts.map(toMailAccountView),
      syncRuns: syncRuns.map((run) => ({
        ...toSyncRunView(run),
        canManage:
          accounts.find((account) => account.id === run.accountId)?.userId ===
          context.actorId,
      })),
      submissions: submissions.map(toSubmissionLogView),
    };
  }

  public listManagedFolders(
    _context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailFolder[]> {
    return this.dependencies.store.listFolders(accountId);
  }

  public listManagedMessages(
    _context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    return this.dependencies.store.listAllMessages(input);
  }

  public getManagedMessage(
    _context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined> {
    return this.dependencies.store.getMessageForAccount(accountId, messageId);
  }

  public async manageMessages(
    context: MailOperationContext,
    input: MailManagementMessageActionInput,
  ): Promise<MailManagementMessageActionResult> {
    const items: MailManagementMessageActionItemResult[] = [];
    for (const target of input.items) {
      try {
        await this.executeManagedMessageAction(context, target, input);
        items.push({ ...target, status: 'succeeded' });
      } catch (cause) {
        items.push({
          ...target,
          status: 'failed',
          error: toManagementActionError(cause),
        });
      }
    }
    return {
      items,
      succeeded: items.filter((item) => item.status === 'succeeded').length,
      failed: items.filter((item) => item.status === 'failed').length,
    };
  }

  private async executeManagedMessageAction(
    context: MailOperationContext,
    target: MailManagementMessageActionInput['items'][number],
    input: MailManagementMessageActionInput,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(target.accountId);
    if (!account) throw new Error('Mail account was not found.');
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    const message = await this.dependencies.store.getMessageForAccount(
      account.id,
      target.messageId,
    );
    if (!message) throw new Error('Mail message was not found.');
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      switch (input.action) {
        case 'markRead':
        case 'markUnread': {
          if (!adapter.setRead) {
            throw new Error(
              'The selected Mail Provider cannot change read state.',
            );
          }
          assertManagedProviderResult(
            await adapter.setRead(
              message.providerMessageId,
              input.action === 'markRead',
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.updateMessageState(
            account.id,
            message.id,
            { read: input.action === 'markRead' },
          );
          if (!updated)
            throw new Error('Mail message was not found after update.');
          break;
        }
        case 'star':
        case 'unstar': {
          if (!adapter.setStarred) {
            throw new Error(
              'The selected Mail Provider cannot change starred state.',
            );
          }
          assertManagedProviderResult(
            await adapter.setStarred(
              message.providerMessageId,
              input.action === 'star',
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.updateMessageState(
            account.id,
            message.id,
            { starred: input.action === 'star' },
          );
          if (!updated)
            throw new Error('Mail message was not found after update.');
          break;
        }
        case 'archive':
        case 'move': {
          const destination =
            input.action === 'archive'
              ? (await this.dependencies.store.listFolders(account.id)).find(
                  (folder) => folder.type === 'archive',
                )
              : input.providerFolderId
                ? (await this.dependencies.store.listFolders(account.id)).find(
                    (folder) =>
                      folder.providerFolderId === input.providerFolderId,
                  )
                : undefined;
          if (!destination) {
            throw new Error('Mail destination folder was not found.');
          }
          if (!adapter.capabilities.moveMessage || !adapter.moveMessage) {
            throw new Error('The selected Mail Provider cannot move messages.');
          }
          const moved = assertManagedProviderResult(
            await adapter.moveMessage(
              message.providerMessageId,
              destination.providerFolderId,
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.moveMessage(
            account.id,
            message.id,
            moved.providerMessageId,
            destination.providerFolderId,
          );
          if (!updated)
            throw new Error('Mail message was not found after move.');
          break;
        }
        case 'delete': {
          if (
            !input.permanently &&
            adapter.capabilities.moveMessage &&
            adapter.moveMessage
          ) {
            const trash = (
              await this.dependencies.store.listFolders(account.id)
            ).find((folder) => folder.type === 'trash');
            if (trash) {
              const moved = assertManagedProviderResult(
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
              break;
            }
          }
          if (!adapter.deleteMessage) {
            throw new Error(
              'The selected Mail Provider cannot delete messages.',
            );
          }
          assertManagedProviderResult(
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
          if (!deleted)
            throw new Error('Mail message was not found after delete.');
          break;
        }
      }
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        account.userId,
        this.dependencies.logger,
      );
    } finally {
      await closeAdapter(adapter);
    }
  }
}

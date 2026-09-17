import { MailMessageMutations } from '../operations/message-mutations.js';
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
} from '../../shared/mail.js';
import {
  toMailAccountView,
  toSubmissionLogView,
  toSyncRunView,
} from '../views.js';
import { type MailServiceDependencies } from './dependencies.js';
import { toManagementActionError } from './errors.js';

/** Trusted management entry: callers must authorize mail.management access. */
export class MailManagementService {
  private readonly mutations: MailMessageMutations;
  public constructor(
    private readonly dependencies: MailServiceDependencies<
      | 'deleteMessage'
      | 'getAccount'
      | 'getMessageForAccount'
      | 'listAllAccounts'
      | 'listAllMessages'
      | 'listAllSubmissions'
      | 'listAllSyncRuns'
      | 'listFolders'
      | 'moveMessage'
      | 'updateMessageState',
      'adapters' | 'messageChangeNotifier' | 'logger' | 'registry' | 'users'
    >,
  ) {
    this.mutations = new MailMessageMutations(dependencies);
  }

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
  ): Promise<import('../../shared/mail.js').MailManagedOperationLogsView> {
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
    const targetInput = { accountId: account.id, messageId: message.id };
    switch (input.action) {
      case 'markRead':
      case 'markUnread':
        await this.mutations.updateMessage(context, account, message, {
          ...targetInput,
          read: input.action === 'markRead',
        });
        return;
      case 'star':
      case 'unstar':
        await this.mutations.updateMessage(context, account, message, {
          ...targetInput,
          starred: input.action === 'star',
        });
        return;
      case 'archive':
      case 'move': {
        const destination = (
          await this.dependencies.store.listFolders(account.id)
        ).find((folder) =>
          input.action === 'archive'
            ? folder.type === 'archive'
            : folder.providerFolderId === input.providerFolderId,
        );
        if (!destination)
          throw new Error('Mail destination folder was not found.');
        await this.mutations.moveMessage(context, account, message, {
          ...targetInput,
          providerFolderId: destination.providerFolderId,
        });
        return;
      }
      case 'delete':
        await this.mutations.deleteMessage(context, account, message, {
          ...targetInput,
          permanently: input.permanently,
        });
    }
  }
}

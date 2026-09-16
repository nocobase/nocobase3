import { notifyMailMessageChange } from '../realtime.js';
import {
  type MailAccountView,
  type MailOperationContext,
  type MailProviderAdapter,
} from '../types.js';
import { toMailAccountView } from '../views.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';
import { closeAdapter } from './provider-lifecycle.js';

export class MailAccountsService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      'store' | 'adapters' | 'messageChangeNotifier' | 'credentials'
    >,
  ) {}

  public async listAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailAccountView[]> {
    return (await this.dependencies.store.listAccounts(context.actorId)).map(
      toMailAccountView,
    );
  }

  public async updateAccount(
    context: MailOperationContext,
    input: import('../types.js').MailUpdateAccountInput,
  ): Promise<MailAccountView> {
    const account = await this.dependencies.store.getAccount(input.accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }

    let updated = account;
    if (input.status) {
      if (
        input.status === 'active' &&
        !['active', 'suspended'].includes(updated.status)
      ) {
        throw new Error('This Mail account must be reauthorized.');
      }
    }
    if (input.status !== undefined) {
      updated = await this.dependencies.store.saveAccount({
        ...updated,
        status: input.status ?? updated.status,
      });
    }
    return toMailAccountView(updated);
  }

  public async removeAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (
      !(await this.dependencies.store.markAccountRemoving(
        account.id,
        context.actorId,
      ))
    ) {
      throw new Error('Mail account was not found.');
    }
    const activeSyncRun =
      await this.dependencies.store.findActiveSyncRun(accountId);
    if (activeSyncRun) {
      // Removing the account also cancels its queued or running local sync.
      // Marking the account first prevents another sync from being scheduled
      // while the account's records are being deleted.
      await this.dependencies.store.cancelSyncRun(activeSyncRun.id);
    }
    const pushSubscription =
      await this.dependencies.store.getPushSubscription(accountId);
    let pushAdapter: MailProviderAdapter | undefined;
    if (pushSubscription) {
      try {
        pushAdapter = await this.dependencies.adapters.resolve(account);
      } catch {
        // Local disconnect remains authoritative if Provider cleanup fails.
      }
    }
    if (!(await this.dependencies.store.deleteAccount(accountId))) {
      if (pushAdapter) await closeAdapter(pushAdapter);
      throw new Error('Mail account was not found.');
    }
    notifyMailMessageChange(
      this.dependencies.messageChangeNotifier,
      context.actorId,
    );
    try {
      if (pushAdapter && pushSubscription) {
        await pushAdapter.deletePushSubscription?.(
          pushSubscription.providerSubscriptionId,
          context.signal,
        );
      }
    } catch {
      // Local disconnect remains authoritative if Provider cleanup fails.
    } finally {
      if (pushAdapter) await closeAdapter(pushAdapter);
    }
    try {
      await this.dependencies.credentials?.delete(account.credentialReference);
    } catch {
      // Credential cleanup must not make a completed account removal ambiguous.
    }
  }
}

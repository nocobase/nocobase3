import {
  type MailAccount,
  type MailMessage,
  type MailOperationContext,
  type MailStore,
} from '../types.js';

export async function requireOwnedAccount(
  store: Pick<MailStore, 'getAccount'>,
  context: MailOperationContext,
  accountId: string,
): Promise<void> {
  const account = await store.getAccount(accountId);
  if (!account || account.userId !== context.actorId) {
    throw new Error('Mail account was not found.');
  }
}

export async function requireOwnedMessage(
  store: Pick<MailStore, 'getAccount' | 'getMessage'>,
  context: MailOperationContext,
  accountId: string,
  messageId: string,
): Promise<OwnedMailMessage> {
  const account = await store.getAccount(accountId);
  if (!account || account.userId !== context.actorId) {
    throw new Error('Mail account was not found.');
  }
  if (account.status !== 'active') {
    throw new Error('Mail account is not active.');
  }
  const message = await store.getMessage(context.actorId, accountId, messageId);
  if (!message) throw new Error('Mail message was not found.');
  return { account, message };
}

export async function requireActiveAccount(
  store: Pick<MailStore, 'getAccount'>,
  context: MailOperationContext,
  accountId: string,
): Promise<MailAccount> {
  const account = await store.getAccount(accountId);
  if (!account || account.userId !== context.actorId) {
    throw new Error('Mail account was not found.');
  }
  if (account.status !== 'active') {
    throw new Error('Mail account is not active.');
  }
  return account;
}

export interface OwnedMailMessage {
  readonly account: MailAccount;
  readonly message: MailMessage;
}

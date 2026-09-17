import { type DatabaseManager } from '@nocobase/db';
import {
  type MailAccount,
  type MailIdentity,
  type MailProviderIdentity,
  type MailSignature,
} from '../../shared/mail.js';
import {
  persistAccount,
  replaceAccountIdentities,
  saveSignature,
} from './account-writes.js';
import { fromAccountRow } from './mappers.js';
import {
  type AccountRow,
  type OutboxRow,
  type SubmissionRow,
  type SyncRunRow,
} from './rows.js';
import { normalizeAddress } from './serialization.js';

export class MailAccountsStore {
  public constructor(private readonly database: DatabaseManager) {}

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
    if (result.updatedCount === 1) return true;
    const removing = await this.database
      .query()
      .selectFrom<AccountRow>('mailAccounts')
      .select('id')
      .where('id', '=', accountId)
      .where('userId', '=', userId)
      .where('status', '=', 'removing')
      .executeTakeFirst<Pick<AccountRow, 'id'>>();
    return Boolean(removing);
  }

  public async markAccountReauthorizationRequired(
    accountId: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<AccountRow>('mailAccounts')
      .set({
        status: 'reauthorizationRequired',
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .where('status', '=', 'active')
      .execute();
    return result.updatedCount === 1;
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
      const deleted = await connection.query
        .deleteFrom<AccountRow>('mailAccounts')
        .where('id', '=', accountId)
        .execute();
      return deleted.deletedCount === 1;
    });
  }

  public async saveAuthorizedAccount(
    account: MailAccount,
    identities: readonly MailIdentity[],
    signatures: readonly MailSignature[] = [],
  ): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await persistAccount(connection.query, account);
      await replaceAccountIdentities(connection.query, account.id, identities);
      for (const signature of signatures) {
        await saveSignature(connection.query, signature);
      }
    });
  }
}

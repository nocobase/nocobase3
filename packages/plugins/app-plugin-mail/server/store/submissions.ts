import { type DatabaseManager } from '@nocobase/db';
import { randomUUID } from 'node:crypto';
import {
  type MailComposeInput,
  type MailProviderError,
  type MailScheduledSubmission,
  type MailStore,
  type MailStoredSubmission,
  type MailSubmission,
} from '../types.js';
import { fromSubmissionRow } from './mappers.js';
import { type OutboxRow, type SubmissionRow } from './rows.js';
import { jsonOrNull, parseJson } from './serialization.js';

export class MailSubmissionsStore {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly accounts: Pick<MailStore, 'listAccounts'>,
  ) {}

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
    const accounts = await this.accounts.listAccounts(userId);
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
}

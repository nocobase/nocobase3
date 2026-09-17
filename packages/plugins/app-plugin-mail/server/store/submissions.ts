import { validateLogPagination } from '../log-pagination.js';
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

  public async countSubmissions(
    userId: string,
    bulkOnly = false,
    groupByBatch = false,
  ): Promise<number> {
    const accounts = await this.accounts.listAccounts(userId);
    if (accounts.length === 0) return 0;
    let query = this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .select(({ fn }) => [fn.countAll().as('count')])
      .where(
        'accountId',
        'in',
        accounts.map((account) => account.id),
      );
    if (groupByBatch) query = query.where('idempotencyKey', 'like', 'bulk:%:0');
    else if (bulkOnly) query = query.where('idempotencyKey', 'like', 'bulk:%');
    const row = await query.executeTakeFirst<{
      readonly count: number | string;
    }>();
    return Number(row?.count ?? 0);
  }

  public async listSubmissions(
    userId: string,
    bulkOnly = false,
    offset = 0,
    groupByBatch = false,
    limit: number = groupByBatch ? 20 : 100,
  ): Promise<readonly MailStoredSubmission[]> {
    validateLogPagination(offset, limit);
    const accounts = await this.accounts.listAccounts(userId);
    if (accounts.length === 0) return [];
    let query = this.database
      .query()
      .selectFrom<SubmissionRow>('mailSubmissions')
      .selectAll()
      .where(
        'accountId',
        'in',
        accounts.map((account) => account.id),
      );
    if (groupByBatch) {
      // sendBulk persists recipient zero first, making it the stable batch anchor.
      const anchors = await query
        .where('idempotencyKey', 'like', 'bulk:%:0')
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .offset(offset)
        .limit(limit)
        .execute<SubmissionRow>();
      if (anchors.length === 0) return [];
      const rows = await query
        .where((builder) =>
          builder.or(
            anchors.map((anchor) => {
              const prefix = anchor.idempotencyKey.slice(0, -1);
              return builder.and([
                builder('accountId', '=', anchor.accountId),
                builder(
                  'idempotencyKey',
                  'in',
                  Array.from(
                    { length: 100 },
                    (_, index) => `${prefix}${index}`,
                  ),
                ),
              ]);
            }),
          ),
        )
        .orderBy('createdAt', 'asc')
        .orderBy('id', 'asc')
        .execute<SubmissionRow>();
      return anchors.flatMap((anchor) => {
        const prefix = anchor.idempotencyKey.slice(0, -1);
        return rows
          .filter(
            (row) =>
              row.accountId === anchor.accountId &&
              row.idempotencyKey.startsWith(prefix),
          )
          .map(fromSubmissionRow);
      });
    }
    if (bulkOnly) query = query.where('idempotencyKey', 'like', 'bulk:%');
    const rows = await query
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
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
        updatedAt: new Date().toISOString(),
      })
      .where('id', '=', submissionId)
      .where('status', '=', 'pending')
      .execute();
  }

  public async transitionSubmission(
    submissionId: string,
    action: 'retry' | 'cancel',
  ): Promise<MailStoredSubmission> {
    const now = new Date().toISOString();
    return this.database.transaction(async (connection) => {
      const result = await connection.query
        .updateTable<SubmissionRow>('mailSubmissions')
        .set({
          status: action === 'retry' ? 'pending' : 'cancelled',
          error: null,
          updatedAt: now,
        })
        .where('id', '=', submissionId)
        .where('status', '=', action === 'retry' ? 'failed' : 'pending')
        .where('composeInput', 'is not', null)
        .execute();
      if (result.updatedCount !== 1) {
        throw new TypeError(
          'The mail submission cannot perform this action in its current state.',
        );
      }
      if (action === 'retry') {
        await connection.query
          .insertInto<OutboxRow>('mailOutbox')
          .values({
            id: randomUUID(),
            type: 'sendScheduledMail',
            aggregateId: submissionId,
            deduplicationKey: `retry-send:${submissionId}:${randomUUID()}`,
            payload: JSON.stringify({ version: 1, submissionId }),
            status: 'pending',
            attempts: 0,
            availableAt: now,
            createdAt: now,
          })
          .execute();
      }
      const row = await connection.query
        .selectFrom<SubmissionRow>('mailSubmissions')
        .selectAll()
        .where('id', '=', submissionId)
        .executeTakeFirst<SubmissionRow>();
      if (!row) throw new Error('Mail submission was not found.');
      return fromSubmissionRow(row);
    });
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
    await this.database.transaction(async (connection): Promise<void> => {
      const updated = await connection.query
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
      if (updated.updatedCount === 1 && submission.status === 'accepted') {
        // Persist refresh requests with acceptance so a restart cannot lose them.
        const now = Date.now();
        await connection.query
          .insertInto<OutboxRow>('mailOutbox')
          .values(
            [0, 5_000, 30_000].map((delay) => ({
              id: randomUUID(),
              type: 'requestMailboxSync' as const,
              aggregateId: submission.id,
              deduplicationKey: `sent-sync:${submission.id}:${delay}`,
              payload: JSON.stringify({
                version: 1,
                accountId: submission.accountId,
              }),
              status: 'pending' as const,
              attempts: 0,
              availableAt: new Date(now + delay).toISOString(),
              createdAt: new Date(now).toISOString(),
            })),
          )
          .execute();
      }
    });
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

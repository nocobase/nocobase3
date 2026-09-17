import { createHash } from 'node:crypto';
import { SendMailOperation } from '../operations/send-mail.js';
import {
  type MailOperationContext,
  type MailOffsetPage,
  type MailSubmissionLogView,
  type MailSubmissionView,
} from '../../shared/mail.js';
import { toSubmissionLogView, toSubmissionView } from '../views.js';
import { type MailServiceDependencies } from './dependencies.js';

export class MailSubmissionsService {
  public constructor(
    private readonly dependencies: MailServiceDependencies<
      | 'countSubmissions'
      | 'getAccount'
      | 'getScheduledSubmission'
      | 'getSubmissionByIdempotencyKey'
      | 'listSubmissions'
      | 'transitionSubmission',
      'outbox'
    >,
    private readonly sendMail: SendMailOperation,
  ) {}

  public async listSubmissionsPage(
    context: MailOperationContext,
    bulkOnly = false,
    offset = 0,
    groupByBatch = false,
    limit = 20,
  ): Promise<MailOffsetPage<MailSubmissionLogView>> {
    const [items, total] = await Promise.all([
      this.listSubmissions(context, bulkOnly, offset, groupByBatch, limit),
      this.dependencies.store.countSubmissions(
        context.actorId,
        bulkOnly,
        groupByBatch,
      ),
    ]);
    return { items, total };
  }

  public async listSubmissions(
    context: MailOperationContext,
    bulkOnly = false,
    offset = 0,
    groupByBatch = false,
    limit: number = groupByBatch ? 20 : 100,
  ): Promise<readonly MailSubmissionLogView[]> {
    return (
      await this.dependencies.store.listSubmissions(
        context.actorId,
        bulkOnly,
        offset,
        groupByBatch,
        limit,
      )
    ).map(toSubmissionLogView);
  }

  public async transitionSubmission(
    context: MailOperationContext,
    submissionId: string,
    action: 'retry' | 'cancel',
  ): Promise<MailSubmissionLogView> {
    const scheduled =
      await this.dependencies.store.getScheduledSubmission(submissionId);
    const account = scheduled
      ? await this.dependencies.store.getAccount(scheduled.submission.accountId)
      : undefined;
    if (
      !scheduled ||
      !account ||
      account.userId !== context.actorId ||
      scheduled.actorId !== context.actorId
    ) {
      throw new TypeError('Mail submission was not found.');
    }
    const submission = await this.dependencies.store.transitionSubmission(
      submissionId,
      action,
    );
    if (action === 'retry') this.dependencies.outbox?.kick();
    return toSubmissionLogView(submission);
  }

  public async sendMessage(
    context: MailOperationContext,
    input: import('../../shared/mail.js').MailComposeInput,
  ): Promise<MailSubmissionView> {
    return toSubmissionView(await this.sendMail.execute(context, input));
  }

  public async sendBulk(
    context: MailOperationContext,
    input: import('../../shared/mail.js').MailBulkComposeInput,
  ): Promise<readonly MailSubmissionView[]> {
    if (input.recipients.length === 0 || input.recipients.length > 100) {
      throw new TypeError('Bulk mail requires between 1 and 100 recipients.');
    }
    const submissions: MailSubmissionView[] = [];
    const bulkKeyPrefix = `bulk:${createHash('sha256').update(input.idempotencyKey).digest('hex')}`;
    for (const [index, recipient] of input.recipients.entries()) {
      const idempotencyKey = `${bulkKeyPrefix}:${index}`;
      const existing =
        await this.dependencies.store.getSubmissionByIdempotencyKey(
          input.accountId,
          idempotencyKey,
        );
      submissions.push(
        toSubmissionView(
          await this.sendMail.execute(context, {
            ...input,
            to: [recipient],
            cc: [],
            bcc: [],
            scheduledAt:
              input.scheduledAt ??
              existing?.scheduledAt ??
              new Date(Date.now() + 1_000).toISOString(),
            idempotencyKey,
          }),
        ),
      );
    }
    return submissions;
  }
}

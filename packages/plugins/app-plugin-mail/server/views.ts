import { toPublicError } from './services/errors.js';
import {
  type MailAccount,
  type MailAccountView,
  type MailSubmission,
  type MailSubmissionLogView,
  type MailSubmissionView,
  type MailSyncRun,
  type MailSyncRunView,
} from './types.js';

export function toSyncRunView(run: MailSyncRun): MailSyncRunView {
  return {
    id: run.id,
    accountId: run.accountId,
    mode: run.mode,
    phase: run.phase,
    status: run.status,
    policy: run.policy,
    historyComplete: run.historyComplete,
    recovering: run.recovering,
    pendingMessages: run.pendingMessages,
    processedMessages: run.processedMessages,
    processedPages: run.processedPages,
    error: run.error ? toPublicError(run.error) : undefined,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

export function toSubmissionView(
  submission: MailSubmission,
): MailSubmissionView {
  return {
    id: submission.id,
    accountId: submission.accountId,
    status: submission.status,
    providerMessageId: submission.providerMessageId,
    scheduledAt: submission.scheduledAt,
    error: submission.error ? toPublicError(submission.error) : undefined,
  };
}

export function toSubmissionLogView(
  submission: import('./types.js').MailStoredSubmission,
): MailSubmissionLogView {
  return {
    ...toSubmissionView(submission),
    recipients: submission.recipients,
    subject: submission.subject,
    bulk: submission.bulk,
    batchId: submission.batchId,
    canRetry:
      submission.status === 'failed' && submission.hasComposeInput === true,
    canCancel:
      submission.status === 'pending' && submission.hasComposeInput === true,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

export function toMailAccountView(account: MailAccount): MailAccountView {
  return {
    id: account.id,
    userId: account.userId,
    provider: account.provider,
    address: account.address,
    displayName: account.displayName,
    scopes: account.scopes,
    status: account.status,
    initialSyncReceivedAfter: account.initialSyncReceivedAfter,
    automaticSyncIntervalMinutes: account.automaticSyncIntervalMinutes,
  };
}

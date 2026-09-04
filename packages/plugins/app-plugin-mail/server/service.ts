import { randomUUID } from 'node:crypto';

import type {
  MailAccountView,
  MailListMessagesInput,
  MailMessage,
  MailMessageSummary,
  MailOperationContext,
  MailPage,
  MailService,
  MailStartSyncInput,
  MailStore,
  MailSyncRun,
  MailSyncRunView,
  MailSubmission,
  MailSubmissionView,
} from './types.js';
import { SendMailOperation } from './operations/send-mail.js';
import { toMailAccountView } from './store.js';
import type { MailProviderAdapterResolver } from './types.js';

export interface MailOutboxPublisher {
  kick(): void;
}

export interface DefaultMailServiceDependencies {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly outbox: MailOutboxPublisher;
}

export class DefaultMailService implements MailService {
  private readonly sendMail: SendMailOperation;

  public constructor(
    private readonly dependencies: DefaultMailServiceDependencies,
  ) {
    this.sendMail = new SendMailOperation(dependencies);
  }

  public async listAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailAccountView[]> {
    return (await this.dependencies.store.listAccounts(context.actorId)).map(
      toMailAccountView,
    );
  }

  public async listIdentities(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly import('./types.js').MailIdentity[]> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listIdentities(accountId);
  }

  public async startSync(
    context: MailOperationContext,
    input: MailStartSyncInput,
  ): Promise<MailSyncRunView> {
    await this.requireActiveAccount(context, input.accountId);
    const active = await this.dependencies.store.findActiveSyncRun(
      input.accountId,
    );
    if (active) return toSyncRunView(active);
    const mode = input.mode ?? 'initial';
    if (
      mode === 'incremental' &&
      !(await this.dependencies.store.getSyncCursor(input.accountId))
    ) {
      throw new Error(
        'Initial mailbox sync must complete before incremental sync.',
      );
    }
    const run = await this.dependencies.store.createSyncRun({
      id: randomUUID(),
      accountId: input.accountId,
      requestedBy: context.actorId,
      mode,
      policy: {
        receivedAfter: input.receivedAfter,
        maxMessages: boundedInteger(input.maxMessages, 10_000, 1, 100_000),
        batchSize: boundedInteger(input.batchSize, 200, 1, 500),
      },
    });
    this.dependencies.outbox.kick();
    return toSyncRunView(run);
  }

  public async getSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView | undefined> {
    const run = await this.dependencies.store.getSyncRun(syncRunId);
    if (!run) return undefined;
    const account = await this.dependencies.store.getAccount(run.accountId);
    return account?.userId === context.actorId ? toSyncRunView(run) : undefined;
  }

  public listMessages(
    context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    return this.dependencies.store.listMessages(context.actorId, input);
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

  public async sendMessage(
    context: MailOperationContext,
    input: import('./types.js').MailComposeInput,
  ): Promise<MailSubmissionView> {
    return toSubmissionView(await this.sendMail.execute(context, input));
  }

  private async requireOwnedAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
  }

  private async requireActiveAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
  }
}

function toSyncRunView(run: MailSyncRun): MailSyncRunView {
  return {
    id: run.id,
    accountId: run.accountId,
    mode: run.mode,
    phase: run.phase,
    status: run.status,
    policy: run.policy,
    processedMessages: run.processedMessages,
    processedPages: run.processedPages,
    error: run.error ? toPublicError(run.error) : undefined,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

function toSubmissionView(submission: MailSubmission): MailSubmissionView {
  return {
    id: submission.id,
    accountId: submission.accountId,
    status: submission.status,
    providerMessageId: submission.providerMessageId,
    error: submission.error ? toPublicError(submission.error) : undefined,
  };
}

function toPublicError(
  error: import('./types.js').MailProviderError,
): import('./types.js').MailPublicError {
  return {
    code: error.code,
    category: error.category,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
  };
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new TypeError(
      `Mail sync option must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return resolved;
}

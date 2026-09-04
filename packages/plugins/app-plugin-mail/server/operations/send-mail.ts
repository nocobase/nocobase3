import { createHash, randomUUID } from 'node:crypto';

import type {
  MailComposeInput,
  MailOperationContext,
  MailProviderAdapterResolver,
  MailProviderMessageInput,
  MailService,
  MailStore,
  MailSubmission,
} from '../types.js';

export interface SendMailOperationDependencies {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
}

export class SendMailOperation {
  public constructor(
    private readonly dependencies: SendMailOperationDependencies,
  ) {}

  public async execute(
    context: MailOperationContext,
    input: MailComposeInput,
  ): Promise<MailSubmission> {
    if ((input.attachmentIds?.length ?? 0) > 0) {
      throw new TypeError(
        'Attachments are outside the first mail plugin release.',
      );
    }
    const now = Date.now();
    await this.dependencies.store.recoverExpiredSubmissions(
      new Date(now).toISOString(),
    );
    const account = await this.dependencies.store.getAccount(input.accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    const requestFingerprint = fingerprint(input);
    const existing =
      await this.dependencies.store.getSubmissionByIdempotencyKey(
        account.id,
        input.idempotencyKey,
      );
    if (existing) {
      assertMatchingRequest(existing.requestFingerprint, requestFingerprint);
      return existing;
    }

    const identity = await this.dependencies.store.getIdentity(
      input.identityId,
    );
    if (!identity || identity.accountId !== account.id || !identity.canSend) {
      throw new Error('Mail sending identity is not available.');
    }

    const created = await this.dependencies.store.createSubmission(
      {
        id: randomUUID(),
        accountId: account.id,
        status: 'pending',
      },
      input.idempotencyKey,
      requestFingerprint,
    );
    assertMatchingRequest(created.requestFingerprint, requestFingerprint);
    const leaseToken = randomUUID();
    const claimed = await this.dependencies.store.claimSubmission(
      created.id,
      leaseToken,
      new Date(now + 120_000).toISOString(),
    );
    if (!claimed) {
      return (
        (await this.dependencies.store.getSubmissionByIdempotencyKey(
          account.id,
          input.idempotencyKey,
        )) ?? created
      );
    }

    let adapter;
    try {
      adapter = await this.dependencies.adapters.resolve(
        account,
        context.signal,
      );
    } catch (error) {
      return this.dependencies.store.finishSubmission(
        {
          ...created,
          status: 'failed',
          error: {
            code: 'MAIL_PROVIDER_UNAVAILABLE',
            message:
              error instanceof Error
                ? error.message
                : 'The selected mail Provider is unavailable.',
            category: 'configuration',
            retryable: false,
          },
        },
        leaseToken,
      );
    }
    if (!adapter.capabilities.send || !adapter.sendMessage) {
      return this.dependencies.store.finishSubmission(
        {
          ...created,
          status: 'failed',
          error: {
            code: 'MAIL_SEND_NOT_SUPPORTED',
            message: 'The selected mail Provider does not support sending.',
            category: 'configuration',
            retryable: false,
          },
        },
        leaseToken,
      );
    }

    try {
      const result = await adapter.sendMessage({
        trackingId: created.id,
        identity,
        message: toProviderMessage(input),
        signal: context.signal,
      });
      if (result.status === 'accepted') {
        return this.dependencies.store.finishSubmission(
          {
            ...created,
            status: 'accepted',
            providerMessageId: result.providerMessageId,
          },
          leaseToken,
        );
      }
      return this.dependencies.store.finishSubmission(
        {
          ...created,
          status: result.status === 'submission_unknown' ? 'unknown' : 'failed',
          error: result.error,
        },
        leaseToken,
      );
    } catch (error) {
      return this.dependencies.store.finishSubmission(
        {
          ...created,
          status: 'unknown',
          error: {
            code: 'MAIL_SEND_RESULT_UNKNOWN',
            message:
              error instanceof Error
                ? error.message
                : 'The Provider submission result is unknown.',
            category: 'unknown',
            retryable: false,
          },
        },
        leaseToken,
      );
    } finally {
      await closeQuietly(adapter);
    }
  }
}

export class MailIdempotencyConflictError extends Error {
  public constructor() {
    super('The idempotency key is already associated with another request.');
  }
}

function assertMatchingRequest(actual: string, expected: string): void {
  if (actual !== expected) throw new MailIdempotencyConflictError();
}

function fingerprint(input: MailComposeInput): string {
  const canonical = {
    accountId: input.accountId,
    identityId: input.identityId,
    to: input.to.map(canonicalAddress),
    cc: (input.cc ?? []).map(canonicalAddress),
    bcc: (input.bcc ?? []).map(canonicalAddress),
    subject: input.subject,
    text: input.text,
    html: input.html ?? null,
    attachmentIds: input.attachmentIds ?? [],
    inReplyToMessageId: input.inReplyToMessageId ?? null,
    forwardOfMessageId: input.forwardOfMessageId ?? null,
    scheduledAt: input.scheduledAt ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function canonicalAddress(address: {
  readonly address: string;
  readonly name?: string;
}): { readonly address: string; readonly name: string | null } {
  return { address: address.address, name: address.name ?? null };
}

function toProviderMessage(input: MailComposeInput): MailProviderMessageInput {
  return {
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: [],
    references: [],
  };
}

export type SendMessageMethod = MailService['sendMessage'];

async function closeQuietly(adapter: {
  close?(): Promise<void>;
}): Promise<void> {
  try {
    await adapter.close?.();
  } catch {
    // Closing a Provider client must not change a persisted submission result.
  }
}

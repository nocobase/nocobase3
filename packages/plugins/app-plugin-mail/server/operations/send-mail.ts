import { createHash, randomUUID } from 'node:crypto';

import type {
  MailComposeInput,
  MailOperationContext,
  MailProviderAdapterResolver,
  MailProviderMessageInput,
  MailOutboundAttachmentStorage,
  MailService,
  MailStore,
  MailSubmission,
} from '../types.js';

export interface SendMailOperationDependencies {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly outbox?: { kick(): void };
  readonly outboundAttachments?: MailOutboundAttachmentStorage;
}

export interface SendMailExecutionOptions {
  readonly scheduledDelivery?: boolean;
}

export class SendMailOperation {
  public constructor(
    private readonly dependencies: SendMailOperationDependencies,
  ) {}

  public async execute(
    context: MailOperationContext,
    input: MailComposeInput,
    options: SendMailExecutionOptions = {},
  ): Promise<MailSubmission> {
    if (input.inReplyToMessageId && input.forwardOfMessageId) {
      throw new TypeError('A message cannot be both a reply and a forward.');
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
      if (!options.scheduledDelivery) {
        assertMatchingRequest(existing.requestFingerprint, requestFingerprint);
      }
      if (
        existing.status === 'pending' &&
        existing.scheduledAt &&
        !options.scheduledDelivery
      ) {
        return existing;
      }
      if (existing.status !== 'pending') return existing;
    }

    const identity = await this.dependencies.store.getIdentity(
      input.identityId,
    );
    if (!identity || identity.accountId !== account.id || !identity.canSend) {
      throw new Error('Mail sending identity is not available.');
    }

    const providerMessage = await this.prepareProviderMessage(
      context,
      input,
      options.scheduledDelivery === true,
    );
    if (input.scheduledAt && !options.scheduledDelivery) {
      const scheduledAt = parseFutureDate(input.scheduledAt);
      await this.dependencies.store.extendOutboundAttachments(
        context.actorId,
        input.attachmentIds ?? [],
        new Date(
          new Date(scheduledAt).getTime() + 24 * 60 * 60 * 1_000,
        ).toISOString(),
      );
      const scheduled = await this.dependencies.store.createScheduledSubmission(
        {
          id: randomUUID(),
          accountId: account.id,
          status: 'pending',
          scheduledAt,
        },
        input.idempotencyKey,
        requestFingerprint,
        context.actorId,
        {
          ...input,
          signatureId: null,
          text: providerMessage.text,
          html: providerMessage.html,
        },
      );
      assertMatchingRequest(scheduled.requestFingerprint, requestFingerprint);
      this.dependencies.outbox?.kick();
      return scheduled;
    }

    const submission =
      existing ??
      (await this.dependencies.store.createSubmission(
        {
          id: randomUUID(),
          accountId: account.id,
          status: 'pending',
        },
        input.idempotencyKey,
        requestFingerprint,
      ));
    if (!options.scheduledDelivery) {
      assertMatchingRequest(submission.requestFingerprint, requestFingerprint);
    }
    const leaseToken = randomUUID();
    const claimed = await this.dependencies.store.claimSubmission(
      submission.id,
      leaseToken,
      new Date(now + 120_000).toISOString(),
    );
    if (!claimed) {
      return (
        (await this.dependencies.store.getSubmissionByIdempotencyKey(
          account.id,
          input.idempotencyKey,
        )) ?? submission
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
          ...submission,
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
          ...submission,
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
        trackingId: submission.id,
        identity,
        message: providerMessage,
        signal: context.signal,
      });
      if (result.status === 'accepted') {
        if (input.draftMessageId) {
          await this.dependencies.store.deleteMessage(
            account.id,
            input.draftMessageId,
          );
        }
        return this.dependencies.store.finishSubmission(
          {
            ...submission,
            status: 'accepted',
            providerMessageId: result.providerMessageId,
          },
          leaseToken,
        );
      }
      if (
        result.error.category === 'authentication' &&
        !result.error.retryable
      ) {
        await this.dependencies.store.saveAccount({
          ...account,
          status: 'reauthorizationRequired',
        });
      }
      return this.dependencies.store.finishSubmission(
        {
          ...submission,
          status: result.status === 'submission_unknown' ? 'unknown' : 'failed',
          error: result.error,
        },
        leaseToken,
      );
    } catch (error) {
      return this.dependencies.store.finishSubmission(
        {
          ...submission,
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

  public async prepareProviderMessage(
    context: MailOperationContext,
    input: MailComposeInput,
    contentAlreadyPrepared = false,
  ): Promise<MailProviderMessageInput> {
    const identity = await this.dependencies.store.getIdentity(
      input.identityId,
    );
    if (!identity || identity.accountId !== input.accountId) {
      throw new Error('Mail sending identity is not available.');
    }
    const configuredSignatures = await this.dependencies.store.listSignatures(
      identity.id,
    );
    const signature =
      input.signatureId === null
        ? undefined
        : input.signatureId
          ? await this.dependencies.store.getSignature(input.signatureId)
          : configuredSignatures.find((item) => item.isDefault);
    if (
      input.signatureId &&
      (!signature || signature.identityId !== identity.id)
    ) {
      throw new Error('Mail signature was not found.');
    }
    const signatureText =
      input.signatureId === null ? undefined : signature?.text;
    const signatureHtml =
      input.signatureId === null
        ? undefined
        : signature
          ? (signature.html ?? escapeHtml(signature.text))
          : undefined;
    const knownSignatureTexts = configuredSignatures
      .map((item) => item.text)
      .filter((value): value is string => Boolean(value.trim()));
    const knownSignatureHtml = configuredSignatures
      .map((item) => item.html ?? escapeHtml(item.text))
      .filter((value): value is string => Boolean(value?.trim()));
    const relatedMessageId =
      input.inReplyToMessageId ?? input.forwardOfMessageId;
    const related = relatedMessageId
      ? await this.dependencies.store.getMessage(
          context.actorId,
          input.accountId,
          relatedMessageId,
        )
      : undefined;
    if (relatedMessageId && !related) {
      throw new Error('The related mail message was not found.');
    }
    const parentInternetMessageId = related?.internetMessageId;
    const draft = input.draftMessageId
      ? await this.dependencies.store.getMessage(
          context.actorId,
          input.accountId,
          input.draftMessageId,
        )
      : undefined;
    if (input.draftMessageId && (!draft || !draft.draft)) {
      throw new Error('Mail draft was not found.');
    }
    const retainedDraftAttachments = draft
      ? input.retainedAttachmentIds === undefined
        ? draft.attachments
        : input.retainedAttachmentIds.map((attachmentId) => {
            const attachment = draft.attachments.find(
              (item) => item.id === attachmentId,
            );
            if (!attachment) {
              throw new TypeError(
                'A retained attachment does not belong to the selected draft.',
              );
            }
            return attachment;
          })
      : [];
    const attachments = await Promise.all(
      (input.attachmentIds ?? []).map(async (attachmentId) => {
        const metadata = await this.dependencies.store.getOutboundAttachment(
          context.actorId,
          attachmentId,
        );
        if (!metadata)
          throw new Error('Mail outbound attachment was not found.');
        const storage = this.dependencies.outboundAttachments;
        if (!storage)
          throw new Error('Mail attachment storage is not configured.');
        return {
          fileName: metadata.fileName,
          contentType: metadata.contentType,
          size: metadata.size,
          inline: false,
          open: async () =>
            (await storage.open(context.actorId, attachmentId)).stream,
        };
      }),
    );
    const attachmentSize = attachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    if (attachmentSize > 25 * 1024 * 1024) {
      throw new TypeError('Mail attachments must not exceed 25 MB in total.');
    }
    return {
      to: input.to,
      cc: input.cc ?? [],
      bcc: input.bcc ?? [],
      subject: input.subject,
      text: contentAlreadyPrepared
        ? input.text
        : appendTextSignature(
            stripKnownTextSignature(input.text, knownSignatureTexts),
            signatureText,
          ),
      html: contentAlreadyPrepared
        ? input.html
        : appendHtmlSignature(
            stripKnownHtmlSignature(input.html, knownSignatureHtml),
            signatureHtml,
          ),
      attachments,
      retainedProviderAttachmentIds: retainedDraftAttachments.map(
        (attachment) => attachment.providerAttachmentId,
      ),
      inReplyTo: input.inReplyToMessageId ? parentInternetMessageId : undefined,
      references:
        input.inReplyToMessageId && related
          ? uniqueStrings([
              ...related.references,
              ...(parentInternetMessageId ? [parentInternetMessageId] : []),
            ])
          : [],
      providerConversationId: input.inReplyToMessageId
        ? related?.conversationId
        : draft?.conversationId,
      draftProviderMessageId: draft?.providerMessageId,
      draftProviderDraftId: draft?.providerDraftId,
      replyToProviderMessageId: input.inReplyToMessageId
        ? related?.providerMessageId
        : undefined,
      forwardOfProviderMessageId: input.forwardOfMessageId
        ? related?.providerMessageId
        : undefined,
    };
  }
}

function appendTextSignature(text: string, signature?: string): string {
  return signature?.trim() ? `${text}\n\n-- \n${signature}` : text;
}

function stripKnownTextSignature(
  text: string,
  signatures: readonly string[],
): string {
  return stripKnownSuffix(
    text,
    signatures.map((signature) => `\n\n-- \n${signature}`),
  );
}

function appendHtmlSignature(
  html?: string,
  signature?: string,
): string | undefined {
  if (!html || !signature?.trim()) return html;
  return `${html}<br><br><div class="nocobase-mail-signature">${signature}</div>`;
}

function stripKnownHtmlSignature(
  html: string | undefined,
  signatures: readonly string[],
): string | undefined {
  if (!html) return html;
  return stripKnownSuffix(
    html,
    signatures.map(
      (signature) =>
        `<br><br><div class="nocobase-mail-signature">${signature}</div>`,
    ),
  );
}

function stripKnownSuffix(value: string, suffixes: readonly string[]): string {
  const suffix = suffixes.find((candidate) => value.endsWith(candidate));
  return suffix ? value.slice(0, -suffix.length) : value;
}

function escapeHtml(value?: string): string | undefined {
  return value
    ?.replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
    .replace(/\n/gu, '<br>');
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
    signatureId: input.signatureId,
    to: input.to.map(canonicalAddress),
    cc: (input.cc ?? []).map(canonicalAddress),
    bcc: (input.bcc ?? []).map(canonicalAddress),
    subject: input.subject,
    text: input.text,
    html: input.html ?? null,
    attachmentIds: input.attachmentIds ?? [],
    retainedAttachmentIds: input.retainedAttachmentIds ?? null,
    inReplyToMessageId: input.inReplyToMessageId ?? null,
    forwardOfMessageId: input.forwardOfMessageId ?? null,
    scheduledAt: input.scheduledAt ?? null,
    draftMessageId: input.draftMessageId ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function canonicalAddress(address: {
  readonly address: string;
  readonly name?: string;
}): { readonly address: string; readonly name: string | null } {
  return { address: address.address, name: address.name ?? null };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function parseFutureDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new TypeError('Scheduled sending time must be a valid future date.');
  }
  return new Date(timestamp).toISOString();
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

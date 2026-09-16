import { randomUUID } from 'node:crypto';
import { SendMailOperation } from '../operations/send-mail.js';
import { notifyMailMessageChange } from '../realtime.js';
import {
  MAIL_LOCAL_DRAFT_FOLDER_ID,
  type MailIdentity,
  type MailMessage,
  type MailOperationContext,
  type MailProviderAdapter,
  type MailResolveDraftConflictInput,
  type NormalizedMailAttachment,
  type NormalizedMailMessage,
} from '../types.js';
import { requireOwnedMessage } from './access.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';
import {
  draftFingerprint,
  isLocalDraftMessage,
  normalizedDraftFromMessage,
  sameDraftContent,
  toDraftConflict,
} from './draft-content.js';
import { assertProviderResult } from './errors.js';
import { closeAdapter } from './provider-lifecycle.js';

export class MailDraftsService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      'store' | 'adapters' | 'messageChangeNotifier'
    >,
    private readonly sendMail: SendMailOperation,
  ) {}

  public async saveDraft(
    context: MailOperationContext,
    input: import('../types.js').MailComposeInput,
  ): Promise<MailMessage> {
    if (input.scheduledAt) {
      throw new TypeError('A draft cannot also be scheduled for delivery.');
    }
    const account = await this.dependencies.store.getAccount(input.accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    const identity = await this.dependencies.store.getIdentity(
      input.identityId,
    );
    if (!identity || identity.accountId !== account.id || !identity.canSend) {
      throw new Error('Mail sending identity is not available.');
    }
    const existingDraft = input.draftMessageId
      ? await this.dependencies.store.getMessage(
          context.actorId,
          account.id,
          input.draftMessageId,
        )
      : undefined;
    if (input.draftMessageId && (!existingDraft || !existingDraft.draft)) {
      throw new Error('Mail draft was not found.');
    }
    let localDraft = await this.dependencies.store.saveMessage(
      account.id,
      await this.createLocalDraftMessage(
        context,
        identity,
        input,
        existingDraft,
      ),
    );
    let adapter: MailProviderAdapter | undefined;
    try {
      adapter = await this.dependencies.adapters.resolve(
        account,
        context.signal,
      );
    } catch {
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return localDraft;
    }
    try {
      if (!adapter.capabilities.drafts || !adapter.saveDraft) return localDraft;
      const remoteDraftId =
        existingDraft?.providerDraftMessageId ??
        (existingDraft && !isLocalDraftMessage(existingDraft)
          ? existingDraft.providerMessageId
          : undefined);
      if (remoteDraftId && adapter.getMessage) {
        const remote = await adapter.getMessage(remoteDraftId, context.signal);
        if (remote.ok && !sameDraftContent(existingDraft, remote.value)) {
          localDraft = await this.dependencies.store.saveMessage(account.id, {
            ...normalizedDraftFromMessage(localDraft),
            draftConflict: toDraftConflict(remote.value),
          });
          notifyMailMessageChange(
            this.dependencies.messageChangeNotifier,
            context.actorId,
          );
          return localDraft;
        }
      }
      const providerMessage = await this.sendMail.prepareProviderMessage(
        context,
        input,
      );
      const hasRemoteDraft = Boolean(
        existingDraft?.providerDraftId ||
        existingDraft?.providerDraftMessageId ||
        (existingDraft && !isLocalDraftMessage(existingDraft)),
      );
      const draft = assertProviderResult(
        hasRemoteDraft && existingDraft
          ? await (adapter.updateDraft
              ? adapter.updateDraft(
                  existingDraft.providerDraftId ??
                    existingDraft.providerDraftMessageId ??
                    existingDraft.providerMessageId,
                  {
                    trackingId: randomUUID(),
                    identity,
                    message: providerMessage,
                    signal: context.signal,
                  },
                )
              : Promise.resolve({
                  ok: false as const,
                  error: {
                    code: 'MAIL_DRAFT_UPDATE_UNSUPPORTED',
                    message: 'The selected Mail Provider cannot update drafts.',
                    category: 'configuration' as const,
                    retryable: false,
                  },
                }))
          : await adapter.saveDraft({
              trackingId: randomUUID(),
              identity,
              message: providerMessage,
              signal: context.signal,
            }),
      );
      const saved = await this.dependencies.store.saveMessage(account.id, {
        ...normalizedDraftFromMessage(localDraft),
        remoteDraftFingerprint: draftFingerprint(draft),
        providerDraftMessageId: draft.providerMessageId,
        providerDraftId: draft.providerDraftId,
        draft: true,
      });
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return saved;
    } catch {
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return localDraft;
    } finally {
      if (adapter) await closeAdapter(adapter);
    }
  }

  public async resolveDraftConflict(
    context: MailOperationContext,
    input: MailResolveDraftConflictInput,
  ): Promise<MailMessage> {
    const { account, message } = await requireOwnedMessage(
      this.dependencies.store,
      context,
      input.accountId,
      input.messageId,
    );
    if (!message.draft || !message.draftConflict) {
      throw new Error('Mail draft conflict was not found.');
    }
    const remote = message.draftConflict.remote;
    const normalized: NormalizedMailMessage =
      input.action === 'useRemote'
        ? {
            providerMessageId: message.providerMessageId,
            providerDraftMessageId: message.providerDraftMessageId,
            providerDraftId: message.providerDraftId,
            providerConversationId:
              remote.providerConversationId ?? message.conversationId,
            providerFolderIds: [MAIL_LOCAL_DRAFT_FOLDER_ID],
            from: remote.from,
            to: remote.to,
            cc: remote.cc,
            bcc: remote.bcc,
            replyTo: message.replyTo,
            inReplyTo: message.inReplyTo,
            references: message.references,
            subject: remote.subject,
            preview: (remote.text ?? '').slice(0, 240),
            text: remote.text,
            html: remote.html,
            read: true,
            starred: message.starred,
            draft: true,
            attachments: remote.attachments,
          }
        : normalizedDraftFromMessage(message);
    const resolved = await this.dependencies.store.saveMessage(account.id, {
      ...normalized,
      remoteDraftFingerprint: draftFingerprint(remote),
    });
    notifyMailMessageChange(
      this.dependencies.messageChangeNotifier,
      context.actorId,
    );
    return resolved;
  }

  private async createLocalDraftMessage(
    context: MailOperationContext,
    identity: MailIdentity,
    input: import('../types.js').MailComposeInput,
    existingDraft?: MailMessage,
  ): Promise<NormalizedMailMessage> {
    const attachments = await this.loadLocalDraftAttachments(
      context,
      input,
      existingDraft,
    );
    return {
      providerMessageId:
        existingDraft?.providerMessageId ?? `local-draft:${randomUUID()}`,
      remoteDraftFingerprint: existingDraft?.remoteDraftFingerprint,
      providerDraftMessageId: existingDraft?.providerDraftMessageId,
      providerDraftId: existingDraft?.providerDraftId,
      providerConversationId: existingDraft?.conversationId,
      providerFolderIds: [MAIL_LOCAL_DRAFT_FOLDER_ID],
      from: {
        address: identity.address,
        ...(identity.displayName ? { name: identity.displayName } : {}),
      },
      to: input.to,
      cc: input.cc ?? [],
      bcc: input.bcc ?? [],
      replyTo: [],
      references: existingDraft?.references ?? [],
      inReplyTo: existingDraft?.inReplyTo,
      subject: input.subject,
      preview: input.text.slice(0, 240),
      text: input.text,
      html: input.html,
      read: true,
      starred: existingDraft?.starred ?? false,
      draft: true,
      attachments,
      draftConflict: existingDraft?.draftConflict,
    };
  }

  private async loadLocalDraftAttachments(
    context: MailOperationContext,
    input: import('../types.js').MailComposeInput,
    existingDraft?: MailMessage,
  ): Promise<readonly NormalizedMailAttachment[]> {
    const retained =
      input.retainedAttachmentIds === undefined
        ? (existingDraft?.attachments ?? [])
        : (existingDraft?.attachments ?? []).filter((attachment) =>
            input.retainedAttachmentIds?.includes(attachment.id),
          );
    const attachments: NormalizedMailAttachment[] = retained.map(
      (attachment) => ({
        providerAttachmentId: attachment.providerAttachmentId,
        outboundAttachmentId: attachment.outboundAttachmentId,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        contentId: attachment.contentId,
        inline: attachment.inline,
      }),
    );
    for (const attachmentId of input.attachmentIds ?? []) {
      const metadata = await this.dependencies.store.getOutboundAttachment(
        context.actorId,
        attachmentId,
      );
      if (!metadata) throw new Error('Mail outbound attachment was not found.');
      if (
        attachments.some(
          (attachment) => attachment.providerAttachmentId === attachmentId,
        )
      )
        continue;
      attachments.push({
        providerAttachmentId: attachmentId,
        outboundAttachmentId: attachmentId,
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        size: metadata.size,
        inline: false,
      });
    }
    return attachments;
  }
}

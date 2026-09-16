import {
  type MailAttachmentContent,
  type MailOperationContext,
  type MailOutboundAttachmentView,
  type MailUploadAttachmentInput,
} from '../types.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';
import { isLocalDraftMessage } from './draft-content.js';
import { assertProviderResult } from './errors.js';
import { closeAdapter, finalizeStream } from './provider-lifecycle.js';

export class MailAttachmentsService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      'outboundAttachments' | 'store' | 'adapters'
    >,
  ) {}

  public async uploadAttachment(
    context: MailOperationContext,
    input: MailUploadAttachmentInput,
  ): Promise<MailOutboundAttachmentView> {
    const storage = this.dependencies.outboundAttachments;
    if (!storage) throw new Error('Mail attachment storage is not configured.');
    return storage.create(context.actorId, input);
  }

  public async getAttachment(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<MailAttachmentContent> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    const message = await this.dependencies.store.getMessage(
      context.actorId,
      accountId,
      messageId,
    );
    if (!message) throw new Error('Mail message was not found.');
    const attachment = message.attachments.find(
      (item) =>
        item.id === attachmentId || item.providerAttachmentId === attachmentId,
    );
    if (!attachment) throw new Error('Mail attachment was not found.');
    const localId =
      attachment.outboundAttachmentId ??
      (isLocalDraftMessage(message) &&
      (await this.dependencies.store.getOutboundAttachment(
        context.actorId,
        attachment.providerAttachmentId,
      ))
        ? attachment.providerAttachmentId
        : undefined);
    if (localId) {
      if (!this.dependencies.outboundAttachments)
        throw new Error('Mail attachment storage is not configured.');
      const content = await this.dependencies.outboundAttachments.open(
        context.actorId,
        localId,
      );
      return {
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        stream: content.stream,
      };
    }
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.getAttachment) {
        throw new Error(
          'The selected Mail Provider cannot download attachments.',
        );
      }
      const content = assertProviderResult(
        await adapter.getAttachment(
          message.providerMessageId,
          attachment.providerAttachmentId,
          context.signal,
        ),
      );
      return {
        ...content,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size || content.size,
        stream: finalizeStream(content.stream, () => closeAdapter(adapter)),
      };
    } catch (error) {
      await closeAdapter(adapter);
      throw error;
    }
  }
}

import { type DatabaseManager } from '@nocobase/db';
import {
  type MailOutboundAttachment,
  type NormalizedMailAttachment,
} from '../../shared/mail.js';
import { type MessageRow, type OutboundAttachmentRow } from './rows.js';
import { parseJson } from './serialization.js';

export class MailAttachmentsStore {
  public constructor(private readonly database: DatabaseManager) {}

  public async createOutboundAttachment(
    attachment: MailOutboundAttachment,
  ): Promise<void> {
    await this.database
      .query()
      .insertInto<OutboundAttachmentRow>('mailOutboundAttachments')
      .values({ ...attachment })
      .execute();
  }

  public async getOutboundAttachment(
    userId: string,
    attachmentId: string,
  ): Promise<MailOutboundAttachment | undefined> {
    const row = await this.database
      .query()
      .selectFrom<OutboundAttachmentRow>('mailOutboundAttachments')
      .selectAll()
      .where('id', '=', attachmentId)
      .where('userId', '=', userId)
      .executeTakeFirst<OutboundAttachmentRow>();
    if (!row || row.expiresAt > new Date().toISOString()) return row;
    const retained = await this.findDraftUploadReferences([row]);
    return retained.has(row.id) ? row : undefined;
  }

  public async extendOutboundAttachments(
    userId: string,
    attachmentIds: readonly string[],
    expiresAt: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) return;
    await this.database
      .query()
      .updateTable<OutboundAttachmentRow>('mailOutboundAttachments')
      .set({ expiresAt })
      .where('userId', '=', userId)
      .where('id', 'in', attachmentIds)
      .where('expiresAt', '<', expiresAt)
      .execute();
  }

  public async listExpiredOutboundAttachments(
    now: string,
    limit: number,
    after?: Pick<MailOutboundAttachment, 'expiresAt' | 'id'>,
  ): Promise<readonly MailOutboundAttachment[]> {
    let query = this.database
      .query()
      .selectFrom<OutboundAttachmentRow>('mailOutboundAttachments')
      .selectAll()
      .where('expiresAt', '<=', now);
    if (after) {
      query = query.where((builder) =>
        builder.eb.or([
          builder.eb('expiresAt', '>', after.expiresAt),
          builder.eb.and([
            builder.eb('expiresAt', '=', after.expiresAt),
            builder.eb('id', '>', after.id),
          ]),
        ]),
      );
    }
    const baseQuery = query;
    const available: MailOutboundAttachment[] = [];
    while (available.length < limit) {
      const candidates = await query
        .orderBy('expiresAt', 'asc')
        .orderBy('id', 'asc')
        .limit(limit)
        .execute<OutboundAttachmentRow>();
      const retained = await this.findDraftUploadReferences(candidates);
      for (const candidate of candidates) {
        if (!retained.has(candidate.id)) available.push(candidate);
        if (available.length === limit) return available;
      }
      const last = candidates.at(-1);
      if (!last || candidates.length < limit) break;
      query = baseQuery.where((builder) =>
        builder.eb.or([
          builder.eb('expiresAt', '>', last.expiresAt),
          builder.eb.and([
            builder.eb('expiresAt', '=', last.expiresAt),
            builder.eb('id', '>', last.id),
          ]),
        ]),
      );
    }
    return available;
  }

  private async findDraftUploadReferences(
    uploads: readonly MailOutboundAttachment[],
  ): Promise<ReadonlySet<string>> {
    const candidates = new Map(
      uploads.map((upload) => [upload.id, upload.userId]),
    );
    const retained = new Set<string>();
    if (candidates.size === 0) return retained;
    let afterId: string | undefined;
    while (true) {
      let query = this.database
        .query()
        .selectFrom<MessageRow>('mailMessages')
        .innerJoin('mailAccounts', 'mailAccounts.id', 'mailMessages.accountId')
        .select([
          'mailMessages.id',
          'mailMessages.providerMessageId',
          'mailMessages.attachments',
          'mailAccounts.userId',
        ])
        .where('mailMessages.draft', '=', true)
        .where('mailAccounts.userId', 'in', [...new Set(candidates.values())]);
      if (afterId) query = query.where('mailMessages.id', '>', afterId);
      const drafts = await query
        .orderBy('mailMessages.id', 'asc')
        .limit(200)
        .execute<
          Pick<MessageRow, 'id' | 'providerMessageId' | 'attachments'> & {
            userId: string;
          }
        >();
      for (const draft of drafts) {
        for (const attachment of parseJson<readonly NormalizedMailAttachment[]>(
          draft.attachments,
          'draft attachments',
        )) {
          const id =
            attachment.outboundAttachmentId ??
            (draft.providerMessageId.startsWith('local-draft:')
              ? attachment.providerAttachmentId
              : undefined);
          if (id && candidates.get(id) === draft.userId) retained.add(id);
        }
      }
      if (drafts.length < 200 || retained.size === candidates.size)
        return retained;
      afterId = drafts.at(-1)?.id;
    }
  }

  public async deleteOutboundAttachment(
    attachmentId: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom<OutboundAttachmentRow>('mailOutboundAttachments')
      .where('id', '=', attachmentId)
      .execute();
    return result.deletedCount === 1;
  }
}

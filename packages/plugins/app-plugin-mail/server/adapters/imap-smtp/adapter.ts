import { ImapFlow, type FetchMessageObject, type ListResponse } from 'imapflow';
import { type Transporter } from 'nodemailer';
import { simpleParser } from 'mailparser';

import type {
  MailAccount,
  MailAttachmentContent,
  MailProviderAdapter,
  MailProviderContext,
  MailProviderFolderPage,
  MailProviderListChangesInput,
  MailProviderListFoldersInput,
  MailProviderListMessagesInput,
  MailProviderMessagePage,
  MailProviderResult,
  MailProviderSendInput,
  MailProviderSendResult,
  MailSyncCursor,
  NormalizedMailFolder,
  NormalizedMailMessage,
} from '../../types.js';

import type {
  ImapFolderCursor,
  ImapSmtpCredential,
  ImapSyncCursor,
} from './types.js';
import type { ImapSmtpMailProviderConfig } from './config.js';
import { IMAP_SMTP_CAPABILITIES, MAX_IMAP_MESSAGE_BYTES } from './constants.js';
import { createImapClient, createSmtpTransport } from './connection.js';
import {
  encodeHistoryCursor,
  encodeMessageLocator,
  folderCursor,
  parseHistoryCursor,
  parseMessageLocator,
  parseSyncCursor,
  rangeFor,
  requireAttachmentLocator,
  requireMessageLocator,
  syncCursor,
} from './locators.js';
import { folderType, folderTypeFromPath } from './folders.js';
import {
  addresses,
  bufferStream,
  envelopeAddress,
  envelopeAddresses,
  normalizeAttachment,
  preview,
  references,
  toHeader,
  toIsoDate,
} from './normalize.js';
import { classifyError, failure, throwIfAborted } from './errors.js';

export class ImapSmtpAdapter implements MailProviderAdapter {
  public readonly identity: MailAccount['provider'];
  public readonly capabilities: MailProviderAdapter['capabilities'] =
    IMAP_SMTP_CAPABILITIES;
  private imapClient?: ImapFlow;
  private readonly smtpTransport: Transporter;

  public constructor(
    _context: MailProviderContext,
    private readonly config: ImapSmtpMailProviderConfig,
    account: MailAccount,
    private readonly credential: ImapSmtpCredential,
  ) {
    this.identity = account.provider;
    this.smtpTransport = createSmtpTransport(config.smtp, credential);
  }

  public async listFolders(
    input: MailProviderListFoldersInput,
  ): Promise<MailProviderResult<MailProviderFolderPage>> {
    try {
      throwIfAborted(input.signal);
      const mailboxes = await this.listMailboxes();
      return {
        ok: true,
        value: {
          folders: mailboxes.map((mailbox) => this.normalizeFolder(mailbox)),
          completeProviderFolderIds: mailboxes.map((mailbox) => mailbox.path),
        },
      };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_LIST_FOLDERS') };
    }
  }

  public async getCurrentSyncCursor(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailSyncCursor>> {
    try {
      throwIfAborted(signal);
      const mailboxes = await this.listMailboxes();
      const folders: Record<string, ImapFolderCursor> = {};
      for (const mailbox of mailboxes) {
        throwIfAborted(signal);
        const status = await (
          await this.imap()
        ).status(mailbox.path, {
          uidNext: true,
          uidValidity: true,
        });
        folders[mailbox.path] = folderCursor(
          status.uidValidity,
          status.uidNext,
        );
      }
      return { ok: true, value: syncCursor({ version: 1, folders }) };
    } catch (error) {
      return {
        ok: false,
        error: classifyError(error, 'IMAP_SYNC_CURSOR'),
      };
    }
  }

  public async listMessages(
    input: MailProviderListMessagesInput,
  ): Promise<MailProviderResult<MailProviderMessagePage>> {
    try {
      throwIfAborted(input.signal);
      const folders = input.providerFolderIds?.length
        ? [...input.providerFolderIds]
        : (await this.listMailboxes()).map((mailbox) => mailbox.path);
      const position = parseHistoryCursor(input.cursor);
      const limit = Math.max(1, input.limit ?? 100);
      const messages: NormalizedMailMessage[] = [];
      let folderIndex = position.folderIndex;
      let upperUid = position.upperUid;
      let legacyOffset = position.legacyOffset;
      while (folderIndex < folders.length && messages.length < limit) {
        throwIfAborted(input.signal);
        const folder = folders[folderIndex];
        const mailbox = await (
          await this.imap()
        ).mailboxOpen(folder, {
          readOnly: true,
        });
        const remaining = limit - messages.length;
        let selected: number[];
        if (legacyOffset !== undefined) {
          const result = await (
            await this.imap()
          ).search({ all: true }, { uid: true });
          const uids = Array.isArray(result)
            ? [...result].sort((left, right) => right - left)
            : [];
          selected = uids.slice(legacyOffset, legacyOffset + remaining);
          legacyOffset = undefined;
          upperUid = selected.at(-1) ? (selected.at(-1) as number) - 1 : 0;
        } else {
          const maxUid =
            upperUid ?? Math.max(0, Number(mailbox.uidNext ?? 1) - 1);
          if (maxUid < 1) {
            folderIndex += 1;
            upperUid = undefined;
            continue;
          }
          const start = Math.max(1, maxUid - remaining + 1);
          const result = await (
            await this.imap()
          ).search({ uid: rangeFor(start, maxUid) }, { uid: true });
          selected = Array.isArray(result)
            ? [...result].sort((left, right) => right - left)
            : [];
          upperUid = start - 1;
        }
        for (const message of await this.fetchMessages(
          folder,
          String(mailbox.uidValidity),
          selected,
          input.signal,
        )) {
          if (
            input.receivedAfter &&
            message.receivedAt &&
            message.receivedAt < input.receivedAfter
          ) {
            continue;
          }
          messages.push(message);
        }
        if (upperUid < 1) {
          folderIndex += 1;
          upperUid = undefined;
        }
      }
      const nextCursor =
        folderIndex < folders.length
          ? encodeHistoryCursor({ folderIndex, upperUid })
          : undefined;
      return {
        ok: true,
        value: {
          messages,
          nextCursor,
          syncCursor: input.cursor ? undefined : input.baselineCursor,
        },
      };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_LIST_MESSAGES') };
    }
  }

  public async listChanges(input: MailProviderListChangesInput): Promise<
    MailProviderResult<{
      readonly messages: readonly NormalizedMailMessage[];
      readonly deletedProviderMessageIds: readonly string[];
      readonly nextCursor: MailSyncCursor;
      readonly hasMore: boolean;
    }>
  > {
    try {
      throwIfAborted(input.signal);
      let previous: ImapSyncCursor;
      try {
        previous = parseSyncCursor(input.cursor);
      } catch {
        return {
          ok: false,
          error: {
            code: 'IMAP_SYNC_CURSOR_INVALID',
            message: 'The IMAP sync cursor is invalid.',
            category: 'provider',
            retryable: false,
          },
        };
      }
      const mailboxes = await this.listMailboxes();
      const nextFolders: Record<string, ImapFolderCursor> = {};
      const messages: NormalizedMailMessage[] = [];
      let hasMore = false;
      const limit = Math.max(1, input.limit);

      for (const [mailboxIndex, mailbox] of mailboxes.entries()) {
        throwIfAborted(input.signal);
        const currentStatus = await (
          await this.imap()
        ).status(mailbox.path, {
          uidNext: true,
          uidValidity: true,
        });
        const current = folderCursor(
          currentStatus.uidValidity,
          currentStatus.uidNext,
        );
        const old = previous.folders[mailbox.path];
        if (old && old.uidValidity !== current.uidValidity) {
          return {
            ok: false,
            error: {
              code: 'IMAP_SYNC_CURSOR_INVALID',
              message: `The IMAP UIDVALIDITY changed for ${mailbox.path}.`,
              category: 'provider',
              retryable: false,
            },
          };
        }
        const start = old?.uidNext ?? 1;
        const end = Math.max(start - 1, current.uidNext - 1);
        let nextUid = start;
        if (start <= end) {
          const remaining = limit - messages.length;
          await (
            await this.imap()
          ).mailboxOpen(mailbox.path, { readOnly: true });
          const fetched = await this.fetchMessages(
            mailbox.path,
            current.uidValidity,
            rangeFor(start, end),
            input.signal,
            remaining,
          );
          messages.push(...fetched);
          if (fetched.length < remaining) {
            // IMAP UIDs are sparse: a short fetch can simply mean that the
            // requested range contains holes, not that the page is full.
            nextUid = end + 1;
          } else {
            const lastUid = fetched.at(-1)?.providerMessageId;
            const locator = lastUid ? parseMessageLocator(lastUid) : undefined;
            nextUid = locator ? locator.uid + 1 : end + 1;
          }
          if (nextUid <= end) hasMore = true;
        } else {
          nextUid = current.uidNext;
        }
        nextFolders[mailbox.path] = {
          uidValidity: current.uidValidity,
          uidNext: nextUid,
        };
        if (messages.length >= limit) {
          hasMore = hasMore || mailboxIndex < mailboxes.length - 1;
          break;
        }
      }

      for (const mailbox of mailboxes) {
        if (!nextFolders[mailbox.path]) {
          const state = await this.folderState(mailbox.path);
          nextFolders[mailbox.path] = previous.folders[mailbox.path]
            ? previous.folders[mailbox.path]
            : { ...state, uidNext: 1 };
        }
      }
      return {
        ok: true,
        value: {
          messages,
          deletedProviderMessageIds: [],
          nextCursor: syncCursor({ version: 1, folders: nextFolders }),
          hasMore,
        },
      };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_LIST_CHANGES') };
    }
  }

  public async getMessage(
    providerMessageId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    try {
      throwIfAborted(signal);
      const locator = requireMessageLocator(providerMessageId);
      const mailbox = await (
        await this.imap()
      ).mailboxOpen(locator.folder, {
        readOnly: true,
      });
      const message = await (
        await this.imap()
      ).fetchOne(
        locator.uid,
        {
          uid: true,
          size: true,
          flags: true,
          internalDate: true,
          envelope: true,
          source: { maxLength: MAX_IMAP_MESSAGE_BYTES },
        },
        { uid: true },
      );
      if (!message)
        return failure(
          'IMAP_MESSAGE_NOT_FOUND',
          'IMAP message was not found.',
          'provider',
          false,
        );
      if ((message.size ?? 0) > MAX_IMAP_MESSAGE_BYTES) {
        return failure(
          'IMAP_MESSAGE_TOO_LARGE',
          'IMAP message exceeds the configured message size limit.',
          'content',
          false,
        );
      }
      return {
        ok: true,
        value: await this.normalizeMessage(
          locator.folder,
          String(mailbox.uidValidity),
          message,
        ),
      };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_GET_MESSAGE') };
    }
  }

  public async getAttachment(
    _providerMessageId: string,
    providerAttachmentId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailAttachmentContent>> {
    try {
      throwIfAborted(signal);
      const locator = requireAttachmentLocator(providerAttachmentId);
      await (
        await this.imap()
      ).mailboxOpen(locator.folder, {
        readOnly: true,
      });
      const message = await (
        await this.imap()
      ).fetchOne(
        locator.uid,
        {
          uid: true,
          size: true,
          source: { maxLength: MAX_IMAP_MESSAGE_BYTES },
        },
        { uid: true },
      );
      if (!message || !message.source) {
        return failure(
          'IMAP_ATTACHMENT_NOT_FOUND',
          'IMAP message source was not found.',
          'provider',
          false,
        );
      }
      if ((message.size ?? 0) > MAX_IMAP_MESSAGE_BYTES) {
        return failure(
          'IMAP_MESSAGE_TOO_LARGE',
          'IMAP message exceeds the configured message size limit.',
          'content',
          false,
        );
      }
      const parsed = await simpleParser(message.source);
      const attachment = parsed.attachments[locator.attachment];
      if (!attachment) {
        return failure(
          'IMAP_ATTACHMENT_NOT_FOUND',
          'IMAP attachment was not found.',
          'provider',
          false,
        );
      }
      return {
        ok: true,
        value: {
          fileName: attachment.filename ?? 'attachment',
          contentType: attachment.contentType,
          size: attachment.size,
          stream: bufferStream(attachment.content),
        },
      };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_GET_ATTACHMENT') };
    }
  }

  public async sendMessage(
    input: MailProviderSendInput,
  ): Promise<MailProviderSendResult> {
    try {
      throwIfAborted(input.signal);
      const attachments = [];
      for (const attachment of input.message.attachments) {
        throwIfAborted(input.signal);
        const content = Buffer.from(
          await new Response(await attachment.open()).arrayBuffer(),
        );
        if (content.byteLength !== attachment.size) {
          throw new Error('Mail attachment size changed before submission.');
        }
        attachments.push({
          filename: attachment.fileName,
          content,
          contentType: attachment.contentType,
          contentDisposition: attachment.inline
            ? ('inline' as const)
            : ('attachment' as const),
          cid: attachment.contentId,
        });
      }
      const info = (await this.smtpTransport.sendMail({
        from: toHeader({
          address: input.identity.address,
          name: input.identity.displayName,
        }),
        to: input.message.to.map(toHeader),
        cc: input.message.cc.map(toHeader),
        bcc: input.message.bcc.map(toHeader),
        subject: input.message.subject,
        text: input.message.text,
        html: input.message.html,
        messageId: input.message.internetMessageId,
        headers: {
          ...(input.message.inReplyTo
            ? { 'In-Reply-To': input.message.inReplyTo }
            : {}),
          ...(input.message.references.length > 0
            ? { References: input.message.references.join(' ') }
            : {}),
        },
        attachments,
      })) as { messageId?: string };
      return {
        status: 'accepted',
        providerMessageId: info.messageId,
        internetMessageId: info.messageId,
      };
    } catch (error) {
      const classified = classifyError(error, 'SMTP_SEND');
      return {
        status:
          classified.category === 'network' && classified.retryable
            ? 'submission_unknown'
            : 'failed',
        error: classified,
      };
    }
  }

  public async setRead(
    providerMessageId: string,
    read: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.updateFlags(providerMessageId, '\\Seen', read, signal);
  }

  public async setStarred(
    providerMessageId: string,
    starred: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.updateFlags(providerMessageId, '\\Flagged', starred, signal);
  }

  public async deleteMessage(
    providerMessageId: string,
    _permanently: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    try {
      throwIfAborted(signal);
      const locator = requireMessageLocator(providerMessageId);
      const client = await this.imap();
      await client.mailboxOpen(locator.folder);
      await client.messageDelete(locator.uid, { uid: true });
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_DELETE_MESSAGE') };
    }
  }

  public async close(): Promise<void> {
    this.smtpTransport.close();
    if (!this.imapClient) return;
    try {
      await this.imapClient.logout();
    } catch {
      this.imapClient.close();
    } finally {
      this.imapClient = undefined;
    }
  }

  private async updateFlags(
    providerMessageId: string,
    flag: string,
    enabled: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    try {
      throwIfAborted(signal);
      const locator = requireMessageLocator(providerMessageId);
      const client = await this.imap();
      await client.mailboxOpen(locator.folder);
      const method = enabled ? 'messageFlagsAdd' : 'messageFlagsRemove';
      await client[method](locator.uid, [flag], { uid: true });
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: classifyError(error, 'IMAP_UPDATE_FLAGS') };
    }
  }

  private async imap(): Promise<ImapFlow> {
    if (this.imapClient) return this.imapClient;
    const client = createImapClient(this.config.imap, this.credential);
    await client.connect();
    this.imapClient = client;
    return client;
  }

  private async listMailboxes(): Promise<ListResponse[]> {
    const client = await this.imap();
    return client.list({
      statusQuery: {
        messages: true,
        unseen: true,
        uidNext: true,
        uidValidity: true,
      },
      specialUseHints: {
        sent: this.config.sentFolder,
        trash: this.config.trashFolder,
        drafts: this.config.draftsFolder,
      },
    });
  }

  private async folderState(path: string): Promise<ImapFolderCursor> {
    const status = await (
      await this.imap()
    ).status(path, {
      uidNext: true,
      uidValidity: true,
    });
    return folderCursor(status.uidValidity, status.uidNext);
  }

  private normalizeFolder(mailbox: ListResponse): NormalizedMailFolder {
    return {
      providerFolderId: mailbox.path,
      type: folderType(mailbox),
      name: mailbox.name || mailbox.path,
      unreadCount: mailbox.status?.unseen,
      kind: 'folder',
    };
  }

  private async fetchMessages(
    folder: string,
    uidValidity: string,
    uids: number[] | string,
    signal?: AbortSignal,
    limit?: number,
  ): Promise<NormalizedMailMessage[]> {
    if (typeof uids === 'string' && uids.length === 0) return [];
    const messages: NormalizedMailMessage[] = [];
    const client = await this.imap();
    for await (const message of client.fetch(
      uids,
      {
        uid: true,
        size: true,
        flags: true,
        internalDate: true,
        envelope: true,
        source: { maxLength: MAX_IMAP_MESSAGE_BYTES },
      },
      { uid: true },
    )) {
      throwIfAborted(signal);
      if ((message.size ?? 0) > MAX_IMAP_MESSAGE_BYTES) {
        const error = new Error(
          'IMAP message exceeds the configured message size limit.',
        );
        Object.assign(error, { code: 'IMAP_MESSAGE_TOO_LARGE' });
        throw error;
      }
      messages.push(await this.normalizeMessage(folder, uidValidity, message));
      if (limit !== undefined && messages.length >= limit) break;
    }
    return messages;
  }

  private async normalizeMessage(
    folder: string,
    uidValidity: string,
    message: FetchMessageObject,
  ): Promise<NormalizedMailMessage> {
    const parsed = message.source
      ? await simpleParser(message.source)
      : undefined;
    const from = parsed
      ? addresses(parsed.from)[0]
      : envelopeAddress(message.envelope?.from?.[0]);
    const to = parsed
      ? addresses(parsed.to)
      : envelopeAddresses(message.envelope?.to);
    const cc = parsed
      ? addresses(parsed.cc)
      : envelopeAddresses(message.envelope?.cc);
    const bcc = parsed
      ? addresses(parsed.bcc)
      : envelopeAddresses(message.envelope?.bcc);
    const replyTo = parsed
      ? addresses(parsed.replyTo)
      : envelopeAddresses(message.envelope?.replyTo);
    const receivedAt = toIsoDate(parsed?.date ?? message.internalDate);
    const attachments = parsed
      ? parsed.attachments.map((attachment, index) =>
          normalizeAttachment(
            folder,
            uidValidity,
            message.uid,
            attachment,
            index,
          ),
        )
      : [];
    const flags = message.flags ?? new Set<string>();
    const providerMessageId = encodeMessageLocator({
      folder,
      uidValidity,
      uid: message.uid,
    });
    return {
      providerMessageId,
      internetMessageId: parsed?.messageId ?? message.envelope?.messageId,
      providerFolderIds: [folder],
      from,
      to,
      cc,
      bcc,
      replyTo,
      inReplyTo: parsed?.inReplyTo ?? message.envelope?.inReplyTo,
      references: references(parsed?.references),
      subject: parsed?.subject ?? message.envelope?.subject ?? '',
      preview: preview(parsed?.text),
      text: parsed?.text,
      html: parsed?.html === false ? undefined : parsed?.html,
      receivedAt,
      sentAt: receivedAt,
      read: flags.has('\\Seen'),
      starred: flags.has('\\Flagged'),
      draft: flags.has('\\Draft') || folderTypeFromPath(folder) === 'drafts',
      attachments,
    };
  }
}

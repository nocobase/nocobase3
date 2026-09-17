import {
  ImapFlow,
  type FetchMessageObject,
  type ListResponse,
  type MailboxObject,
  type MessageStructureObject,
} from 'imapflow';
import { type Transporter } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { randomUUID } from 'node:crypto';
import { simpleParser } from 'mailparser';

import type {
  MailAccount,
  MailAttachmentContent,
  MailProviderAdapter,
  MailProviderContext,
  MailProviderError,
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
  NormalizedMailAttachment,
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
  encodeAttachmentLocator,
  encodeMessageLocator,
  folderCursor,
  parseHistoryCursor,
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
        folders[mailbox.path] = await this.folderState(mailbox.path);
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
      let position: ReturnType<typeof parseHistoryCursor>;
      try {
        position = parseHistoryCursor(input.cursor);
      } catch {
        return failure(
          'IMAP_SYNC_CURSOR_INVALID',
          'Invalid history cursor; rescan is required.',
          'provider',
          false,
        );
      }
      const limit = Math.max(1, input.limit ?? 100);
      const messages: NormalizedMailMessage[] = [];
      let folderIndex = position.folderIndex;
      let upperUid = position.upperUid;
      let legacyOffset = position.legacyOffset;
      let scannedRanges = 0;
      while (
        folderIndex < folders.length &&
        messages.length < limit &&
        scannedRanges < 10
      ) {
        scannedRanges += 1;
        throwIfAborted(input.signal);
        const folder = folders[folderIndex];
        const mailbox = await (
          await this.imap()
        ).mailboxOpen(folder, {
          readOnly: true,
        });
        const baseline = parseSyncCursor(input.baselineCursor).folders[folder];
        if (baseline && baseline.uidValidity !== String(mailbox.uidValidity)) {
          return failure(
            'IMAP_SYNC_CURSOR_INVALID',
            'IMAP mailbox generation changed during history sync.',
            'provider',
            false,
          );
        }
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
            upperUid ?? (await this.selectedFolderState(mailbox)).uidNext - 1;
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
            Date.parse(message.receivedAt) < Date.parse(input.receivedAfter)
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
        const current = await this.folderState(mailbox.path);
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
        const end = Math.min(
          current.uidNext - 1,
          start + limit - messages.length - 1,
        );
        let nextUid = start;
        if (start <= end) {
          const selected = await (
            await this.imap()
          ).mailboxOpen(mailbox.path, { readOnly: true });
          if (String(selected.uidValidity) !== current.uidValidity)
            return failure(
              'IMAP_SYNC_CURSOR_INVALID',
              'Mailbox generation changed before fetching.',
              'provider',
              false,
            );
          const fetched = await this.fetchMessages(
            mailbox.path,
            current.uidValidity,
            rangeFor(start, end),
            input.signal,
          );
          messages.push(...fetched);
          // Complete the bounded UID range before advancing, regardless of response order or holes.
          nextUid = end + 1;
          if (nextUid < current.uidNext) hasMore = true;
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
      if (String(mailbox.uidValidity) !== locator.uidValidity) {
        return failure(
          'IMAP_SYNC_CURSOR_INVALID',
          'The mailbox generation changed; synchronization must recover first.',
          'provider',
          false,
        );
      }
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
          source: true,
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
      const selected = await (
        await this.imap()
      ).mailboxOpen(locator.folder, { readOnly: true });
      if (String(selected.uidValidity) !== locator.uidValidity)
        return failure(
          'IMAP_SYNC_CURSOR_INVALID',
          'Mailbox generation changed before downloading.',
          'provider',
          false,
        );
      const message = await (
        await this.imap()
      ).fetchOne(
        locator.uid,
        {
          uid: true,
          size: true,
          source: true,
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
    let submissionStarted = false;
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
      const mail = {
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
        messageId:
          input.message.internetMessageId ??
          `<${randomUUID()}@${input.identity.address.split('@')[1]}>`,
        date: new Date(),
        headers: {
          ...(input.message.inReplyTo
            ? { 'In-Reply-To': input.message.inReplyTo }
            : {}),
          ...(input.message.references.length > 0
            ? { References: input.message.references.join(' ') }
            : {}),
        },
        attachments,
      };
      let sentCopy: Buffer | undefined;
      if (this.config.sentCopyMode === 'client') {
        const composer = new MailComposer(mail).compile();
        composer.keepBcc = true;
        sentCopy = await composer.build();
      }
      submissionStarted = true;
      const info = (await this.smtpTransport.sendMail(mail)) as {
        messageId?: string;
        accepted?: readonly (string | { address: string })[];
        rejected?: readonly (string | { address: string })[];
      };
      const recipientError: MailProviderError | undefined = info.rejected
        ?.length
        ? {
            code: 'SMTP_RECIPIENTS_REJECTED',
            message:
              'The SMTP server rejected some recipients after accepting others.',
            category: 'recipient',
            // Retrying the entire submission would duplicate accepted deliveries.
            retryable: false,
            recipients: {
              accepted: (info.accepted ?? []).map((recipient) =>
                typeof recipient === 'string' ? recipient : recipient.address,
              ),
              rejected: info.rejected.map((recipient) =>
                typeof recipient === 'string' ? recipient : recipient.address,
              ),
            },
          }
        : undefined;
      const internetMessageId = info.messageId ?? mail.messageId;
      let sentCopyError;
      if (sentCopy) {
        try {
          const folders = await this.listMailboxes();
          const folder =
            this.config.sentFolder ??
            folders.find((item) => folderType(item) === 'sent')?.path;
          if (!folder)
            throw new Error(
              'Configure sentFolder or provide an IMAP folder marked as Sent.',
            );
          const client = await this.imap();
          await client.mailboxOpen(folder, { readOnly: true });
          const existing = await client.search(
            { header: { 'Message-ID': internetMessageId } },
            { uid: true },
          );
          if (!Array.isArray(existing) || existing.length === 0) {
            if (
              !(await client.append(folder, sentCopy, ['\\Seen'], mail.date))
            ) {
              throw new Error(
                'The IMAP server did not confirm the sent copy was saved.',
              );
            }
          }
        } catch (error) {
          // SMTP already accepted the message; never report this as a send failure.
          sentCopyError = {
            ...classifyError(error, 'IMAP_SAVE_SENT_COPY'),
            code: 'IMAP_SENT_COPY_FAILED',
            retryable: false,
          };
        }
      }
      return {
        status: 'accepted',
        providerMessageId: internetMessageId,
        internetMessageId,
        ...(sentCopyError ? { sentCopyError } : {}),
        ...(recipientError ? { recipientError } : {}),
      };
    } catch (error) {
      const classified = classifyError(error, 'SMTP_SEND');
      return {
        status:
          submissionStarted &&
          (classified.category === 'network' ||
            classified.category === 'timeout') &&
          classified.retryable
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
    permanently: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    if (!permanently) {
      return failure(
        'IMAP_SOFT_DELETE_UNSUPPORTED',
        'This IMAP Provider cannot move messages to Trash. Delete them in your mail client instead.',
        'configuration',
        false,
      );
    }
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
    if (status.uidNext !== undefined && status.uidValidity !== undefined) {
      return folderCursor(status.uidValidity, status.uidNext);
    }
    const mailbox = await (
      await this.imap()
    ).mailboxOpen(path, { readOnly: true });
    return this.selectedFolderState(mailbox);
  }

  private async selectedFolderState(
    mailbox: MailboxObject,
  ): Promise<ImapFolderCursor> {
    if (mailbox.uidNext !== undefined) {
      return folderCursor(mailbox.uidValidity, mailbox.uidNext);
    }
    // Some servers (including Coremail/163) omit UIDNEXT in both STATUS and
    // SELECT. Read the last sequence number's UID without downloading mail or
    // marking it read. Missing metadata must never masquerade as an empty inbox.
    if (mailbox.exists === 0) return folderCursor(mailbox.uidValidity, 1);
    if (Number.isSafeInteger(mailbox.exists) && mailbox.exists > 0) {
      const last = await (
        await this.imap()
      ).fetchOne(mailbox.exists, { uid: true }, { uid: false });
      if (last && Number.isSafeInteger(last.uid) && last.uid > 0) {
        return folderCursor(mailbox.uidValidity, last.uid + 1);
      }
    }
    throw Object.assign(
      new Error(
        'The IMAP server did not provide UIDNEXT and the last message UID could not be read. Retry synchronization after checking the mailbox connection.',
      ),
      { code: 'IMAP_INVALID_UIDNEXT' },
    );
  }

  private normalizeFolder(mailbox: ListResponse): NormalizedMailFolder {
    return {
      providerFolderId: mailbox.path,
      type:
        mailbox.path === this.config.sentFolder ? 'sent' : folderType(mailbox),
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
        bodyStructure: true,
        source: { maxLength: MAX_IMAP_MESSAGE_BYTES },
      },
      { uid: true },
    )) {
      throwIfAborted(signal);
      let normalized: NormalizedMailMessage;
      if ((message.size ?? 0) > MAX_IMAP_MESSAGE_BYTES) {
        normalized = {
          ...(await this.normalizeMessage(folder, uidValidity, {
            ...message,
            source: undefined,
          })),
          contentStatus: 'deferred',
          contentError: 'IMAP_MESSAGE_TOO_LARGE',
        };
      } else {
        try {
          normalized = await this.normalizeMessage(
            folder,
            uidValidity,
            message,
          );
        } catch {
          throwIfAborted(signal);
          normalized = {
            ...(await this.normalizeMessage(folder, uidValidity, {
              ...message,
              source: undefined,
            })),
            contentStatus: 'failed',
            contentError: 'IMAP_MESSAGE_PARSE_FAILED',
          };
        }
      }
      messages.push(normalized);
    }
    return messages;
  }

  private structureAttachments(
    folder: string,
    uidValidity: string,
    uid: number,
    structure?: MessageStructureObject,
  ): NormalizedMailAttachment[] {
    const attachments: NormalizedMailAttachment[] = [];
    const visit = (part: MessageStructureObject): void => {
      const name =
        part.dispositionParameters?.filename ?? part.parameters?.name;
      if (
        part.disposition === 'attachment' ||
        name ||
        (part.id && !part.type.startsWith('text/'))
      ) {
        attachments.push({
          providerAttachmentId: encodeAttachmentLocator({
            folder,
            uidValidity,
            uid,
            attachment: attachments.length,
          }),
          fileName: name ?? 'attachment',
          contentType: part.type,
          size: part.size ?? 0,
          inline: part.disposition === 'inline',
          contentId: part.id?.replace(/^<|>$/g, ''),
        });
      } else part.childNodes?.forEach(visit);
    };
    if (structure) visit(structure);
    return attachments;
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
    const receivedAt = toIsoDate(message.internalDate ?? parsed?.date);
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
      : this.structureAttachments(
          folder,
          uidValidity,
          message.uid,
          message.bodyStructure,
        );
    const flags = message.flags ?? new Set<string>();
    const providerMessageId = encodeMessageLocator({
      folder,
      uidValidity,
      uid: message.uid,
    });
    return {
      providerMessageId,
      contentStatus: 'complete',
      size: message.size,
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

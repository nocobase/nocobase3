import { ImapFlow, type FetchMessageObject, type ListResponse } from 'imapflow';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  simpleParser,
  type AddressObject,
  type EmailAddress,
} from 'mailparser';

import type {
  MailAccount,
  MailAddress,
  MailAttachmentContent,
  MailProviderAdapter,
  MailProviderConnection,
  MailProviderContext,
  MailProviderDefinition,
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
  NormalizedMailAttachment,
  NormalizedMailFolder,
  NormalizedMailMessage,
} from '@nocobase/app-plugin-mail/server/types';

import type {
  ImapSmtpEndpointConfig,
  ImapSmtpMailProviderConfig,
} from './config.js';

interface ImapSmtpCredential {
  readonly username: string;
  readonly password: string;
}

interface ImapFolderCursor {
  readonly uidValidity: string;
  readonly uidNext: number;
}

interface ImapSyncCursor {
  readonly version: 1;
  readonly folders: Readonly<Record<string, ImapFolderCursor>>;
}

interface MessageLocator {
  readonly folder: string;
  readonly uidValidity: string;
  readonly uid: number;
}

interface AttachmentLocator extends MessageLocator {
  readonly attachment: number;
}

const capabilities = {
  receive: true,
  send: true,
  incrementalSync: true,
  pushNotifications: false,
  folders: true,
  labels: false,
  drafts: false,
  moveMessage: false,
  aliases: false,
} as const;

export const imapSmtpMailProviderDefinition: MailProviderDefinition<ImapSmtpMailProviderConfig> =
  {
    type: 'imap-smtp',
    label: 'IMAP / SMTP',
    capabilities,
    validateConfig,
    connection: createConnection(),
    async createAdapter(
      context: MailProviderContext,
      config: ImapSmtpMailProviderConfig,
      account: MailAccount,
    ): Promise<MailProviderAdapter> {
      const credential = await context.credentials.get<ImapSmtpCredential>(
        account.credentialReference,
      );
      return new ImapSmtpAdapter(context, config, account, credential);
    },
  };

function createConnection(): MailProviderConnection<ImapSmtpMailProviderConfig> {
  return {
    async connect(context, config, input) {
      if (!input.address.trim()) {
        return failure(
          'IMAP_SMTP_ADDRESS_REQUIRED',
          'A mailbox address is required.',
          'configuration',
          false,
        );
      }
      if (!input.username.trim() || !input.password) {
        return failure(
          'IMAP_SMTP_CREDENTIALS_REQUIRED',
          'An IMAP username and password are required.',
          'authentication',
          false,
        );
      }
      try {
        await verifyConnections(config, {
          username: input.username,
          password: input.password,
        });
        const credentialReference = await context.credentials.put(
          {
            username: input.username,
            password: input.password,
          } satisfies ImapSmtpCredential,
          { purpose: 'account' },
        );
        return {
          ok: true,
          value: {
            address: input.address.trim().toLowerCase(),
            displayName: input.displayName?.trim() || undefined,
            authorizationSubject: input.username,
            credentialReference,
            scopes: [],
            identities: [
              {
                address: input.address.trim().toLowerCase(),
                displayName: input.displayName?.trim() || undefined,
                isPrimary: true,
                canSend: true,
              },
            ],
          },
        };
      } catch (error) {
        return { ok: false, error: classifyError(error, 'IMAP_SMTP_CONNECT') };
      }
    },
  };
}

class ImapSmtpAdapter implements MailProviderAdapter {
  public readonly identity: MailAccount['provider'];
  public readonly capabilities = capabilities;
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
      let offset = position.offset;
      while (folderIndex < folders.length && messages.length < limit) {
        throwIfAborted(input.signal);
        const folder = folders[folderIndex];
        const mailbox = await (
          await this.imap()
        ).mailboxOpen(folder, {
          readOnly: true,
        });
        const result = await (
          await this.imap()
        ).search({ all: true }, { uid: true });
        const uids = Array.isArray(result)
          ? [...result].sort((left, right) => right - left)
          : [];
        const selected = uids.slice(offset, offset + limit - messages.length);
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
        offset += selected.length;
        if (offset >= uids.length) {
          folderIndex += 1;
          offset = 0;
        }
        if (selected.length === 0) {
          folderIndex += 1;
          offset = 0;
        }
      }
      const nextCursor =
        folderIndex < folders.length
          ? encodeHistoryCursor({ folderIndex, offset })
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
            ? state
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
      await (
        await this.imap()
      ).mailboxOpen(locator.folder, {
        readOnly: true,
      });
      const message = await (
        await this.imap()
      ).fetchOne(locator.uid, { uid: true, source: true }, { uid: true });
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
    try {
      throwIfAborted(input.signal);
      const attachments = await Promise.all(
        input.message.attachments.map(async (attachment) => ({
          filename: attachment.fileName,
          content: Buffer.from(
            await new Response(await attachment.open()).arrayBuffer(),
          ),
          contentType: attachment.contentType,
          contentDisposition: attachment.inline
            ? ('inline' as const)
            : ('attachment' as const),
          cid: attachment.contentId,
        })),
      );
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
        flags: true,
        internalDate: true,
        envelope: true,
        source: true,
      },
      { uid: true },
    )) {
      throwIfAborted(signal);
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

function validateConfig(config: ImapSmtpMailProviderConfig): void {
  validateEndpoint(config.imap, 'IMAP');
  validateEndpoint(config.smtp, 'SMTP');
}

function validateEndpoint(
  endpoint: ImapSmtpEndpointConfig,
  label: string,
): void {
  if (!endpoint.host.trim()) throw new Error(`${label} host is required.`);
  if (
    !Number.isInteger(endpoint.port) ||
    endpoint.port < 1 ||
    endpoint.port > 65_535
  ) {
    throw new Error(`${label} port must be an integer between 1 and 65535.`);
  }
}

async function verifyConnections(
  config: ImapSmtpMailProviderConfig,
  credential: ImapSmtpCredential,
): Promise<void> {
  const imap = createImapClient(config.imap, credential);
  const smtp = createSmtpTransport(config.smtp, credential);
  try {
    await imap.connect();
    await smtp.verify();
  } finally {
    try {
      await imap.logout();
    } catch {
      imap.close();
    }
    smtp.close();
  }
}

function createImapClient(
  endpoint: ImapSmtpEndpointConfig,
  credential: ImapSmtpCredential,
): ImapFlow {
  return new ImapFlow({
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.secure,
    auth: { user: credential.username, pass: credential.password },
    logger: false,
    tls: { rejectUnauthorized: endpoint.rejectUnauthorized ?? true },
  });
}

function createSmtpTransport(
  endpoint: ImapSmtpEndpointConfig,
  credential: ImapSmtpCredential,
): Transporter {
  return nodemailer.createTransport({
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.secure,
    auth: { user: credential.username, pass: credential.password },
    tls: { rejectUnauthorized: endpoint.rejectUnauthorized ?? true },
  });
}

function folderType(mailbox: ListResponse): NormalizedMailFolder['type'] {
  const specialUse = mailbox.specialUse?.toLowerCase();
  if (specialUse === '\\inbox' || mailbox.path.toLowerCase() === 'inbox')
    return 'inbox';
  if (specialUse === '\\sent') return 'sent';
  if (specialUse === '\\drafts') return 'drafts';
  if (specialUse === '\\trash') return 'trash';
  if (specialUse === '\\junk') return 'junk';
  if (specialUse === '\\archive') return 'archive';
  return 'custom';
}

function folderTypeFromPath(path: string): NormalizedMailFolder['type'] {
  const normalized = path.toLowerCase();
  if (normalized === 'inbox') return 'inbox';
  if (normalized.includes('draft')) return 'drafts';
  return 'custom';
}

function folderCursor(
  uidValidity: bigint | undefined,
  uidNext: number | undefined,
): ImapFolderCursor {
  return {
    uidValidity: String(uidValidity ?? 0n),
    uidNext: Math.max(1, uidNext ?? 1),
  };
}

function syncCursor(value: ImapSyncCursor): MailSyncCursor {
  return { value: JSON.stringify(value), version: 'imap-v1' };
}

function parseSyncCursor(cursor: MailSyncCursor | undefined): ImapSyncCursor {
  if (!cursor) return { version: 1, folders: {} };
  const value = typeof cursor.value === 'string' ? cursor.value : undefined;
  if (!value) return { version: 1, folders: {} };
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object')
    throw new Error('Invalid IMAP sync cursor.');
  const record = parsed as { version?: unknown; folders?: unknown };
  if (
    record.version !== 1 ||
    !record.folders ||
    typeof record.folders !== 'object'
  ) {
    throw new Error('Invalid IMAP sync cursor.');
  }
  const folders: Record<string, ImapFolderCursor> = {};
  for (const [path, value] of Object.entries(record.folders)) {
    if (!isImapFolderCursor(value)) {
      throw new Error('Invalid IMAP sync cursor.');
    }
    folders[path] = value;
  }
  return { version: 1, folders };
}

function isImapFolderCursor(value: unknown): value is ImapFolderCursor {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.uidValidity === 'string' &&
    Number.isSafeInteger(record.uidNext) &&
    (record.uidNext as number) >= 1
  );
}

function parseHistoryCursor(cursor: string | undefined): {
  readonly folderIndex: number;
  readonly offset: number;
} {
  if (!cursor) return { folderIndex: 0, offset: 0 };
  const parsed: unknown = JSON.parse(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  );
  if (!parsed || typeof parsed !== 'object')
    throw new Error('Invalid IMAP history cursor.');
  const value = parsed as { folderIndex?: unknown; offset?: unknown };
  if (
    !Number.isSafeInteger(value.folderIndex) ||
    !Number.isSafeInteger(value.offset)
  ) {
    throw new Error('Invalid IMAP history cursor.');
  }
  return {
    folderIndex: Math.max(0, value.folderIndex as number),
    offset: Math.max(0, value.offset as number),
  };
}

function encodeHistoryCursor(value: {
  readonly folderIndex: number;
  readonly offset: number;
}): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function rangeFor(start: number, end: number): string {
  return start === end ? String(start) : `${start}:${end}`;
}

function encodeMessageLocator(locator: MessageLocator): string {
  return `imap:${Buffer.from(JSON.stringify(locator)).toString('base64url')}`;
}

function encodeAttachmentLocator(locator: AttachmentLocator): string {
  return `imap-attachment:${Buffer.from(JSON.stringify(locator)).toString('base64url')}`;
}

function parseMessageLocator(value: string): MessageLocator | undefined {
  if (!value.startsWith('imap:')) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value.slice('imap:'.length), 'base64url').toString('utf8'),
    );
    return isMessageLocator(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseAttachmentLocator(value: string): AttachmentLocator | undefined {
  if (!value.startsWith('imap-attachment:')) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value.slice('imap-attachment:'.length), 'base64url').toString(
        'utf8',
      ),
    );
    return isMessageLocator(parsed) &&
      typeof (parsed as { attachment?: unknown }).attachment === 'number'
      ? (parsed as AttachmentLocator)
      : undefined;
  } catch {
    return undefined;
  }
}

function requireMessageLocator(value: string): MessageLocator {
  const locator = parseMessageLocator(value);
  if (!locator) throw new Error('Invalid IMAP message identifier.');
  return locator;
}

function requireAttachmentLocator(value: string): AttachmentLocator {
  const locator = parseAttachmentLocator(value);
  if (!locator) throw new Error('Invalid IMAP attachment identifier.');
  return locator;
}

function isMessageLocator(value: unknown): value is MessageLocator {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.folder === 'string' &&
    typeof record.uidValidity === 'string' &&
    Number.isSafeInteger(record.uid)
  );
}

function normalizeAttachment(
  folder: string,
  uidValidity: string,
  uid: number,
  attachment: {
    filename?: string;
    contentType: string;
    size: number;
    contentId?: string;
    related?: boolean;
  },
  index: number,
): NormalizedMailAttachment {
  return {
    providerAttachmentId: encodeAttachmentLocator({
      folder,
      uidValidity,
      uid,
      attachment: index,
    }),
    fileName: attachment.filename ?? `attachment-${index + 1}`,
    contentType: attachment.contentType,
    size: attachment.size,
    contentId: attachment.contentId,
    inline: attachment.related ?? false,
  };
}

function addresses(
  value: AddressObject | AddressObject[] | undefined,
): MailAddress[] {
  const objects = value ? (Array.isArray(value) ? value : [value]) : [];
  return objects.flatMap((object) => object.value.flatMap(flattenAddress));
}

function flattenAddress(value: EmailAddress): MailAddress[] {
  if (value.group?.length) return value.group.flatMap(flattenAddress);
  return value.address
    ? [{ address: value.address, name: value.name || undefined }]
    : [];
}

function envelopeAddress(
  value: { address?: string; name?: string } | undefined,
): MailAddress | undefined {
  return value?.address
    ? { address: value.address, name: value.name || undefined }
    : undefined;
}

function envelopeAddresses(
  value: readonly { address?: string; name?: string }[] | undefined,
): MailAddress[] {
  return (
    value?.flatMap((item) => {
      const address = envelopeAddress(item);
      return address ? [address] : [];
    }) ?? []
  );
}

function references(value: string | string[] | undefined): string[] {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function preview(text: string | undefined): string | undefined {
  return text?.replace(/\s+/g, ' ').trim().slice(0, 240) || undefined;
}

function toIsoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function toHeader(value: MailAddress): { address: string; name?: string } {
  return value.name
    ? { address: value.address, name: value.name }
    : { address: value.address };
}

function bufferStream(value: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(value);
      controller.close();
    },
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Operation aborted.');
}

function failure<T>(
  code: string,
  message: string,
  category: MailProviderError['category'],
  retryable: boolean,
): MailProviderResult<T> {
  return { ok: false, error: { code, message, category, retryable } };
}

function classifyError(error: unknown, code: string): MailProviderError {
  const value = error as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };
  const providerCode = typeof value.code === 'string' ? value.code : code;
  const responseCode =
    typeof value.responseCode === 'number' ? value.responseCode : undefined;
  const category =
    providerCode === 'EAUTH' || responseCode === 401 || responseCode === 535
      ? 'authentication'
      : providerCode === 'EENVELOPE'
        ? 'recipient'
        : providerCode === 'ETIMEDOUT'
          ? 'timeout'
          : NETWORK_CODES.has(providerCode)
            ? 'network'
            : 'provider';
  return {
    code: providerCode,
    message:
      typeof value.message === 'string' ? value.message : `${code} failed.`,
    category,
    retryable:
      category === 'network' ||
      category === 'timeout' ||
      (responseCode !== undefined && responseCode >= 500),
  };
}

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ESOCKET',
  'ECONNECTION',
]);

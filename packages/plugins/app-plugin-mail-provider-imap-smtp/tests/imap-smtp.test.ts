import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const imap = {
    connect: vi.fn(),
    list: vi.fn(),
    status: vi.fn(),
    mailboxOpen: vi.fn(),
    search: vi.fn(),
    fetch: vi.fn(),
    fetchOne: vi.fn(),
    messageFlagsAdd: vi.fn(),
    messageFlagsRemove: vi.fn(),
    messageDelete: vi.fn(),
    logout: vi.fn(),
    close: vi.fn(),
  };
  return {
    imap,
    ImapFlow: vi.fn(function ImapFlowMock() {
      return imap;
    }),
    sendMail: vi.fn(),
    verify: vi.fn(),
    close: vi.fn(),
  };
});

vi.mock('imapflow', () => ({ ImapFlow: mocks.ImapFlow }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => mocks),
  },
}));

import { imapSmtpMailProviderDefinition } from '../server/imap-smtp.js';
import type { ImapSmtpMailProviderConfig } from '../server/config.js';
import type {
  MailAccount,
  MailProviderContext,
  MailProviderSendInput,
} from '@nocobase/app-plugin-mail/server/types';

describe('IMAP/SMTP mail Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imap.connect.mockResolvedValue(undefined);
    mocks.imap.logout.mockResolvedValue(undefined);
    mocks.imap.close.mockImplementation(() => undefined);
    mocks.verify.mockResolvedValue(undefined);
    mocks.imap.list.mockResolvedValue([
      {
        path: 'INBOX',
        name: 'INBOX',
        specialUse: '\\Inbox',
        status: { messages: 3, unseen: 3, uidNext: 4, uidValidity: 1n },
      },
    ]);
    mocks.imap.status.mockResolvedValue({ uidNext: 4, uidValidity: 1n });
    mocks.imap.fetch.mockImplementation(async function* () {});
  });

  it('advertises the MVP capability boundary', () => {
    expect(imapSmtpMailProviderDefinition.capabilities).toEqual({
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: false,
      folders: true,
      labels: false,
      drafts: false,
      moveMessage: false,
      aliases: false,
    });
    expect(imapSmtpMailProviderDefinition.connection).toBeDefined();
  });

  it('rejects incomplete credential connections before opening a socket', async () => {
    const result = await imapSmtpMailProviderDefinition.connection!.connect(
      {} as MailProviderContext,
      config(),
      {
        address: 'user@example.com',
        username: '',
        password: '',
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'IMAP_SMTP_CREDENTIALS_REQUIRED',
        message: 'An IMAP username and password are required.',
        category: 'authentication',
        retryable: false,
      },
    });
  });

  it('verifies IMAP and SMTP before storing mailbox credentials', async () => {
    const providerContext = context();
    const result = await imapSmtpMailProviderDefinition.connection!.connect(
      providerContext,
      config(),
      {
        address: 'User@Example.com',
        username: 'user@example.com',
        password: 'secret',
      },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        address: 'user@example.com',
        authorizationSubject: 'user@example.com',
        credentialReference: 'credential-1',
      },
    });
    expect(mocks.imap.connect).toHaveBeenCalledOnce();
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(providerContext.credentials.put).toHaveBeenCalledWith(
      { username: 'user@example.com', password: 'secret' },
      { purpose: 'account' },
    );
  });

  it('advances incremental sync from the last fetched IMAP UID', async () => {
    mocks.imap.fetch.mockImplementation(async function* (
      uids: number[] | string,
    ) {
      const range = String(uids);
      for (const uid of range === '1:3' ? [1] : [2, 3]) {
        yield fetchedMessage(uid);
      }
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );

    const first = await adapter.listChanges!({ limit: 1 });
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.messages).toHaveLength(1);
    expect(first.value.hasMore).toBe(true);
    expect(JSON.parse(String(first.value.nextCursor.value))).toEqual({
      version: 1,
      folders: { INBOX: { uidValidity: '1', uidNext: 2 } },
    });

    const second = await adapter.listChanges!({
      cursor: first.value.nextCursor,
      limit: 10,
    });
    if (!second.ok) throw new Error(second.error.message);
    expect(second.value.messages).toHaveLength(2);
    expect(second.value.hasMore).toBe(false);
    expect(mocks.imap.fetch).toHaveBeenNthCalledWith(
      2,
      '2:3',
      expect.any(Object),
      { uid: true },
    );
  });

  it('skips sparse UID ranges when a mailbox has holes', async () => {
    mocks.imap.status.mockResolvedValue({ uidNext: 5, uidValidity: 1n });
    mocks.imap.fetch.mockImplementation(async function* () {
      yield fetchedMessage(4);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );

    const result = await adapter.listChanges!({ limit: 10 });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.messages).toHaveLength(1);
    expect(result.value.hasMore).toBe(false);
    expect(JSON.parse(String(result.value.nextCursor.value))).toEqual({
      version: 1,
      folders: { INBOX: { uidValidity: '1', uidNext: 5 } },
    });
  });

  it('returns a recoverable error for malformed sync cursors', async () => {
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );

    await expect(
      adapter.listChanges!({
        cursor: { version: 'imap-v1', value: '{invalid' },
        limit: 10,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'IMAP_SYNC_CURSOR_INVALID',
        message: 'The IMAP sync cursor is invalid.',
        category: 'provider',
        retryable: false,
      },
    });
  });

  it('does not skip a newly discovered folder when a page is full', async () => {
    mocks.imap.list.mockResolvedValue([
      {
        path: 'INBOX',
        name: 'INBOX',
        specialUse: '\\Inbox',
      },
      { path: 'Projects', name: 'Projects' },
    ]);
    mocks.imap.status.mockImplementation(async (path: string) => ({
      uidNext: path === 'INBOX' ? 2 : 3,
      uidValidity: 1n,
    }));
    mocks.imap.fetch.mockImplementation(async function* (
      uids: number[] | string,
    ) {
      yield fetchedMessage(String(uids).startsWith('1:') ? 1 : 2);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );

    const result = await adapter.listChanges!({ limit: 1 });
    if (!result.ok) throw new Error(result.error.message);
    const cursor = JSON.parse(String(result.value.nextCursor.value));
    expect(result.value.hasMore).toBe(true);
    expect(cursor.folders.Projects).toEqual({
      uidValidity: '1',
      uidNext: 1,
    });
  });

  it('maps Mail send input to SMTP headers and returns the provider message id', async () => {
    mocks.sendMail.mockResolvedValueOnce({ messageId: '<sent@example.com>' });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );

    const input: MailProviderSendInput = {
      trackingId: 'tracking-1',
      identity: {
        id: 'identity-1',
        accountId: 'account-1',
        address: 'user@example.com',
        displayName: 'User',
        isPrimary: true,
        canSend: true,
      },
      message: {
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        cc: [],
        bcc: [],
        subject: 'Hello',
        text: 'Hello from IMAP/SMTP',
        html: '<p>Hello from IMAP/SMTP</p>',
        attachments: [],
        inReplyTo: '<previous@example.com>',
        references: ['<previous@example.com>'],
      },
    };

    await expect(adapter.sendMessage?.(input)).resolves.toEqual({
      status: 'accepted',
      providerMessageId: '<sent@example.com>',
      internetMessageId: '<sent@example.com>',
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { address: 'user@example.com', name: 'User' },
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        subject: 'Hello',
        headers: {
          'In-Reply-To': '<previous@example.com>',
          References: '<previous@example.com>',
        },
      }),
    );
  });
});

function config(): ImapSmtpMailProviderConfig {
  return {
    type: 'imap-smtp',
    name: 'company-mail',
    imap: { host: 'imap.example.com', port: 993, secure: true },
    smtp: { host: 'smtp.example.com', port: 465, secure: true },
  };
}

function context(): MailProviderContext {
  return {
    publicBasePath: '/test',
    credentials: {
      put: vi.fn(async () => 'credential-1'),
      get: vi.fn(async () => ({
        username: 'user@example.com',
        password: 'secret',
      })),
      replace: vi.fn(),
      getOrRefresh: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function account(): MailAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    provider: { type: 'imap-smtp', name: 'company-mail' },
    address: 'user@example.com',
    credentialReference: 'credential-1',
    scopes: [],
    status: 'active',
    isDefault: true,
  };
}

function fetchedMessage(uid: number): {
  readonly uid: number;
  readonly flags: Set<string>;
  readonly internalDate: Date;
  readonly source: Buffer;
} {
  return {
    uid,
    flags: new Set<string>(),
    internalDate: new Date('2026-01-01T00:00:00.000Z'),
    source: Buffer.from(
      `From: Alice <alice@example.com>\r\nTo: User <user@example.com>\r\nSubject: Message ${uid}\r\nMessage-ID: <message-${uid}@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello ${uid}`,
    ),
  };
}

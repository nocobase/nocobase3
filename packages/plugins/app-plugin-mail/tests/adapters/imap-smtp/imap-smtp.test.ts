// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simpleParser } from 'mailparser';

const mocks = vi.hoisted(() => {
  const imap = {
    connect: vi.fn(),
    append: vi.fn(),
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

import { encodeMessageLocator } from '../../../server/adapters/imap-smtp/locators.js';
import { imapSmtpMailProviderDefinition } from '../../../server/adapters/imap-smtp/index.js';
import type { ImapSmtpMailProviderConfig } from '../../../server/adapters/imap-smtp/config.js';
import type {
  MailAccount,
  MailProviderContext,
  MailProviderAdapter,
  MailProviderDefinition,
  MailProviderSendInput,
} from '../../../server/types.js';

describe('IMAP/SMTP mail Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imap.search.mockReset();
    mocks.imap.append.mockReset();
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
    mocks.imap.mailboxOpen.mockResolvedValue({
      exists: 3,
      uidNext: 4,
      uidValidity: 1n,
    });
    mocks.imap.fetchOne.mockResolvedValue(false);
    mocks.imap.fetch.mockImplementation(async function* () {});
  });

  it('rejects ordinary deletion without opening or expunging the mailbox', async () => {
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const id = encodeMessageLocator({
      folder: 'INBOX',
      uidValidity: '1',
      uid: 7,
    });
    await expect(adapter.deleteMessage!(id, false)).resolves.toMatchObject({
      ok: false,
      error: { code: 'IMAP_SOFT_DELETE_UNSUPPORTED', retryable: false },
    });
    expect(mocks.imap.mailboxOpen).not.toHaveBeenCalled();
    expect(mocks.imap.messageDelete).not.toHaveBeenCalled();
    await expect(adapter.deleteMessage!(id, true)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(mocks.imap.messageDelete).toHaveBeenCalledWith(7, { uid: true });
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

  it('satisfies the Mail core Provider compatibility contract', async () => {
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    expectMailProviderCompatibility(imapSmtpMailProviderDefinition, adapter);
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

  it('selects each mailbox before fetching incremental messages', async () => {
    let selected: string | undefined;
    mocks.imap.mailboxOpen.mockImplementation(async (path: string) => {
      selected = path;
      return { uidNext: 2, uidValidity: 1n };
    });
    mocks.imap.fetch.mockImplementation(async function* () {
      if (selected !== 'INBOX') throw new Error('No mailbox selected');
      yield fetchedMessage(1);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const result = await adapter.listChanges!({ limit: 10 });
    expect(result).toMatchObject({
      ok: true,
      value: { messages: [expect.objectContaining({ subject: 'Message 1' })] },
    });
  });

  it('preserves the checkpoint of an existing folder excluded from an incremental page', async () => {
    mocks.imap.list.mockResolvedValue([
      { path: 'INBOX', name: 'INBOX' },
      { path: 'Sent', name: 'Sent' },
    ]);
    mocks.imap.status.mockResolvedValue({ uidNext: 3, uidValidity: 1n });
    mocks.imap.fetch.mockImplementation(async function* () {
      yield fetchedMessage(1);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const result = await adapter.listChanges!({
      limit: 1,
      cursor: {
        version: 'imap-v1',
        value: JSON.stringify({
          version: 1,
          folders: {
            INBOX: { uidNext: 1, uidValidity: '1' },
            Sent: { uidNext: 1, uidValidity: '1' },
          },
        }),
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(
      JSON.parse(String(result.value.nextCursor.value)).folders.Sent,
    ).toEqual({ uidNext: 1, uidValidity: '1' });
  });

  it('starts the next folder when an initial page ends exactly at a folder boundary', async () => {
    mocks.imap.list.mockResolvedValue([
      { path: 'INBOX', name: 'INBOX' },
      { path: 'Sent', name: 'Sent' },
    ]);
    mocks.imap.mailboxOpen.mockResolvedValue({ uidNext: 2, uidValidity: 1n });
    mocks.imap.search.mockResolvedValue([1]);
    mocks.imap.fetch.mockImplementation(async function* () {
      yield fetchedMessage(1);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const first = await adapter.listMessages!({ limit: 1 });
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.messages).toHaveLength(1);
    expect(first.value.nextCursor).toBeDefined();
    const second = await adapter.listMessages!({
      limit: 1,
      cursor: first.value.nextCursor,
    });
    if (!second.ok) throw new Error(second.error.message);
    expect(second.value.messages).toHaveLength(1);
    expect(second.value.nextCursor).toBeUndefined();
    expect(second.value.messages[0].providerMessageId).not.toBe(
      first.value.messages[0].providerMessageId,
    );
  });

  it('reports missing UIDNEXT instead of completing initial sync with no mail', async () => {
    mocks.imap.mailboxOpen.mockResolvedValue({ exists: 3, uidValidity: 1n });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    await expect(adapter.listMessages!({ limit: 10 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'IMAP_INVALID_UIDNEXT', retryable: false },
    });
  });

  it('imports history when the server omits UIDNEXT', async () => {
    mocks.imap.mailboxOpen.mockResolvedValue({ exists: 1, uidValidity: 1n });
    mocks.imap.fetchOne.mockResolvedValue({ uid: 7 });
    mocks.imap.search.mockResolvedValue([7]);
    mocks.imap.fetch.mockImplementation(async function* () {
      yield fetchedMessage(7);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const result = await adapter.listMessages!({ limit: 10 });
    expect(result).toMatchObject({
      ok: true,
      value: {
        messages: [
          expect.objectContaining({
            providerMessageId: encodeMessageLocator({
              folder: 'INBOX',
              uidValidity: '1',
              uid: 7,
            }),
          }),
        ],
      },
    });
    expect(mocks.imap.fetchOne).toHaveBeenCalledWith(
      1,
      { uid: true },
      { uid: false },
    );
  });

  it('derives a baseline and recovers a previously empty incremental cursor without UIDNEXT', async () => {
    mocks.imap.status.mockResolvedValue({ uidValidity: 1n });
    mocks.imap.mailboxOpen.mockResolvedValue({ exists: 1, uidValidity: 1n });
    mocks.imap.fetchOne.mockResolvedValue({ uid: 7 });
    mocks.imap.fetch.mockImplementation(async function* () {
      yield fetchedMessage(7);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const baseline = await adapter.getCurrentSyncCursor!();
    if (!baseline.ok) throw new Error(baseline.error.message);
    expect(JSON.parse(String(baseline.value.value))).toMatchObject({
      folders: { INBOX: { uidNext: 8, uidValidity: '1' } },
    });
    const result = await adapter.listChanges!({
      limit: 10,
      cursor: {
        version: 'imap-v1',
        value: JSON.stringify({
          version: 1,
          folders: { INBOX: { uidNext: 1, uidValidity: '1' } },
        }),
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        messages: [
          expect.objectContaining({
            providerMessageId: encodeMessageLocator({
              folder: 'INBOX',
              uidValidity: '1',
              uid: 7,
            }),
          }),
        ],
        hasMore: false,
      },
    });
    expect(mocks.imap.fetch).toHaveBeenCalledWith('1:7', expect.any(Object), {
      uid: true,
    });
  });

  it('does not fetch a last message from a genuinely empty mailbox without UIDNEXT', async () => {
    mocks.imap.status.mockResolvedValue({ uidValidity: 1n });
    mocks.imap.mailboxOpen.mockResolvedValue({ exists: 0, uidValidity: 1n });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const baseline = await adapter.getCurrentSyncCursor!();
    if (!baseline.ok) throw new Error(baseline.error.message);
    expect(JSON.parse(String(baseline.value.value))).toMatchObject({
      folders: { INBOX: { uidNext: 1 } },
    });
    expect(await adapter.listMessages!({ limit: 10 })).toMatchObject({
      ok: true,
      value: { messages: [] },
    });
    expect(mocks.imap.fetchOne).not.toHaveBeenCalled();
  });

  it.each(['baseline', 'incremental'] as const)(
    'reports missing UIDNEXT during %s sync instead of saving an empty cursor',
    async (phase) => {
      mocks.imap.status.mockResolvedValue({ messages: 3, uidValidity: 1n });
      mocks.imap.mailboxOpen.mockResolvedValue({ exists: 3, uidValidity: 1n });
      const adapter = await imapSmtpMailProviderDefinition.createAdapter(
        context(),
        config(),
        account(),
      );
      const result =
        phase === 'baseline'
          ? await adapter.getCurrentSyncCursor!()
          : await adapter.listChanges!({ limit: 10 });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'IMAP_INVALID_UIDNEXT', retryable: false },
      });
    },
  );

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

  it('pages initial messages with UID ranges instead of sorting the whole mailbox', async () => {
    mocks.imap.mailboxOpen.mockResolvedValue({
      uidValidity: 1n,
      uidNext: 1001,
    });
    mocks.imap.search.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => 1000 - index),
    );
    mocks.imap.fetch.mockImplementation(async function* (
      uids: number[] | string,
    ) {
      const values = Array.isArray(uids)
        ? uids
        : (() => {
            const [start, end] = String(uids).split(':').map(Number);
            return Array.from(
              { length: end - start + 1 },
              (_, index) => end - index,
            );
          })();
      for (const uid of values) yield fetchedMessage(uid);
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );

    const first = await adapter.listMessages!({ limit: 10 });
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.messages).toHaveLength(10);
    expect(mocks.imap.search).toHaveBeenNthCalledWith(
      1,
      { uid: '991:1000' },
      { uid: true },
    );
    const cursor = first.value.nextCursor;
    if (!cursor) throw new Error('Expected another IMAP history page.');

    mocks.imap.search.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => 990 - index),
    );
    const second = await adapter.listMessages!({ cursor, limit: 10 });
    if (!second.ok) throw new Error(second.error.message);
    expect(mocks.imap.search).toHaveBeenNthCalledWith(
      2,
      { uid: '981:990' },
      { uid: true },
    );
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

  it.each([
    ['IMAP', 'EAUTH', 'authentication'],
    ['SMTP', 'ETIMEDOUT', 'timeout'],
    ['SMTP', 'CERT_HAS_EXPIRED', 'provider'],
  ] as const)(
    'does not store credentials after %s verification fails with %s',
    async (endpoint, code, category) => {
      const providerContext = context();
      const failure = Object.assign(new Error('Connection rejected'), { code });
      (endpoint === 'IMAP'
        ? mocks.imap.connect
        : mocks.verify
      ).mockRejectedValueOnce(failure);
      mocks.imap.logout.mockRejectedValueOnce(
        new Error('Already disconnected'),
      );
      const result = await imapSmtpMailProviderDefinition.connection!.connect(
        providerContext,
        config(),
        { address: 'user@example.com', username: 'user', password: 'secret' },
      );
      expect(result).toMatchObject({ ok: false, error: { code, category } });
      expect(providerContext.credentials.put).not.toHaveBeenCalled();
      expect(mocks.imap.close).toHaveBeenCalledTimes(1);
      expect(mocks.close).toHaveBeenCalledTimes(1);
      if (endpoint === 'IMAP') expect(mocks.verify).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['EAUTH', 'authentication', false],
    ['ETIMEDOUT', 'timeout', true],
    ['ECONNRESET', 'network', true],
    ['EPIPE', 'network', true],
    ['CERT_HAS_EXPIRED', 'provider', false],
  ] as const)(
    'classifies IMAP %s failures without returning partial data',
    async (code, category, retryable) => {
      const adapter = await imapSmtpMailProviderDefinition.createAdapter(
        context(),
        config(),
        account(),
      );
      mocks.imap.list.mockRejectedValueOnce(
        Object.assign(new Error('Provider failure'), { code }),
      );
      expect(await adapter.listFolders!({ limit: 100 })).toEqual({
        ok: false,
        error: { code, category, retryable, message: 'Provider failure' },
      });
      await adapter.close?.();
    },
  );

  it('rejects an expired UIDVALIDITY before fetching from a different mailbox generation', async () => {
    mocks.imap.status.mockResolvedValueOnce({ uidNext: 10, uidValidity: 2n });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    expect(
      await adapter.listChanges!({
        limit: 10,
        cursor: {
          version: 'imap-v1',
          value: JSON.stringify({
            version: 1,
            folders: { INBOX: { uidNext: 5, uidValidity: '1' } },
          }),
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'IMAP_SYNC_CURSOR_INVALID', retryable: false },
    });
    expect(mocks.imap.fetch).not.toHaveBeenCalled();
    await adapter.close?.();
  });

  it('honors cancellation before connecting to IMAP', async () => {
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const controller = new AbortController();
    controller.abort(new Error('Cancelled by caller'));
    expect(
      await adapter.listFolders!({ limit: 100, signal: controller.signal }),
    ).toMatchObject({ ok: false, error: { message: 'Cancelled by caller' } });
    expect(mocks.imap.connect).not.toHaveBeenCalled();
    await adapter.close?.();
  });

  it('normalizes special-use folders and preserves custom folders', async () => {
    mocks.imap.list.mockResolvedValueOnce(
      ['Inbox', 'Sent', 'Drafts', 'Trash', 'Junk', 'Archive', 'Projects'].map(
        (name) => ({
          path: name,
          name,
          specialUse: name === 'Projects' ? undefined : `\\${name}`,
          status: { unseen: 2 },
        }),
      ),
    );
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const result = await adapter.listFolders!({ limit: 100 });
    expect(result).toMatchObject({
      ok: true,
      value: {
        folders: [
          'inbox',
          'sent',
          'drafts',
          'trash',
          'junk',
          'archive',
          'custom',
        ].map((type) => ({ type, kind: 'folder', unreadCount: 2 })),
      },
    });
    await adapter.close?.();
  });

  it('updates read and starred flags and reports mutation failures', async () => {
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const id = encodeMessageLocator({
      folder: 'INBOX',
      uidValidity: '1',
      uid: 7,
    });
    await expect(adapter.setRead!(id, true)).resolves.toMatchObject({
      ok: true,
    });
    await expect(adapter.setStarred!(id, false)).resolves.toMatchObject({
      ok: true,
    });
    expect(mocks.imap.messageFlagsAdd).toHaveBeenCalledWith(7, ['\\Seen'], {
      uid: true,
    });
    expect(mocks.imap.messageFlagsRemove).toHaveBeenCalledWith(
      7,
      ['\\Flagged'],
      { uid: true },
    );
    mocks.imap.messageFlagsAdd.mockRejectedValueOnce(
      Object.assign(new Error('Lost connection'), { code: 'ECONNRESET' }),
    );
    await expect(adapter.setRead!(id, true)).resolves.toMatchObject({
      ok: false,
      error: { category: 'network', retryable: true },
    });
    await adapter.close?.();
  });

  it.each([
    ['EAUTH', undefined, 'failed', 'authentication', false],
    ['EAUTH', 535, 'failed', 'authentication', false],
    ['EENVELOPE', 550, 'failed', 'recipient', false],
    ['EENVELOPE', 450, 'failed', 'recipient', true],
    ['ETIMEDOUT', undefined, 'submission_unknown', 'timeout', true],
    ['ECONNRESET', undefined, 'submission_unknown', 'network', true],
  ] as const)(
    'preserves SMTP delivery certainty for %s / %s',
    async (code, responseCode, status, category, retryable) => {
      const adapter = await imapSmtpMailProviderDefinition.createAdapter(
        context(),
        config(),
        account(),
      );
      mocks.sendMail.mockRejectedValueOnce(
        Object.assign(new Error('Submission failed'), { code, responseCode }),
      );
      expect(
        await adapter.sendMessage!({
          trackingId: 'test',
          identity: {
            id: 'identity',
            accountId: 'account-1',
            address: 'user@example.com',
            isPrimary: true,
            canSend: true,
          },
          message: {
            to: [{ address: 'recipient@example.com' }],
            cc: [],
            bcc: [],
            subject: 'Test',
            text: 'Body',
            references: [],
            attachments: [],
          },
        }),
      ).toMatchObject({ status, error: { code, category, retryable } });
      await adapter.close?.();
    },
  );

  it.each(['ETIMEDOUT', 'ECONNRESET'])(
    'does not mark attachment preparation %s as a submitted message',
    async (code) => {
      const adapter = await imapSmtpMailProviderDefinition.createAdapter(
        context(),
        config(),
        account(),
      );
      expect(
        await adapter.sendMessage!({
          trackingId: 'test',
          identity: {
            id: 'identity',
            accountId: 'account-1',
            address: 'user@example.com',
            isPrimary: true,
            canSend: true,
          },
          message: {
            to: [{ address: 'recipient@example.com' }],
            cc: [],
            bcc: [],
            subject: 'Test',
            text: 'Body',
            references: [],
            attachments: [
              {
                fileName: 'report.txt',
                inline: false,
                contentType: 'text/plain',
                size: 5,
                open: async () => {
                  throw Object.assign(new Error('Attachment unavailable'), {
                    code,
                  });
                },
              },
            ],
          },
        }),
      ).toMatchObject({ status: 'failed', error: { code } });
      expect(mocks.sendMail).not.toHaveBeenCalled();
      await adapter.close?.();
    },
  );

  it.each(['server', 'client'] as const)(
    'saves sent copies according to %s mode',
    async (sentCopyMode) => {
      mocks.sendMail.mockImplementationOnce(
        async (mail: { messageId: string }) => ({ messageId: mail.messageId }),
      );
      mocks.imap.search.mockResolvedValueOnce([]);
      mocks.imap.append.mockResolvedValueOnce({ uid: 10, uidValidity: 1n });
      const adapter = await imapSmtpMailProviderDefinition.createAdapter(
        context(),
        { ...config(), sentCopyMode, sentFolder: 'Sent Items' },
        account(),
      );
      const result = await adapter.sendMessage!(sentInput());
      expect(result).toMatchObject({ status: 'accepted' });
      if (sentCopyMode === 'server') {
        expect(mocks.imap.append).not.toHaveBeenCalled();
        expect(mocks.imap.connect).not.toHaveBeenCalled();
        return;
      }
      expect(mocks.imap.append).toHaveBeenCalledWith(
        'Sent Items',
        expect.any(Buffer),
        ['\\Seen'],
        expect.any(Date),
      );
      const raw = mocks.imap.append.mock.calls[0][1] as Buffer;
      const parsed = await simpleParser(raw);
      expect(parsed.messageId).toBe(
        (mocks.sendMail.mock.calls[0][0] as { messageId: string }).messageId,
      );
      expect(parsed.subject).toBe('Archive test');
      expect(parsed.text?.trim()).toBe('Body');
      expect(parsed.html).toContain('<p>Body</p>');
      expect(parsed.bcc).toMatchObject({
        value: [{ address: 'hidden@example.com' }],
      });
      expect(parsed.attachments[0].content.toString()).toBe('attachment');
    },
  );

  it('does not append a sent copy already saved by the server', async () => {
    mocks.sendMail.mockResolvedValueOnce({
      messageId: '<existing@example.com>',
    });
    mocks.imap.search.mockResolvedValueOnce([10]);
    mocks.imap.list.mockResolvedValueOnce([
      { path: 'Sent', specialUse: '\\Sent', name: 'Sent' },
    ]);
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      { ...config(), sentCopyMode: 'client' },
      account(),
    );
    expect(await adapter.sendMessage!(sentInput())).toMatchObject({
      status: 'accepted',
    });
    expect(mocks.imap.append).not.toHaveBeenCalled();
  });

  it('keeps delivery accepted when IMAP cannot archive the sent copy', async () => {
    mocks.sendMail.mockResolvedValueOnce({ messageId: '<sent@example.com>' });
    mocks.imap.search.mockResolvedValueOnce([]);
    mocks.imap.append.mockRejectedValueOnce(new Error('IMAP unavailable'));
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      { ...config(), sentCopyMode: 'client', sentFolder: 'Sent' },
      account(),
    );
    expect(await adapter.sendMessage!(sentInput())).toMatchObject({
      status: 'accepted',
      sentCopyError: { code: 'IMAP_SENT_COPY_FAILED', retryable: false },
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it('preserves partial SMTP acceptance and rejected recipients without enabling whole-message retries', async () => {
    mocks.sendMail.mockResolvedValue({
      messageId: '<partial@example.com>',
      accepted: ['recipient@example.com'],
      rejected: [{ address: 'rejected@example.com' }],
      rejectedErrors: [
        { message: 'Private SMTP diagnostic', responseCode: 550 },
      ],
    });
    const adapter = await imapSmtpMailProviderDefinition.createAdapter(
      context(),
      config(),
      account(),
    );
    const input = sentInput();
    const result = await adapter.sendMessage!({
      ...input,
      message: {
        ...input.message,
        to: [
          { address: 'recipient@example.com' },
          { address: 'rejected@example.com' },
        ],
      },
    });
    expect(result).toMatchObject({
      status: 'accepted',
      recipientError: {
        code: 'SMTP_RECIPIENTS_REJECTED',
        category: 'recipient',
        retryable: false,
        recipients: {
          accepted: ['recipient@example.com'],
          rejected: ['rejected@example.com'],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('Private SMTP diagnostic');
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
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
      get: async <T>() =>
        ({ username: 'user@example.com', password: 'secret' }) as T,
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

function expectMailProviderCompatibility(
  definition: MailProviderDefinition,
  adapter: MailProviderAdapter,
): void {
  expect(definition.type).toBeTruthy();
  expect(definition.label.trim()).not.toBe('');
  expect(
    Number(Boolean(definition.authorization)) +
      Number(Boolean(definition.connection)),
  ).toBe(1);
  expect(adapter.identity.type).toBe(definition.type);
  expect(adapter.capabilities).toEqual(definition.capabilities);
  expect(adapter.listMessages).toEqual(expect.any(Function));
  expect(adapter.getMessage).toEqual(expect.any(Function));
  expect(adapter.getAttachment).toEqual(expect.any(Function));
  expect(adapter.listChanges).toEqual(expect.any(Function));
  expect(adapter.getCurrentSyncCursor).toEqual(expect.any(Function));
  expect(adapter.sendMessage).toEqual(expect.any(Function));
  expect(adapter.listFolders).toEqual(expect.any(Function));
  expect(adapter.close).toEqual(expect.any(Function));
  expect(definition.authorization).toBeUndefined();
  expect(definition.push).toBeUndefined();
  expect(adapter.upsertPushSubscription).toBeUndefined();
  expect(adapter.deletePushSubscription).toBeUndefined();
  expect(adapter.createLabel).toBeUndefined();
  expect(adapter.updateLabels).toBeUndefined();
  expect(adapter.saveDraft).toBeUndefined();
  expect(adapter.updateDraft).toBeUndefined();
  expect(adapter.moveMessage).toBeUndefined();
}

function sentInput(): MailProviderSendInput {
  return {
    trackingId: 'sent-test',
    identity: {
      id: 'identity-1',
      accountId: 'account-1',
      address: 'user@example.com',
      isPrimary: true,
      canSend: true,
    },
    message: {
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [{ address: 'hidden@example.com' }],
      subject: 'Archive test',
      text: 'Body',
      html: '<p>Body</p>',
      references: [],
      attachments: [
        {
          fileName: 'file.txt',
          contentType: 'text/plain',
          size: 10,
          inline: false,
          open: async () => new Response('attachment').body!,
        },
      ],
    },
  };
}

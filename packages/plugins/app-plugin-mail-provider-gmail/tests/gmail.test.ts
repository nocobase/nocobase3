import type {
  MailCredentialVault,
  MailProviderContext,
} from '@nocobase/app-plugin-mail/server/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GmailMailProviderAdapter,
  gmailMailProviderDefinition,
  type GmailMailProviderConfig,
} from '../server/gmail.js';

describe('Gmail Mail Provider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses PKCE and stores OAuth tokens behind a credential reference', async () => {
    const credentials = memoryVault();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
          scope: 'gmail.modify gmail.send',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ emailAddress: 'user@example.com', historyId: '10' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const authorization = gmailMailProviderDefinition.authorization;
    if (!authorization) throw new Error('Gmail authorization is missing.');

    const started = await authorization.start(context(credentials), config(), {
      redirectUri: 'https://example.com/main/mail/oauth/callback',
      state: 'state-1',
      codeChallenge: 'challenge-1',
    });
    expect(started.ok).toBe(true);
    const url = new URL(started.ok ? started.value.authorizationUrl : '');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');

    const completed = await authorization.complete(
      context(credentials),
      config(),
      {
        redirectUri: 'https://example.com/main/mail/oauth/callback',
        state: 'state-1',
        code: 'code-1',
        codeVerifier: 'verifier-1',
        scopes: [],
      },
    );
    expect(completed).toMatchObject({
      ok: true,
      value: { address: 'user@example.com' },
    });
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(
      'code_verifier=verifier-1',
    );
    expect([...credentials.values.values()][0]).toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
  });

  it('starts initial sync from a message history ID without intersecting every Gmail label', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ messages: [{ id: 'latest-message' }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: 'latest-message', historyId: '20' }),
      )
      .mockResolvedValueOnce(Response.json({ messages: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(adapter.getCurrentSyncCursor()).resolves.toMatchObject({
      ok: true,
      value: {
        value: { historyId: '20', capturedAt: expect.any(String) },
        version: 'gmail-v1',
      },
    });
    await expect(
      adapter.listMessages({
        providerFolderIds: ['INBOX', 'SENT', 'CATEGORY_SOCIAL'],
        limit: 100,
      }),
    ).resolves.toMatchObject({ ok: true, value: { messages: [] } });

    const baselineUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(baselineUrl.pathname).toBe('/gmail/v1/users/me/messages');
    expect(baselineUrl.searchParams.get('maxResults')).toBe('1');
    expect(baselineUrl.searchParams.get('includeSpamTrash')).toBe('true');
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/users/me/messages/latest-message?format=minimal',
    );
    const listUrl = new URL(String(fetchMock.mock.calls[2][0]));
    expect(listUrl.searchParams.getAll('labelIds')).toEqual([]);
    expect(listUrl.searchParams.get('includeSpamTrash')).toBe('true');
  });

  it('sends MIME content and preserves the original history cursor while paging', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'sent-1' }))
      .mockResolvedValueOnce(
        Response.json({
          history: [{ messagesAdded: [{ message: { id: 'message-1' } }] }],
          historyId: '20',
          nextPageToken: 'next-history-page',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'message-1',
          labelIds: ['INBOX'],
          payload: {
            mimeType: 'text/plain',
            headers: [{ name: 'Subject', value: 'Synced' }],
            body: { data: Buffer.from('Body').toString('base64url') },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.sendMessage({
        trackingId: 'submission-1',
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
          bcc: [],
          subject: 'Hello',
          text: 'Mail body',
          attachments: [],
          references: [],
        },
      }),
    ).resolves.toEqual({
      status: 'accepted',
      providerMessageId: 'sent-1',
    });
    const sendBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      raw: string;
    };
    expect(Buffer.from(sendBody.raw, 'base64url').toString()).toContain(
      'Subject: Hello',
    );

    const changes = await adapter.listChanges({
      cursor: { value: { historyId: '10' }, version: 'gmail-v1' },
      limit: 100,
    });
    expect(changes).toMatchObject({
      ok: true,
      value: {
        messages: [{ providerMessageId: 'message-1', text: 'Body' }],
        nextCursor: {
          value: { historyId: '10', pageToken: 'next-history-page' },
        },
        hasMore: true,
      },
    });
  });

  it('falls back to a bounded message scan when Gmail history is unavailable', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-06T14:30:00.000Z') });
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'Requested entity was not found.' } },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ messages: [{ id: 'recovered-message' }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'recovered-message',
          historyId: '25',
          labelIds: ['INBOX'],
          payload: {
            mimeType: 'text/plain',
            headers: [{ name: 'Subject', value: 'Recovered' }],
            body: { data: Buffer.from('Body').toString('base64url') },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ messages: [{ id: 'latest-message' }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: 'latest-message', historyId: '30' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    const result = await adapter.listChanges({
      cursor: {
        value: {
          historyId: '20',
          capturedAt: '2026-09-06T14:00:00.000Z',
        },
        version: 'gmail-v1',
      },
      limit: 100,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        messages: [
          { providerMessageId: 'recovered-message', subject: 'Recovered' },
        ],
        nextCursor: {
          value: {
            historyId: '30',
            capturedAt: '2026-09-06T14:30:00.000Z',
          },
          version: 'gmail-v1',
        },
        hasMore: false,
      },
    });
    const recoveryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(recoveryUrl.pathname).toBe('/gmail/v1/users/me/messages');
    expect(recoveryUrl.searchParams.get('maxResults')).toBe('100');
    expect(recoveryUrl.searchParams.get('q')).toMatch(/^after:\d+$/);
  });

  it('keeps a rejected token refresh as a terminal authentication error', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'expired-access',
      refreshToken: 'revoked-refresh',
      expiresAt: '2000-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: 'invalid_grant', error_description: 'Token was revoked.' },
            { status: 400 },
          ),
        ),
    );
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    const result = await adapter.sendMessage({
      trackingId: 'submission-auth-failure',
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
        bcc: [],
        subject: 'Hello',
        text: 'Mail body',
        attachments: [],
        references: [],
      },
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: { category: 'authentication', retryable: false },
    });
  });
});

interface MemoryVault extends MailCredentialVault {
  readonly values: Map<string, unknown>;
  putAt(reference: string, value: unknown): Promise<void>;
}

function memoryVault(): MemoryVault {
  const values = new Map<string, unknown>();
  return {
    values,
    putAt: async (reference, value) => {
      values.set(reference, value);
    },
    put: async (value) => {
      const reference = `credential-${values.size + 1}`;
      values.set(reference, value);
      return reference;
    },
    get: async <T>(reference: string): Promise<T> => values.get(reference) as T,
    replace: async (reference, value) => {
      values.set(reference, value);
    },
    delete: async (reference) => {
      values.delete(reference);
    },
  };
}

function account() {
  return {
    id: 'account-1',
    userId: 'user-1',
    provider: { type: 'gmail', name: 'google' },
    address: 'user@example.com',
    credentialReference: 'credential-1',
    scopes: [],
    status: 'active' as const,
    isDefault: true,
  };
}

function context(credentials: MailCredentialVault): MailProviderContext {
  return { publicBasePath: '/main', credentials };
}

function config(): GmailMailProviderConfig {
  return {
    type: 'gmail',
    name: 'google',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };
}

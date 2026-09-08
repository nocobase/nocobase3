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
      )
      .mockResolvedValueOnce(
        Response.json({
          sendAs: [
            {
              sendAsEmail: 'user@example.com',
              displayName: 'Example User',
              signature: '<p>Regards</p>',
              isPrimary: true,
              verificationStatus: 'accepted',
            },
            {
              sendAsEmail: 'alias@example.com',
              verificationStatus: 'accepted',
            },
          ],
        }),
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
      value: {
        address: 'user@example.com',
        identities: [
          expect.objectContaining({
            address: 'user@example.com',
            signatureText: 'Regards',
          }),
          expect.objectContaining({ address: 'alias@example.com' }),
        ],
      },
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
          attachments: [
            {
              fileName: 'report.txt',
              contentType: 'text/plain',
              size: 6,
              inline: false,
              open: async () => new Blob(['report']).stream(),
            },
          ],
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
    const mime = Buffer.from(sendBody.raw, 'base64url').toString();
    expect(mime).toContain('Content-Type: multipart/mixed');
    expect(mime).toContain('filename="report.txt"');
    expect(mime).toContain(Buffer.from('report').toString('base64'));

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

  it('sends replies in the existing Gmail thread with RFC reply headers', async () => {
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
      .mockResolvedValue(Response.json({ id: 'reply-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await adapter.sendMessage({
      trackingId: 'submission-reply',
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
        subject: 'Re: Original',
        text: 'Reply body',
        attachments: [],
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
        providerConversationId: 'thread-1',
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      raw: string;
      threadId?: string;
    };
    const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
    expect(body.threadId).toBe('thread-1');
    expect(mime).toContain('In-Reply-To: <parent@example.com>');
    expect(mime).toContain(
      'References: <root@example.com> <parent@example.com>',
    );
  });

  it('forwards the original Gmail body and attachments', async () => {
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
        Response.json({
          id: 'source-message-1',
          labelIds: ['INBOX'],
          payload: {
            headers: [
              { name: 'From', value: 'Alice <alice@example.com>' },
              { name: 'To', value: 'user@example.com' },
              { name: 'Subject', value: 'Original' },
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('Original body').toString('base64url'),
                },
              },
              {
                mimeType: 'text/plain',
                filename: 'notes.txt',
                body: { attachmentId: 'attachment-1', size: 5 },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: Buffer.from('notes').toString('base64url'),
          size: 5,
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'forwarded-message-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.sendMessage({
        trackingId: 'submission-forward',
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
          subject: 'Fwd: Original',
          text: 'Please review',
          attachments: [],
          references: [],
          forwardOfProviderMessageId: 'source-message-1',
        },
      }),
    ).resolves.toMatchObject({
      status: 'accepted',
      providerMessageId: 'forwarded-message-1',
    });
    const body = JSON.parse(String(fetchMock.mock.calls[2][1]?.body)) as {
      raw: string;
    };
    const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
    expect(mime).toContain('Original body');
    expect(mime).toContain('notes.txt');
    expect(mime).toContain(Buffer.from('notes').toString('base64'));
  });

  it('creates a Gmail draft and returns a normalized draft message', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'draft-resource-1',
        message: { id: 'draft-message-1', threadId: 'thread-1' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.saveDraft({
        trackingId: 'draft-1',
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
          subject: 'Draft subject',
          text: 'Draft body',
          attachments: [],
          references: [],
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        providerMessageId: 'draft-message-1',
        draft: true,
        providerFolderIds: ['DRAFT'],
      },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/me/drafts');
  });

  it('updates an existing Gmail draft', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'draft-resource-1',
        message: { id: 'draft-message-2', threadId: 'thread-1' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.updateDraft('draft-resource-1', {
        trackingId: 'draft-update-1',
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
          subject: 'Updated draft',
          text: 'Updated body',
          attachments: [],
          references: [],
          draftProviderDraftId: 'draft-resource-1',
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        providerMessageId: 'draft-message-2',
        providerDraftId: 'draft-resource-1',
        draft: true,
      },
    });
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('maps message mutations to Gmail label and trash APIs', async () => {
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
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await adapter.setRead('message-1', true);
    await adapter.setStarred('message-1', true);
    await adapter.moveMessage('message-1', '__archive__');
    await adapter.deleteMessage('message-1', false);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('/messages/message-1/modify'),
      expect.stringContaining('/messages/message-1/modify'),
      expect.stringContaining('/messages/message-1/modify'),
      expect.stringContaining('/messages/message-1/trash'),
    ]);
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain(
      '"removeLabelIds":["INBOX","TRASH","SPAM"]',
    );
  });

  it('parses Pub/Sub notifications and renews a Gmail watch daily', async () => {
    const parsed = gmailMailProviderDefinition.push?.parse({
      query: {},
      body: {
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: 'user@example.com',
              historyId: '42',
            }),
          ).toString('base64url'),
        },
      },
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        notifications: [{ accountAddress: 'user@example.com' }],
      },
    });

    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ historyId: '43', expiration }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GmailMailProviderAdapter(
      context(credentials),
      { ...config(), pushTopicName: 'projects/example/topics/mail' },
      account(),
    );

    await expect(
      adapter.upsertPushSubscription({
        notificationUrl: 'https://example.com/main/mail/webhooks/gmail',
        clientState: 'secret',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        providerSubscriptionId: 'user@example.com',
        expiresAt: new Date(expiration).toISOString(),
      },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/me/watch');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      topicName: 'projects/example/topics/mail',
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

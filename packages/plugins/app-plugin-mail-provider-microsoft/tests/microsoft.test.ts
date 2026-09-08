import type {
  MailCredentialVault,
  MailProviderContext,
} from '@nocobase/app-plugin-mail/server/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MicrosoftMailProviderAdapter,
  microsoftMailProviderDefinition,
  type MicrosoftMailProviderConfig,
} from '../server/microsoft.js';

describe('Microsoft Mail Provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses PKCE, requests offline access, and rotates credentials into the vault', async () => {
    const credentials = memoryVault();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
          scope: 'offline_access Mail.ReadWrite Mail.Send',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'subject-1',
          displayName: 'Example User',
          mail: 'user@example.com',
          proxyAddresses: ['SMTP:user@example.com', 'smtp:alias@example.com'],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const authorization = microsoftMailProviderDefinition.authorization;
    if (!authorization) throw new Error('Microsoft authorization is missing.');

    const started = await authorization.start(context(credentials), config(), {
      redirectUri: 'https://example.com/main/mail/oauth/callback',
      state: 'state-1',
      codeChallenge: 'challenge-1',
    });
    expect(started.ok).toBe(true);
    const url = new URL(started.ok ? started.value.authorizationUrl : '');
    expect(url.searchParams.get('scope')).toContain('offline_access');
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
        authorizationSubject: 'subject-1',
        identities: [
          expect.objectContaining({
            address: 'user@example.com',
            isPrimary: true,
          }),
          expect.objectContaining({
            address: 'alias@example.com',
            isPrimary: false,
          }),
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

  it('accepts Graph 202 sends and continues from per-folder delta links', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'inbox',
              displayName: 'Inbox',
              childFolderCount: 0,
              unreadItemCount: 2,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=opaque',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'message-1',
              parentFolderId: 'inbox',
              subject: 'Synced',
              body: { contentType: 'text', content: 'Body' },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
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
    ).resolves.toEqual({ status: 'accepted' });
    const sendBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      message: { attachments: readonly Record<string, unknown>[] };
    };
    expect(sendBody.message.attachments).toEqual([
      expect.objectContaining({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'report.txt',
        contentType: 'text/plain',
        contentBytes: Buffer.from('report').toString('base64'),
      }),
    ]);

    const baseline = await adapter.listMessages({ limit: 100 });
    const page = await adapter.listMessages({
      cursor: baseline.ok ? baseline.value.nextCursor : undefined,
      limit: 100,
    });
    expect(page).toMatchObject({
      ok: true,
      value: {
        messages: [{ providerMessageId: 'message-1', subject: 'Synced' }],
        syncCursor: { version: 'microsoft-graph-v1' },
      },
    });
    expect(page.ok && page.value.syncCursor?.value).toMatchObject({
      checkpoints: expect.stringContaining('$deltatoken=opaque'),
    });
  });

  it('rejects Provider paging URLs outside the configured Graph endpoint', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
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
          value: [],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=baseline',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [],
          '@odata.nextLink':
            'https://attacker.example/collect?$skiptoken=opaque',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    const baseline = await adapter.listMessages({
      providerFolderIds: ['inbox'],
      limit: 100,
    });
    const first = await adapter.listMessages({
      cursor: baseline.ok ? baseline.value.nextCursor : undefined,
      limit: 100,
    });
    expect(first.ok && first.value.nextCursor).toBeDefined();
    const second = await adapter.listMessages({
      cursor: first.ok ? first.value.nextCursor : undefined,
      limit: 100,
    });

    expect(second).toMatchObject({
      ok: false,
      error: { code: 'MICROSOFT_PAGING_URL_INVALID', retryable: false },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds history while catching messages that arrive after the real delta baseline', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
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
          value: [
            {
              id: 'inbox',
              displayName: 'Inbox',
              childFolderCount: 0,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=baseline',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'imported-message',
              parentFolderId: 'inbox',
              subject: 'Within bound',
              receivedDateTime: '2026-01-01T00:00:00.000Z',
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=history-page-2',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'arrived-after-baseline',
              parentFolderId: 'inbox',
              subject: 'Arrived after baseline',
              receivedDateTime: '2025-12-31T23:59:59.000Z',
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=after-catch-up',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    const baseline = await adapter.listMessages({ limit: 1 });
    expect(baseline).toMatchObject({
      ok: true,
      value: { messages: [], nextCursor: expect.any(String) },
    });
    const history = await adapter.listMessages({
      cursor: baseline.ok ? baseline.value.nextCursor : undefined,
      limit: 1,
    });
    expect(history).toMatchObject({
      ok: true,
      value: { messages: [{ providerMessageId: 'imported-message' }] },
    });
    if (!history.ok || !history.value.syncCursor) {
      throw new Error('Expected a Microsoft baseline cursor.');
    }
    const catchUp = await adapter.listChanges({
      cursor: history.value.syncCursor,
      limit: 1,
    });

    expect(catchUp).toMatchObject({
      ok: true,
      value: {
        messages: [{ providerMessageId: 'arrived-after-baseline' }],
        hasMore: false,
      },
    });
    expect(fetchMock.mock.calls[1][0]).toContain('%24deltatoken=latest');
    expect(fetchMock.mock.calls[2][0]).toContain('/messages?');
    expect(fetchMock.mock.calls[2][0]).not.toContain('/messages/delta?');
    expect(fetchMock.mock.calls).toHaveLength(4);
  });

  it('reports rejected token refresh before send as a terminal authentication failure', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'expired-access',
      refreshToken: 'revoked-refresh',
      expiresAt: '2000-01-01T00:00:00.000Z',
      scopes: ['offline_access'],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: 'invalid_grant', error_description: 'Token was revoked.' },
          { status: 400 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('discovers one folder page per call and resumes nested traversal', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
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
          value: [
            {
              id: 'parent',
              displayName: 'Projects',
              childFolderCount: 1,
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders?$skiptoken=top-2',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [{ id: 'inbox', displayName: 'Inbox' }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [{ id: 'child', displayName: 'Child' }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    const first = await adapter.listFolders({ limit: 100 });
    const second = await adapter.listFolders({
      cursor: first.ok ? first.value.nextCursor : undefined,
      limit: 100,
    });
    const third = await adapter.listFolders({
      cursor: second.ok ? second.value.nextCursor : undefined,
      limit: 100,
    });

    expect(first).toMatchObject({
      ok: true,
      value: { folders: [{ providerFolderId: 'parent' }] },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { folders: [{ providerFolderId: 'inbox' }] },
    });
    expect(third).toMatchObject({
      ok: true,
      value: {
        folders: [{ providerFolderId: 'child' }],
        completeProviderFolderIds: ['parent', 'inbox', 'child'],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('bootstraps a newly discovered folder during incremental sync', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          value: [
            {
              id: 'new-message',
              parentFolderId: 'new-folder',
              subject: 'Found after folder creation',
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/new-folder/messages/delta?$deltatoken=new-checkpoint',
        }),
      ),
    );
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );
    const reconciled = adapter.reconcileSyncCursor(
      {
        version: 'microsoft-graph-v1',
        value: {
          checkpoints: JSON.stringify({
            inbox:
              'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=old',
          }),
          folders: JSON.stringify(['inbox']),
          folderIndex: '0',
        },
      },
      ['new-folder'],
    );
    if (!reconciled.ok) throw new Error('Expected cursor reconciliation.');

    const changes = await adapter.listChanges({
      cursor: reconciled.value,
      limit: 100,
    });

    expect(changes).toMatchObject({
      ok: true,
      value: {
        messages: [{ providerMessageId: 'new-message' }],
        hasMore: false,
      },
    });
  });

  it('creates, updates, and sends a reply draft through Microsoft Graph', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'reply-draft-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'reply-draft-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.sendMessage({
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
          references: [],
          replyToProviderMessageId: 'source-message-1',
        },
      }),
    ).resolves.toEqual({
      status: 'accepted',
      providerMessageId: 'reply-draft-1',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/me/messages/source-message-1/createReply',
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      '/me/messages/reply-draft-1/send',
    );
  });

  it('preserves provider-generated content when forwarding a message', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
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
          id: 'forward-draft-1',
          body: { contentType: 'HTML', content: '<p>Original body</p>' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'forward-draft-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
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
    ).resolves.toMatchObject({ status: 'accepted' });
    const patchBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      body: { content: string };
    };
    expect(patchBody.body.content).toContain('Please review');
    expect(patchBody.body.content).toContain('Original body');
  });

  it('uses a Graph upload session for attachments of 3 MB or larger', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const bytes = new Uint8Array(3 * 1024 * 1024);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ id: 'large-draft-1', isDraft: true }),
      )
      .mockResolvedValueOnce(
        Response.json({ uploadUrl: 'https://upload.example.test/session-1' }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'attachment-1',
              name: 'large.bin',
              contentType: 'application/octet-stream',
              size: bytes.byteLength,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.sendMessage({
        trackingId: 'submission-large',
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
          subject: 'Large attachment',
          text: 'Mail body',
          attachments: [
            {
              fileName: 'large.bin',
              contentType: 'application/octet-stream',
              size: bytes.byteLength,
              inline: false,
              open: async () => new Blob([bytes]).stream(),
            },
          ],
          references: [],
        },
      }),
    ).resolves.toMatchObject({
      status: 'accepted',
      providerMessageId: 'large-draft-1',
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/attachments/createUploadSession',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://upload.example.test/session-1',
    );
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      'content-range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    });
  });

  it('creates a Microsoft Graph draft', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'draft-message-1',
        parentFolderId: 'drafts',
        subject: 'Draft subject',
        body: { contentType: 'Text', content: 'Draft body' },
        isDraft: true,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
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
      value: { providerMessageId: 'draft-message-1', draft: true },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/me/messages');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });

  it('updates an existing Microsoft Graph draft', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ id: 'draft-message-1', isDraft: true }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.updateDraft('draft-message-1', {
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
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { providerMessageId: 'draft-message-1', draft: true },
    });
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
  });

  it('maps message mutations to Microsoft Graph operations', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'message-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'message-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'moved-message-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(adapter.setRead('message-1', true)).resolves.toMatchObject({
      ok: true,
    });
    await expect(adapter.setStarred('message-1', true)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      adapter.moveMessage('message-1', 'archive'),
    ).resolves.toMatchObject({
      ok: true,
      value: { providerMessageId: 'moved-message-1' },
    });
    await expect(
      adapter.deleteMessage('moved-message-1', true),
    ).resolves.toMatchObject({ ok: true });
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PATCH',
      'PATCH',
      'POST',
      'DELETE',
    ]);
  });

  it('handles validation and creates then renews Graph subscriptions', async () => {
    expect(
      microsoftMailProviderDefinition.push?.parse({
        query: { validationToken: 'opaque challenge' },
        body: {},
      }),
    ).toEqual({
      ok: true,
      value: { challengeResponse: 'opaque challenge', notifications: [] },
    });
    expect(
      microsoftMailProviderDefinition.push?.parse({
        query: {},
        body: {
          value: [
            { subscriptionId: 'subscription-1', clientState: 'secret-1' },
          ],
        },
      }),
    ).toEqual({
      ok: true,
      value: {
        notifications: [
          {
            providerSubscriptionId: 'subscription-1',
            clientState: 'secret-1',
          },
        ],
      },
    });

    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    const expiration = '2026-09-09T00:00:00.000Z';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { id: 'subscription-1', expirationDateTime: expiration },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'subscription-1',
          expirationDateTime: expiration,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.upsertPushSubscription({
        notificationUrl: 'https://example.com/main/mail/webhooks/microsoft',
        clientState: 'secret-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        providerSubscriptionId: 'subscription-1',
        expiresAt: expiration,
      },
    });
    const createBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    ) as Record<string, unknown>;
    expect(createBody).toMatchObject({
      changeType: 'created,updated,deleted',
      resource: 'me/messages',
      clientState: 'secret-1',
      latestSupportedTlsVersion: 'v1_2',
    });
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');

    await adapter.upsertPushSubscription({
      notificationUrl: 'https://example.com/main/mail/webhooks/microsoft',
      clientState: 'secret-1',
      providerSubscriptionId: 'subscription-1',
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/subscriptions/subscription-1',
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
  });

  it('recreates an expired Graph subscription when renewal returns 404', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
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
          { error: { message: 'Subscription not found' } },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            id: 'replacement-subscription',
            expirationDateTime: '2026-09-09T00:00:00.000Z',
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.upsertPushSubscription({
        notificationUrl: 'https://example.com/main/mail/webhooks/microsoft',
        clientState: 'secret-1',
        providerSubscriptionId: 'expired-subscription',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { providerSubscriptionId: 'replacement-subscription' },
    });
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PATCH',
      'POST',
    ]);
  });

  it('treats an already-removed Graph subscription as deleted', async () => {
    const credentials = memoryVault();
    await credentials.putAt('credential-1', {
      provider: 'microsoft',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: [],
      tokenType: 'Bearer',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { message: 'Subscription not found' } },
            { status: 404 },
          ),
        ),
    );
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    await expect(
      adapter.deletePushSubscription('expired-subscription'),
    ).resolves.toEqual({ ok: true, value: undefined });
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
    provider: { type: 'microsoft', name: 'microsoft-365' },
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

function config(): MicrosoftMailProviderConfig {
  return {
    type: 'microsoft',
    name: 'microsoft-365',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tenant: 'common',
  };
}

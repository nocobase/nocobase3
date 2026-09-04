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
          value: [
            {
              id: 'message-1',
              parentFolderId: 'inbox',
              subject: 'Synced',
              body: { contentType: 'text', content: 'Body' },
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=opaque',
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
          attachments: [],
          references: [],
        },
      }),
    ).resolves.toEqual({ status: 'accepted' });

    const page = await adapter.listMessages({ limit: 100 });
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

    const first = await adapter.listMessages({ limit: 100 });
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

  it('drains a truncated bootstrap to a delta checkpoint without exceeding the import bound', async () => {
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
          value: [
            {
              id: 'imported-message',
              parentFolderId: 'inbox',
              subject: 'Within bound',
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$skiptoken=page-2',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'not-imported-message',
              parentFolderId: 'inbox',
              subject: 'Beyond bound',
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=checkpoint',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new MicrosoftMailProviderAdapter(
      context(credentials),
      config(),
      account(),
    );

    const initial = await adapter.listMessages({ limit: 1 });
    expect(initial).toMatchObject({
      ok: true,
      value: { messages: [{ providerMessageId: 'imported-message' }] },
    });
    if (!initial.ok || !initial.value.syncCursor) {
      throw new Error('Expected a Microsoft bootstrap cursor.');
    }
    const catchUp = await adapter.listChanges({
      cursor: initial.value.syncCursor,
      limit: 1,
    });

    expect(catchUp).toMatchObject({
      ok: true,
      value: { messages: [], hasMore: false },
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

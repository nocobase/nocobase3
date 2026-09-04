import type { AppClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { MailClient } from '../client/mail-client.js';

describe('MailClient', () => {
  it('maps account and authorization calls onto the Mail API', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === 'mail/accounts') return { data: [{ id: 'account-1' }] };
      return {
        data: {
          authorizationUrl: 'https://accounts.example.test/authorize',
          state: 'state-1',
        },
      };
    });
    const client = new MailClient(appClient(request));

    await expect(client.listAccounts()).resolves.toEqual([{ id: 'account-1' }]);
    await expect(
      client.startAuthorization({ type: 'gmail', name: 'google' }),
    ).resolves.toMatchObject({ state: 'state-1' });
    expect(request).toHaveBeenLastCalledWith('mail/authorizations', {
      method: 'POST',
      body: JSON.stringify({ type: 'gmail', name: 'google' }),
    });
  });

  it('encodes message queries and bounded sync requests', async () => {
    const request = vi.fn(async () => ({
      data: { items: [], id: 'sync-1', status: 'pending' },
    }));
    const client = new MailClient(appClient(request));

    await client.listMessages({
      accountId: 'account/1',
      query: 'from:alice',
      unread: true,
      limit: 20,
    });
    expect(request).toHaveBeenLastCalledWith(
      'mail/messages?accountId=account%2F1&query=from%3Aalice&unread=true&limit=20',
    );

    await client.startSync({
      accountId: 'account/1',
      mode: 'initial',
      receivedAfter: '2026-01-01T00:00:00.000Z',
      maxMessages: 1000,
      batchSize: 100,
    });
    expect(request).toHaveBeenLastCalledWith('mail/accounts/account%2F1/sync', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'initial',
        receivedAfter: '2026-01-01T00:00:00.000Z',
        maxMessages: 1000,
        batchSize: 100,
      }),
    });
  });
});

function appClient(request: ReturnType<typeof vi.fn>): AppClient {
  return {
    request: request as unknown as AppClient['request'],
    stream: async () => {
      throw new Error('Not implemented by this test client.');
    },
  };
}

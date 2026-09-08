import type { AppClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { MailClient } from '../client/mail-client.js';

describe('MailClient', () => {
  it('maps account and authorization calls onto the Mail API', async () => {
    const request = vi.fn(async ({ path }: { path: string }) => {
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
    await client.listManagedAccounts();
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/settings/accounts',
    });
    await client.listManagedOperationLogs();
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/settings/operation-logs',
    });
    await expect(
      client.startAuthorization({ type: 'gmail', name: 'google' }),
    ).resolves.toMatchObject({ state: 'state-1' });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/authorizations',
      method: 'POST',
      json: { type: 'gmail', name: 'google' },
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
      folderId: 'inbox',
      conversationId: 'thread/1',
      unread: true,
      limit: 20,
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/messages?accountId=account%2F1&query=from%3Aalice&folderId=inbox&conversationId=thread%2F1&unread=true&limit=20',
    });

    await client.startSync({
      accountId: 'account/1',
      mode: 'initial',
      receivedAfter: '2026-01-01T00:00:00.000Z',
      maxMessages: 1000,
      batchSize: 100,
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/accounts/account%2F1/sync',
      method: 'POST',
      json: {
        mode: 'initial',
        receivedAfter: '2026-01-01T00:00:00.000Z',
        maxMessages: 1000,
        batchSize: 100,
      },
    });

    await client.listSyncRuns();
    expect(request).toHaveBeenLastCalledWith({ path: 'mail/sync-runs' });

    await client.listSubmissions();
    expect(request).toHaveBeenLastCalledWith({ path: 'mail/submissions' });
  });

  it('streams attachment content from the encoded Mail API path', async () => {
    const stream = vi.fn(async () => streamOf('content'));
    const client = new MailClient({
      request: vi.fn(),
      stream: stream as AppClient['stream'],
    });

    const content = await client.downloadAttachment(
      'account/1',
      'message/1',
      'attachment/1',
    );

    expect(await new Response(content).text()).toBe('content');
    expect(stream).toHaveBeenCalledWith({
      path: 'mail/accounts/account%2F1/messages/message%2F1/attachments/attachment%2F1',
    });
  });

  it('uploads outbound attachments as multipart form data', async () => {
    const request = vi.fn(async () => ({
      data: {
        id: 'attachment-1',
        fileName: 'report.txt',
        contentType: 'text/plain',
        size: 6,
        expiresAt: '2026-09-08T00:00:00.000Z',
      },
    }));
    const client = new MailClient(appClient(request));
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });

    await expect(client.uploadAttachment(file)).resolves.toMatchObject({
      id: 'attachment-1',
    });
    const call = request.mock.calls[0]?.[0] as {
      body?: FormData;
      method?: string;
      path?: string;
    };
    expect(call.path).toBe('mail/attachments');
    expect(call.method).toBe('POST');
    expect(call.body?.get('file')).toBe(file);
  });

  it('maps personal template CRUD to the Mail API', async () => {
    const request = vi.fn(async () => ({
      data: {
        id: 'template-1',
        name: 'Welcome',
        subject: 'Hello',
        text: 'Welcome aboard',
        html: '',
        scope: 'private',
        ownerId: 'user-1',
      },
    }));
    const client = new MailClient(appClient(request));

    await client.listTemplates();
    expect(request).toHaveBeenLastCalledWith({ path: 'mail/templates' });
    await client.saveTemplate({
      id: 'template-1',
      name: 'Welcome',
      subject: 'Hello',
      text: 'Welcome aboard',
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/templates/template-1',
      method: 'PATCH',
      json: {
        name: 'Welcome',
        subject: 'Hello',
        text: 'Welcome aboard',
      },
    });
    await client.deleteTemplate('template/1');
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/templates/template%2F1',
      method: 'DELETE',
    });
  });

  it('submits bounded bulk mail through the dedicated endpoint', async () => {
    const request = vi.fn(async () => ({ data: [] }));
    const client = new MailClient(appClient(request));
    await client.sendBulk({
      accountId: 'account-1',
      identityId: 'identity-1',
      recipients: [
        { address: 'first@example.com' },
        { address: 'second@example.com' },
      ],
      subject: 'Announcement',
      text: 'Hello',
      idempotencyKey: 'bulk-1',
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/messages/bulk',
      method: 'POST',
      json: expect.objectContaining({
        recipients: [
          { address: 'first@example.com' },
          { address: 'second@example.com' },
        ],
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

function streamOf(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

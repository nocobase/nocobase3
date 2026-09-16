import type { AppClient } from '@nocobase/app-client';
import { describe, expect, it, vi } from 'vitest';

import { MailClient } from '../client/mail-client.js';

describe('MailClient', () => {
  it('uses management endpoints for message details and attachments', async () => {
    const request = vi.fn(async () => ({ data: { id: 'message/1' } }));
    const app = appClient(request);
    const stream = vi
      .spyOn(app, 'stream')
      .mockResolvedValue(new ReadableStream());
    const client = new MailClient(app);
    await expect(
      client.getManagedMessage('account/1', 'message/1'),
    ).resolves.toEqual({ id: 'message/1' });
    expect(request).toHaveBeenCalledWith({
      path: 'mail/management/accounts/account%2F1/messages/message%2F1',
    });
    await client.downloadManagedAttachment('account/1', 'message/1', 'file/1');
    expect(stream).toHaveBeenCalledWith({
      path: 'mail/management/accounts/account%2F1/messages/message%2F1/attachments/file%2F1',
    });
  });

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
    await client.listManagementAccounts();
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/management/accounts',
    });
    await client.listManagedFolders('account/1');
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/management/accounts/account%2F1/folders',
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
    await client.connectAccount({
      type: 'imap-smtp',
      name: 'company-mail',
      address: 'user@example.com',
      username: 'user@example.com',
      password: 'secret',
      displayName: 'User',
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/accounts/connect',
      method: 'POST',
      json: {
        type: 'imap-smtp',
        name: 'company-mail',
        address: 'user@example.com',
        username: 'user@example.com',
        password: 'secret',
        displayName: 'User',
      },
    });
  });

  it('encodes message queries and sync requests', async () => {
    const request = vi.fn(async () => ({
      data: { items: [], id: 'sync-1', status: 'pending' },
    }));
    const client = new MailClient(appClient(request));

    await client.listMessages({
      accountId: 'account/1',
      query: 'from:alice',
      folderId: 'inbox',
      labelId: 'label/1',
      conversationId: 'thread/1',
      unread: true,
      limit: 20,
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/messages?accountId=account%2F1&query=from%3Aalice&folderId=inbox&labelId=label%2F1&conversationId=thread%2F1&unread=true&limit=20',
    });

    await client.listManagedMessages({
      accountId: 'account/1',
      query: 'alice@example.com',
      folderId: 'folder/1',
      limit: 20,
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/management/messages?accountId=account%2F1&query=alice%40example.com&folderId=folder%2F1&limit=20',
    });

    await client.manageMessages({
      action: 'move',
      items: [{ accountId: 'account/1', messageId: 'message/1' }],
      providerFolderId: 'archive',
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/management/messages/actions',
      method: 'POST',
      json: {
        action: 'move',
        items: [{ accountId: 'account/1', messageId: 'message/1' }],
        providerFolderId: 'archive',
      },
    });

    await client.startSync({
      accountId: 'account/1',
      mode: 'initial',
      receivedAfter: '2026-01-01T00:00:00.000Z',
      maxMessages: 1000,
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/accounts/account%2F1/sync',
      method: 'POST',
      json: {
        mode: 'initial',
        receivedAfter: '2026-01-01T00:00:00.000Z',
        maxMessages: 1000,
      },
    });

    await client.listSyncRuns();
    expect(request).toHaveBeenLastCalledWith({ path: 'mail/sync-runs' });

    await client.listSubmissions();
    expect(request).toHaveBeenLastCalledWith({ path: 'mail/submissions' });
  });

  it('maps P1 mailbox-management calls onto encoded Mail API paths', async () => {
    const request = vi.fn(async ({ path }: { path: string }) => ({
      data: path === 'mail/unread-count' ? 4 : {},
    }));
    const client = new MailClient(appClient(request));

    await expect(client.getUnreadCount()).resolves.toBe(4);
    await client.saveSignature({
      id: 'signature/1',
      accountId: 'account/1',
      name: 'Sales',
      text: 'Regards',
      isDefault: true,
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/accounts/account%2F1/signatures/signature%2F1',
      method: 'PATCH',
      json: { name: 'Sales', text: 'Regards', isDefault: true },
    });

    await client.listLabels();
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/labels',
    });
    await client.createLabel('Customers', 'green');
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/labels',
      method: 'POST',
      json: { name: 'Customers', color: 'green' },
    });
    await client.updateLabel({
      id: 'label/1',
      name: 'Customers',
      color: 'violet',
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/labels/label%2F1',
      method: 'PATCH',
      json: { name: 'Customers', color: 'violet' },
    });
    await client.deleteLabel('label/1');
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/labels/label%2F1',
      method: 'DELETE',
    });
    await client.updateMessageLabels({
      accountId: 'account/1',
      messageId: 'message/1',
      addLabelIds: ['Label_1'],
      removeLabelIds: ['Label_2'],
    });
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/accounts/account%2F1/messages/message%2F1/labels',
      method: 'PATCH',
      json: {
        addLabelIds: ['Label_1'],
        removeLabelIds: ['Label_2'],
      },
    });

    await client.retrySyncRun('sync/1');
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/sync-runs/sync%2F1/retry',
      method: 'POST',
      json: {},
    });
    await client.cancelSyncRun('sync/1');
    expect(request).toHaveBeenLastCalledWith({
      path: 'mail/sync-runs/sync%2F1/cancel',
      method: 'POST',
      json: {},
    });
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

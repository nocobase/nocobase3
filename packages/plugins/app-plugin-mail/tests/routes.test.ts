import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { createConfigPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { describe, expect, it, vi } from 'vitest';

import { mailApiRoutes } from '../server/routes/api.js';
import { mailServiceToken } from '../server/tokens.js';
import type { MailService, MailSyncRunView } from '../server/types.js';
import serverLocales from '../server/locales/index.js';

describe('mail API routes', () => {
  it('owns an authentication boundary', async () => {
    const router = await createRouter(false, service());
    const response = await router.request('/api/mail/accounts');
    expect(response.status).toBe(401);
  });

  it('enforces Mail workspace access', async () => {
    const router = await createRouter(true, service(), false);
    const response = await router.request('/api/mail/accounts');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'MAIL_ACCESS_DENIED',
        message: 'Mail access is required.',
      },
    });
  });

  it('requires separate administrator access for cross-user data', async () => {
    const checkedResources: string[] = [];
    const router = await createRouter(true, service(), (resource) => {
      checkedResources.push(resource);
      return resource === 'mail.workspace';
    });

    await expect(router.request('/api/mail/accounts')).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      router.request('/api/mail/settings/accounts'),
    ).resolves.toMatchObject({ status: 403 });
    expect(checkedResources).toEqual(['mail.workspace', 'mail.admin']);
  });

  it('translates API errors from the request locale', async () => {
    const router = await createRouter(true, service(), false);
    const response = await router.request('/api/mail/accounts', {
      headers: { 'accept-language': 'zh-CN' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'MAIL_ACCESS_DENIED',
        message: '需要邮件访问权限。',
      },
    });
  });

  it('lists all managed accounts for an authorized Settings user', async () => {
    const listManagedAccounts = vi.fn<MailService['listManagedAccounts']>(
      async () => [
        {
          id: 'account-2',
          userId: 'user-2',
          provider: { type: 'gmail', name: 'google' },
          address: 'other@example.com',
          scopes: [],
          status: 'active',
          isDefault: true,
          canSync: false,
        },
      ],
    );
    const router = await createRouter(true, service({ listManagedAccounts }));

    const response = await router.request('/api/mail/settings/accounts');

    expect(response.status).toBe(200);
    expect(listManagedAccounts).toHaveBeenCalledWith({ actorId: 'user-1' });
    expect(await response.json()).toMatchObject({
      data: [{ userId: 'user-2', address: 'other@example.com' }],
    });
  });

  it('lists all user operation logs for an authorized Settings user', async () => {
    const listManagedOperationLogs = vi.fn<
      MailService['listManagedOperationLogs']
    >(async () => ({
      accounts: [],
      syncRuns: [syncRun('account-2', 'user-2')],
      submissions: [
        {
          id: 'submission-2',
          accountId: 'account-2',
          status: 'accepted',
          createdAt: '2026-09-06T08:00:00.000Z',
          updatedAt: '2026-09-06T08:00:01.000Z',
        },
      ],
    }));
    const router = await createRouter(
      true,
      service({ listManagedOperationLogs }),
    );

    const response = await router.request('/api/mail/settings/operation-logs');

    expect(response.status).toBe(200);
    expect(listManagedOperationLogs).toHaveBeenCalledWith({
      actorId: 'user-1',
    });
    expect(await response.json()).toMatchObject({
      data: {
        syncRuns: [{ accountId: 'account-2' }],
        submissions: [{ accountId: 'account-2' }],
      },
    });
  });

  it('starts a bounded asynchronous sync for the authenticated user', async () => {
    const startSync = vi.fn<MailService['startSync']>(async (context, input) =>
      syncRun(input.accountId, context.actorId),
    );
    const router = await createRouter(true, service({ startSync }));
    const response = await router.request('/api/mail/accounts/account-1/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'initial',
        batchSize: 100,
        maxMessages: 5_000,
      }),
    });

    expect(response.status).toBe(202);
    expect(startSync).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        mode: 'initial',
        batchSize: 100,
        maxMessages: 5_000,
      },
    );
  });

  it('lists synchronization logs for the authenticated user', async () => {
    const listSyncRuns = vi.fn<MailService['listSyncRuns']>(async () => [
      syncRun('account-1', 'user-1'),
    ]);
    const router = await createRouter(true, service({ listSyncRuns }));

    const response = await router.request('/api/mail/sync-runs');

    expect(response.status).toBe(200);
    expect(listSyncRuns).toHaveBeenCalledWith({ actorId: 'user-1' });
    expect(await response.json()).toMatchObject({
      data: [{ id: 'sync-1', accountId: 'account-1' }],
    });
  });

  it('retries and cancels synchronization runs for the authenticated user', async () => {
    const retrySyncRun = vi.fn<MailService['retrySyncRun']>(async () =>
      syncRun('account-1', 'user-1'),
    );
    const cancelSyncRun = vi.fn<MailService['cancelSyncRun']>(async () => ({
      ...syncRun('account-1', 'user-1'),
      status: 'cancelled',
    }));
    const router = await createRouter(
      true,
      service({ retrySyncRun, cancelSyncRun }),
    );

    expect(
      (
        await router.request('/api/mail/sync-runs/sync-1/retry', {
          method: 'POST',
        })
      ).status,
    ).toBe(202);
    expect(
      (
        await router.request('/api/mail/sync-runs/sync-1/cancel', {
          method: 'POST',
        })
      ).status,
    ).toBe(200);
    expect(retrySyncRun).toHaveBeenCalledWith({ actorId: 'user-1' }, 'sync-1');
    expect(cancelSyncRun).toHaveBeenCalledWith({ actorId: 'user-1' }, 'sync-1');
  });

  it('maps unread counts, signatures, and labels onto the Mail service', async () => {
    const getUnreadCount = vi.fn<MailService['getUnreadCount']>(async () => 7);
    const listSignatures = vi.fn<MailService['listSignatures']>(async () => []);
    const saveSignature = vi.fn<MailService['saveSignature']>(
      async (_context, input) => ({
        id: 'signature-1',
        accountId: input.accountId,
        identityId: input.identityId,
        name: input.name,
        text: input.text,
        html: input.html,
        isDefault: input.isDefault ?? false,
      }),
    );
    const createLabel = vi.fn<MailService['createLabel']>(async () => ({
      id: 'folder-1',
      accountId: 'account-1',
      providerFolderId: 'Label_1',
      name: 'Customers',
      path: 'Customers',
      type: 'custom',
      selectable: true,
    }));
    const router = await createRouter(
      true,
      service({ getUnreadCount, listSignatures, saveSignature, createLabel }),
    );

    const unreadResponse = await router.request('/api/mail/unread-count');
    await router.request(
      '/api/mail/accounts/account-1/identities/identity-1/signatures',
    );
    await router.request(
      '/api/mail/accounts/account-1/identities/identity-1/signatures',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Sales',
          text: 'Regards',
          isDefault: true,
        }),
      },
    );
    await router.request('/api/mail/accounts/account-1/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Customers' }),
    });

    expect(await unreadResponse.json()).toEqual({ data: 7 });
    expect(listSignatures).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      'account-1',
      'identity-1',
    );
    expect(saveSignature).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        identityId: 'identity-1',
        name: 'Sales',
        text: 'Regards',
        html: undefined,
        isDefault: true,
      },
    );
    expect(createLabel).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      'account-1',
      'Customers',
    );
  });

  it('lists send logs for the authenticated user', async () => {
    const listSubmissions = vi.fn<MailService['listSubmissions']>(async () => [
      {
        id: 'submission-1',
        accountId: 'account-1',
        status: 'accepted',
        providerMessageId: 'provider-message-1',
        createdAt: '2026-09-06T08:00:00.000Z',
        updatedAt: '2026-09-06T08:00:01.000Z',
      },
    ]);
    const router = await createRouter(true, service({ listSubmissions }));

    const response = await router.request('/api/mail/submissions');

    expect(response.status).toBe(200);
    expect(listSubmissions).toHaveBeenCalledWith({ actorId: 'user-1' });
    expect(await response.json()).toMatchObject({
      data: [{ id: 'submission-1', accountId: 'account-1' }],
    });
  });

  it('starts OAuth with the configured public callback URL', async () => {
    const startAuthorization = vi.fn<MailService['startAuthorization']>(
      async () => ({
        authorizationUrl: 'https://accounts.example.com/authorize',
        state: 'state-1',
      }),
    );
    const router = await createRouter(true, service({ startAuthorization }));
    const response = await router.request('/api/mail/authorizations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'gmail', name: 'google' }),
    });

    expect(response.status).toBe(200);
    expect(startAuthorization).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        provider: { type: 'gmail', name: 'google' },
        redirectUri: 'https://mail.example.com/test/mail/oauth/callback',
      },
    );
  });

  it('maps mailbox folders, filters, and conversations onto the Mail service', async () => {
    const listFolders = vi.fn<MailService['listFolders']>(async () => []);
    const listMessages = vi.fn<MailService['listMessages']>(async () => ({
      items: [],
    }));
    const listConversationMessages = vi.fn<
      MailService['listConversationMessages']
    >(async () => ({ items: [] }));
    const router = await createRouter(
      true,
      service({ listFolders, listMessages, listConversationMessages }),
    );

    await router.request('/api/mail/accounts/account-1/folders');
    await router.request(
      '/api/mail/messages?accountId=account-1&folderId=inbox&conversationId=thread-1&unread=true&limit=25',
    );
    await router.request(
      '/api/mail/accounts/account-1/conversations/thread-1/messages?cursor=25&limit=25',
    );

    expect(listFolders).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      'account-1',
    );
    expect(listMessages).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountIds: ['account-1'],
        folderIds: ['inbox'],
        conversationId: 'thread-1',
        query: undefined,
        cursor: undefined,
        limit: 25,
        unread: true,
        starred: undefined,
      },
    );
    expect(listConversationMessages).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      'account-1',
      'thread-1',
      { cursor: '25', limit: 25 },
    );
  });

  it('rejects invalid send requests before calling the Mail service', async () => {
    const sendMessage = vi.fn<MailService['sendMessage']>();
    const router = await createRouter(true, service({ sendMessage }));
    const response = await router.request('/api/mail/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'account-1' }),
    });

    expect(response.status).toBe(400);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('preserves reply, forward, and scheduling fields at the HTTP boundary', async () => {
    const sendMessage = vi.fn<MailService['sendMessage']>(
      async (_context, input) => ({
        id: input.idempotencyKey,
        accountId: input.accountId,
        status: 'pending',
        scheduledAt: input.scheduledAt,
      }),
    );
    const router = await createRouter(true, service({ sendMessage }));
    const response = await router.request('/api/mail/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [{ address: 'recipient@example.com' }],
        subject: 'Follow up',
        text: 'Mail body',
        inReplyToMessageId: 'message-1',
        scheduledAt: '2099-01-01T00:00:00.000Z',
        idempotencyKey: 'scheduled-reply',
      }),
    });

    expect(response.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      expect.objectContaining({
        inReplyToMessageId: 'message-1',
        scheduledAt: '2099-01-01T00:00:00.000Z',
      }),
    );
  });

  it('allows an empty-recipient draft at the HTTP boundary', async () => {
    const saveDraft = vi.fn<MailService['saveDraft']>(async () =>
      messageView(),
    );
    const router = await createRouter(true, service({ saveDraft }));

    const response = await router.request('/api/mail/messages/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: 'account-1',
        identityId: 'identity-1',
        subject: '',
        text: '',
        draftMessageId: 'draft-message-1',
        retainedAttachmentIds: ['draft-message-1:provider-attachment-1'],
        idempotencyKey: 'draft-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(saveDraft).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      expect.objectContaining({
        to: [],
        subject: '',
        text: '',
        draftMessageId: 'draft-message-1',
        retainedAttachmentIds: ['draft-message-1:provider-attachment-1'],
      }),
    );
  });

  it('does not expose internal service errors', async () => {
    const listAccounts = vi.fn<MailService['listAccounts']>(async () => {
      throw new Error('database password appeared in an internal error');
    });
    const router = await createRouter(true, service({ listAccounts }));

    const response = await router.request('/api/mail/accounts');
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: {
        code: 'MAIL_REQUEST_FAILED',
        message: 'The mail request could not be completed.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('database password');
  });

  it('maps message mutation routes onto the Mail service', async () => {
    const updateMessage = vi.fn<MailService['updateMessage']>(async () =>
      messageView(),
    );
    const moveMessage = vi.fn<MailService['moveMessage']>(async () =>
      messageView(),
    );
    const deleteMessage = vi.fn<MailService['deleteMessage']>(async () => {});
    const updateMessageLabels = vi.fn<MailService['updateMessageLabels']>(
      async () => messageView(),
    );
    const router = await createRouter(
      true,
      service({
        updateMessage,
        updateMessageLabels,
        moveMessage,
        deleteMessage,
      }),
    );

    expect(
      (
        await router.request(
          '/api/mail/accounts/account-1/messages/message-1',
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              read: true,
              starred: true,
              note: 'Follow up with the customer',
              todo: true,
            }),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await router.request(
          '/api/mail/accounts/account-1/messages/message-1/labels',
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              addLabelIds: ['Label_1'],
              removeLabelIds: ['Label_2'],
            }),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await router.request(
          '/api/mail/accounts/account-1/messages/message-1/move',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerFolderId: 'archive' }),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await router.request(
          '/api/mail/accounts/account-1/messages/message-1?permanently=true',
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(204);

    expect(updateMessage).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        messageId: 'message-1',
        read: true,
        starred: true,
        note: 'Follow up with the customer',
        todo: true,
      },
    );
    expect(updateMessageLabels).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        messageId: 'message-1',
        addLabelIds: ['Label_1'],
        removeLabelIds: ['Label_2'],
      },
    );
    expect(moveMessage).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        messageId: 'message-1',
        providerFolderId: 'archive',
      },
    );
    expect(deleteMessage).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      {
        accountId: 'account-1',
        messageId: 'message-1',
        permanently: true,
      },
    );
  });

  it('streams an owned attachment with download-safe headers', async () => {
    const getAttachment = vi.fn<MailService['getAttachment']>(async () => ({
      fileName: '季度 报告.pdf',
      contentType: 'application/pdf',
      size: 3,
      stream: streamOf('pdf'),
    }));
    const router = await createRouter(true, service({ getAttachment }));

    const response = await router.request(
      '/api/mail/accounts/account-1/messages/message-1/attachments/attachment-1',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe('3');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''%E5%AD%A3%E5%BA%A6%20%E6%8A%A5%E5%91%8A.pdf",
    );
    expect(await response.text()).toBe('pdf');
    expect(getAttachment).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      'account-1',
      'message-1',
      'attachment-1',
    );
  });

  it('does not silently discard unsupported attachments', async () => {
    const sendMessage = vi.fn<MailService['sendMessage']>(async () => {
      throw new TypeError('Attachments are not supported.');
    });
    const router = await createRouter(true, service({ sendMessage }));

    const response = await router.request('/api/mail/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [{ address: 'recipient@example.com' }],
        subject: 'Hello',
        text: 'Mail body',
        attachmentIds: ['attachment-1'],
        idempotencyKey: 'request-with-attachment',
      }),
    });

    expect(response.status).toBe(400);
    expect(sendMessage).toHaveBeenCalledWith(
      { actorId: 'user-1' },
      expect.objectContaining({ attachmentIds: ['attachment-1'] }),
    );
  });
});

async function createRouter(
  authenticated: boolean,
  mail: MailService,
  allowed: boolean | ((resource: string) => boolean) = true,
): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (!authenticated) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: 'user-1' },
        session: {},
      });
      await next();
    },
  } as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', {
        can: async (request: { resource: { id: string } }) =>
          typeof allowed === 'function'
            ? allowed(request.resource.id)
            : allowed,
      });
      await next();
    },
  } as unknown as AppAuthorization);
  container.instance(mailServiceToken, mail);
  const contribution = await mailApiRoutes.createRouter({
    appName: 'test',
    publicBasePath: '/test',
    config: {
      get: () => ({
        name: 'test',
        publicBasePath: '/test',
        publicOrigin: 'https://mail.example.com',
      }),
    },
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace('@nocobase/app-plugin-mail', serverLocales);
  await runtime.init();
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  router.route('/api', contribution);
  return router;
}

function service(overrides: Partial<MailService> = {}): MailService {
  return {
    listProviders: async () => [],
    startAuthorization: async (_context, input) => ({
      authorizationUrl: `https://example.com/authorize/${input.provider.type}`,
      state: 'state-1',
    }),
    completeAuthorization: async () => ({
      id: 'account-1',
      userId: 'user-1',
      provider: { type: 'test', name: 'test' },
      address: 'user@example.com',
      scopes: [],
      status: 'active',
      isDefault: true,
    }),
    listAccounts: async () => [],
    updateAccount: async (_context, input) => ({
      id: input.accountId,
      userId: 'user-1',
      provider: { type: 'test', name: 'test' },
      address: 'user@example.com',
      scopes: [],
      status: input.status ?? 'active',
      isDefault: input.isDefault ?? true,
    }),
    removeAccount: async () => {},
    listManagedAccounts: async () => [],
    listManagedOperationLogs: async () => ({
      accounts: [],
      syncRuns: [],
      submissions: [],
    }),
    listFolders: async () => [],
    listIdentities: async () => [],
    updateIdentity: async () => {
      throw new Error('Not implemented');
    },
    listSignatures: async () => [],
    saveSignature: async () => {
      throw new Error('Not implemented');
    },
    deleteSignature: async () => {},
    createLabel: async () => {
      throw new Error('Not implemented');
    },
    updateMessageLabels: async () => messageView(),
    getUnreadCount: async () => 0,
    startSync: async (_context, input) => syncRun(input.accountId, 'user-1'),
    getSyncRun: async () => undefined,
    listSyncRuns: async () => [],
    retrySyncRun: async () => syncRun('account-1', 'user-1'),
    cancelSyncRun: async () => ({
      ...syncRun('account-1', 'user-1'),
      status: 'cancelled',
    }),
    listSubmissions: async () => [],
    listMessages: async () => ({ items: [] }),
    getMessage: async () => undefined,
    getAttachment: async () => ({
      fileName: 'attachment.bin',
      contentType: 'application/octet-stream',
      stream: streamOf(''),
    }),
    listConversationMessages: async () => ({ items: [] }),
    sendMessage: async (_context, input) => ({
      id: input.idempotencyKey,
      accountId: input.accountId,
      status: 'accepted',
    }),
    saveDraft: async () => messageView(),
    updateMessage: async () => messageView(),
    moveMessage: async () => messageView(),
    deleteMessage: async () => {},
    ...overrides,
  };
}

function messageView(): import('../server/types.js').MailMessage {
  return {
    id: 'message-1',
    accountId: 'account-1',
    providerMessageId: 'provider-message-1',
    folderIds: ['inbox'],
    to: [],
    cc: [],
    bcc: [],
    replyTo: [],
    references: [],
    subject: 'Subject',
    read: false,
    starred: false,
    draft: false,
    hasAttachments: false,
    todo: false,
    attachments: [],
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

function syncRun(accountId: string, _requestedBy: string): MailSyncRunView {
  return {
    id: 'sync-1',
    accountId,
    mode: 'initial',
    phase: 'preparing',
    status: 'pending',
    policy: { maxMessages: 10_000, batchSize: 100 },
    processedMessages: 0,
    processedPages: 0,
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  };
}

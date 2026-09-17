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

describe('[API][SEC] mail API routes and permission boundaries', () => {
  it('does not forward per-account automatic sync configuration', async () => {
    const mail = service();
    const updateAccount = vi.spyOn(mail, 'updateAccount');
    const router = await createRouter(true, mail);
    const response = await router.request('/api/mail/accounts/account-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'suspended',
        automaticSyncIntervalMinutes: 1,
      }),
    });

    expect(response.status).toBe(200);
    expect(updateAccount).toHaveBeenCalledWith(expect.anything(), {
      accountId: 'account-1',
      status: 'suspended',
    });
  });

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
        ns: '@nocobase/app-plugin-mail',
        key: 'errors.accessDenied',
        params: {},
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

  it('requires independent management access for cross-user mail data', async () => {
    const checkedResources: string[] = [];
    const router = await createRouter(true, service(), (resource) => {
      checkedResources.push(resource);
      return resource === 'mail.management';
    });

    await expect(
      router.request('/api/mail/management/messages'),
    ).resolves.toMatchObject({ status: 200 });
    await expect(router.request('/api/mail/messages')).resolves.toMatchObject({
      status: 403,
    });
    await expect(
      router.request('/api/mail/settings/accounts'),
    ).resolves.toMatchObject({ status: 403 });
    expect(checkedResources).toEqual([
      'mail.management',
      'mail.workspace',
      'mail.admin',
    ]);
  });

  it('protects managed details and attachments with independent management access', async () => {
    const getManagedMessage = vi.fn<MailService['getManagedMessage']>(
      async () => messageView(),
    );
    const getManagedAttachment = vi.fn<MailService['getManagedAttachment']>(
      async () => ({
        fileName: 'test.txt',
        contentType: 'text/plain',
        stream: streamOf('managed attachment'),
      }),
    );
    const mail = service({ getManagedMessage, getManagedAttachment });
    const path =
      '/api/mail/management/accounts/account%2F1/messages/message%2F1';
    for (const authenticated of [false, true]) {
      const denied = await createRouter(
        authenticated,
        mail,
        (resource) => resource === 'mail.workspace',
      );
      expect((await denied.request(path)).status).toBe(
        authenticated ? 403 : 401,
      );
      expect(
        (await denied.request(`${path}/attachments/file%2F1`)).status,
      ).toBe(authenticated ? 403 : 401);
    }
    expect(getManagedMessage).not.toHaveBeenCalled();
    expect(getManagedAttachment).not.toHaveBeenCalled();
    const router = await createRouter(
      true,
      mail,
      (resource) => resource === 'mail.management',
    );
    expect((await router.request(path)).status).toBe(200);
    expect(getManagedMessage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'account/1',
      'message/1',
    );
    const attachment = await router.request(`${path}/attachments/file%2F1`);
    expect(await attachment.text()).toBe('managed attachment');
    expect(getManagedAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'account/1',
      'message/1',
      'file/1',
    );
    getManagedMessage.mockResolvedValueOnce(undefined);
    const missing = await router.request(path);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'MAIL_MESSAGE_NOT_FOUND' },
    });
  });

  it('maps management account, folder, and message queries to the service', async () => {
    const listManagedAccounts = vi.fn<MailService['listManagedAccounts']>(
      async () => [],
    );
    const listManagedFolders = vi.fn<MailService['listManagedFolders']>(
      async () => [],
    );
    const listManagedMessages = vi.fn<MailService['listManagedMessages']>(
      async () => ({ items: [] }),
    );
    const router = await createRouter(
      true,
      service({ listManagedAccounts, listManagedFolders, listManagedMessages }),
      (resource) => resource === 'mail.management',
    );

    await router.request('/api/mail/management/accounts');
    await router.request('/api/mail/management/accounts/account%2F1/folders');
    await router.request(
      '/api/mail/management/messages?accountId=account%2F1&folderId=folder%2F1&query=alice&offset=60&limit=20&withTotal=true',
    );

    expect(listManagedAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
    );
    expect(listManagedFolders).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'account/1',
    );
    expect(listManagedMessages).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        accountIds: ['account/1'],
        folderIds: ['folder/1'],
        query: 'alice',
        cursor: undefined,
        offset: 60,
        withTotal: true,
        limit: 20,
        unread: undefined,
        starred: undefined,
      },
    );
  });

  it('returns counted log pages only when requested and keeps the actor scope', async () => {
    const listSyncRunsPage = vi.fn<MailService['listSyncRunsPage']>(
      async () => ({ items: [], total: 125 }),
    );
    const listSubmissionsPage = vi.fn<MailService['listSubmissionsPage']>(
      async () => ({ items: [], total: 205 }),
    );
    const router = await createRouter(
      true,
      service({ listSyncRunsPage, listSubmissionsPage }),
    );
    const sync = await router.request(
      '/api/mail/sync-runs?offset=120&limit=20&withTotal=true',
    );
    expect(await sync.json()).toEqual({ data: { items: [], total: 125 } });
    expect(listSyncRunsPage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      120,
      20,
    );
    const submissions = await router.request(
      '/api/mail/submissions?offset=200&limit=20&bulkOnly=true&groupByBatch=true&withTotal=true',
    );
    expect(await submissions.json()).toEqual({
      data: { items: [], total: 205 },
    });
    expect(listSubmissionsPage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      true,
      200,
      true,
      20,
    );
  });

  it('maps management message actions and validates their item targets', async () => {
    const manageMessages = vi.fn<MailService['manageMessages']>(async () => ({
      items: [
        {
          accountId: 'account-1',
          messageId: 'message-1',
          status: 'succeeded',
        },
      ],
      succeeded: 1,
      failed: 0,
    }));
    const router = await createRouter(
      true,
      service({ manageMessages }),
      (resource) => resource === 'mail.management',
    );

    const response = await router.request(
      '/api/mail/management/messages/actions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'markRead',
          items: [{ accountId: 'account-1', messageId: 'message-1' }],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(manageMessages).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        action: 'markRead',
        items: [{ accountId: 'account-1', messageId: 'message-1' }],
        providerFolderId: undefined,
        permanently: undefined,
      },
    );

    const invalidResponse = await router.request(
      '/api/mail/management/messages/actions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', items: [] }),
      },
    );
    expect(invalidResponse.status).toBe(400);
    expect(manageMessages).toHaveBeenCalledTimes(1);
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
        ns: '@nocobase/app-plugin-mail',
        key: 'errors.accessDenied',
        params: {},
        message: '需要邮件访问权限。',
      },
    });
  });

  it('lets consumers translate the same error in another locale', async () => {
    const router = await createRouter(true, service(), false);
    const response = await router.request('/api/mail/accounts');
    const { error } = (await response.json()) as {
      error: {
        code: string;
        ns: string;
        key: string;
        params: Record<string, unknown>;
        message: string;
      };
    };
    const consumer = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    consumer.registerNamespace(error.ns, serverLocales);
    await consumer.init('zh-CN');
    expect(error.message).toBe('Mail access is required.');
    expect(consumer.getFixedT(error.ns, 'zh-CN')(error.key, error.params)).toBe(
      '需要邮件访问权限。',
    );
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
          canSync: false,
        },
      ],
    );
    const router = await createRouter(true, service({ listManagedAccounts }));

    const response = await router.request('/api/mail/settings/accounts');

    expect(response.status).toBe(200);
    expect(listManagedAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
    );
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
      signal: expect.any(AbortSignal),
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
        batchSize: 500,
        maxMessages: 5_000,
      }),
    });

    expect(response.status).toBe(202);
    expect(startSync).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        accountId: 'account-1',
        mode: 'initial',
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
    expect(listSyncRuns).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      undefined,
      undefined,
    );
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
    expect(retrySyncRun).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'sync-1',
    );
    expect(cancelSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'sync-1',
    );
  });

  it('maps unread counts, signatures, and local labels onto the Mail service', async () => {
    const getUnreadCount = vi.fn<MailService['getUnreadCount']>(async () => 7);
    const listSignatures = vi.fn<MailService['listSignatures']>(async () => []);
    const saveSignature = vi.fn<MailService['saveSignature']>(
      async (_context, input) => ({
        id: 'signature-1',
        accountId: input.accountId,
        name: input.name,
        text: input.text,
        html: input.html,
        isDefault: input.isDefault ?? false,
      }),
    );
    const listLabels = vi.fn<MailService['listLabels']>(async () => []);
    const createLabel = vi.fn<MailService['createLabel']>(async () => ({
      id: 'label-1',
      name: 'Customers',
      color: 'green',
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    }));
    const updateLabel = vi.fn<MailService['updateLabel']>(
      async (_context, input) => ({
        id: input.id,
        name: input.name,
        color: input.color ?? 'blue',
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      }),
    );
    const deleteLabel = vi.fn<MailService['deleteLabel']>(async () => {});
    const router = await createRouter(
      true,
      service({
        getUnreadCount,
        listSignatures,
        saveSignature,
        listLabels,
        createLabel,
        updateLabel,
        deleteLabel,
      }),
    );

    const unreadResponse = await router.request('/api/mail/unread-count');
    await router.request('/api/mail/accounts/account-1/signatures');
    await router.request('/api/mail/accounts/account-1/signatures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sales',
        text: 'Regards',
        isDefault: true,
      }),
    });
    await router.request('/api/mail/labels');
    await router.request('/api/mail/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Customers', color: 'green' }),
    });
    await router.request('/api/mail/labels/label-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Customers renamed', color: 'violet' }),
    });
    await router.request('/api/mail/labels/label-1', { method: 'DELETE' });

    expect(await unreadResponse.json()).toEqual({ data: 7 });
    expect(listSignatures).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'account-1',
    );
    expect(saveSignature).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        accountId: 'account-1',
        name: 'Sales',
        text: 'Regards',
        html: undefined,
        isDefault: true,
      },
    );
    expect(createLabel).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      { name: 'Customers', color: 'green' },
    );
    expect(updateLabel).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      { id: 'label-1', name: 'Customers renamed', color: 'violet' },
    );
    expect(deleteLabel).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'label-1',
    );
    expect(listLabels).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
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
    expect(listSubmissions).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(await response.json()).toMatchObject({
      data: [{ id: 'submission-1', accountId: 'account-1' }],
    });
  });

  it('forwards log offsets and limits and rejects invalid pagination', async () => {
    const listSyncRuns = vi.fn<MailService['listSyncRuns']>(async () => []);
    const listSubmissions = vi.fn<MailService['listSubmissions']>(
      async () => [],
    );
    const router = await createRouter(
      true,
      service({ listSyncRuns, listSubmissions }),
    );
    expect(
      (await router.request('/api/mail/sync-runs?offset=20&limit=21')).status,
    ).toBe(200);
    expect(listSyncRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      20,
      21,
    );
    expect(
      (
        await router.request(
          '/api/mail/submissions?bulkOnly=true&groupByBatch=true&offset=40&limit=21',
        )
      ).status,
    ).toBe(200);
    expect(listSubmissions).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      true,
      40,
      true,
      21,
    );
    for (const endpoint of ['sync-runs', 'submissions']) {
      for (const query of [
        'offset=-1',
        'offset=1.5',
        'offset=NaN',
        'limit=0',
        'limit=101',
        'limit=1.5',
      ]) {
        expect(
          (await router.request(`/api/mail/${endpoint}?${query}`)).status,
        ).toBe(400);
      }
    }
    expect(listSyncRuns).toHaveBeenCalledTimes(1);
    expect(listSubmissions).toHaveBeenCalledTimes(1);
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
      body: JSON.stringify({
        type: 'gmail',
        name: 'google',
        initialSyncReceivedAfter: '2026-02-01T00:00:00.000Z',
      }),
    });

    expect(response.status).toBe(200);
    expect(startAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        provider: { type: 'gmail', name: 'google' },
        redirectUri: 'https://mail.example.com/test/mail/oauth/callback',
        initialSyncReceivedAfter: '2026-02-01T00:00:00.000Z',
      },
    );
  });

  it('uses a Mail-configured OAuth callback URL', async () => {
    const startAuthorization = vi.fn<MailService['startAuthorization']>(
      async () => ({
        authorizationUrl: 'https://accounts.example.com/authorize',
        state: 'state-1',
      }),
    );
    const router = await createRouter(
      true,
      service({ startAuthorization }),
      true,
      'https://oauth.example.com/test/mail/oauth/callback',
    );
    const response = await router.request('/api/mail/authorizations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'gmail', name: 'google' }),
    });

    expect(response.status).toBe(200);
    expect(startAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      expect.objectContaining({
        redirectUri: 'https://oauth.example.com/test/mail/oauth/callback',
      }),
    );
  });

  it('uses the request host when development public origins use loopback aliases', async () => {
    const startAuthorization = vi.fn<MailService['startAuthorization']>(
      async () => ({
        authorizationUrl: 'https://accounts.example.com/authorize',
        state: 'state-1',
      }),
    );
    const router = await createRouter(
      true,
      service({ startAuthorization }),
      true,
      undefined,
      'http://127.0.0.1:13000',
    );
    const response = await router.request(
      'http://localhost:13000/api/mail/authorizations',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'microsoft', name: 'microsoft-365' }),
      },
    );

    expect(response.status).toBe(200);
    expect(startAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      expect.objectContaining({
        redirectUri: 'http://localhost:13000/test/mail/oauth/callback',
      }),
    );
  });

  it('connects a credential-based Provider account', async () => {
    const connectAccount = vi.fn<MailService['connectAccount']>(
      async (_context, input) => ({
        id: 'account-1',
        userId: 'user-1',
        provider: input.provider,
        address: input.address,
        scopes: [],
        status: 'active',
      }),
    );
    const router = await createRouter(true, service({ connectAccount }));
    const response = await router.request('/api/mail/accounts/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'imap-smtp',
        name: 'company-mail',
        address: 'user@example.com',
        password: 'secret',
        initialSyncReceivedAfter: '2026-02-01T00:00:00.000Z',
      }),
    });

    expect(response.status).toBe(200);
    expect(connectAccount).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        provider: { type: 'imap-smtp', name: 'company-mail' },
        address: 'user@example.com',
        username: 'user@example.com',
        password: 'secret',
        initialSyncReceivedAfter: '2026-02-01T00:00:00.000Z',
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
      '/api/mail/messages?accountId=account-1&folderId=inbox&labelId=label-1&conversationId=thread-1&unread=true&offset=50&limit=25&withTotal=true',
    );
    await router.request(
      '/api/mail/accounts/account-1/conversations/thread-1/messages?cursor=25&limit=25',
    );

    expect(listFolders).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      'account-1',
    );
    expect(listMessages).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        accountIds: ['account-1'],
        folderIds: ['inbox'],
        labelIds: ['label-1'],
        conversationId: 'thread-1',
        query: undefined,
        cursor: undefined,
        offset: 50,
        withTotal: true,
        limit: 25,
        unread: true,
        starred: undefined,
      },
    );
    expect(listConversationMessages).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
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
      expect.objectContaining({ actorId: 'user-1' }),
      expect.objectContaining({
        inReplyToMessageId: 'message-1',
        scheduledAt: '2099-01-01T00:00:00.000Z',
      }),
    );
  });

  it.each(['send', 'draft'])(
    'preserves an editable forward body for %s',
    async (action) => {
      const sendMessage = vi.fn<MailService['sendMessage']>(async () => ({
        id: 'submission-1',
        accountId: 'account-1',
        status: 'pending',
      }));
      const saveDraft = vi.fn<MailService['saveDraft']>(async () =>
        messageView(),
      );
      const router = await createRouter(
        true,
        service({ sendMessage, saveDraft }),
      );
      const response = await router.request(
        action === 'send'
          ? '/api/mail/messages/send'
          : '/api/mail/messages/drafts',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId: 'account-1',
            identityId: 'identity-1',
            to: [{ address: 'recipient@example.com' }],
            subject: 'Fwd: Original',
            text: 'Edited original',
            forwardOfMessageId: 'message-1',
            forwardBodyIncluded: true,
            idempotencyKey: 'forward-1',
          }),
        },
      );
      expect(response.status).toBe(200);
      expect(action === 'send' ? sendMessage : saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'user-1' }),
        expect.objectContaining({
          forwardOfMessageId: 'message-1',
          forwardBodyIncluded: true,
          text: 'Edited original',
        }),
      );
    },
  );

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
      expect.objectContaining({ actorId: 'user-1' }),
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
        ns: '@nocobase/app-plugin-mail',
        key: 'errors.requestFailed',
        params: {},
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
      expect.objectContaining({ actorId: 'user-1' }),
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
      expect.objectContaining({ actorId: 'user-1' }),
      {
        accountId: 'account-1',
        messageId: 'message-1',
        addLabelIds: ['Label_1'],
        removeLabelIds: ['Label_2'],
      },
    );
    expect(moveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
      {
        accountId: 'account-1',
        messageId: 'message-1',
        providerFolderId: 'archive',
      },
    );
    expect(deleteMessage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
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
      expect.objectContaining({ actorId: 'user-1' }),
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
      expect.objectContaining({ actorId: 'user-1' }),
      expect.objectContaining({ attachmentIds: ['attachment-1'] }),
    );
  });

  it('rejects oversized JSON requests before parsing them', async () => {
    const sendMessage = vi.fn<MailService['sendMessage']>(async () =>
      messageView(),
    );
    const router = await createRouter(true, service({ sendMessage }));

    const response = await router.request('/api/mail/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(8 * 1024 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects excessive recipient arrays at the HTTP boundary', async () => {
    const sendBulk = vi.fn<MailService['sendBulk']>(async () => messageView());
    const router = await createRouter(true, service({ sendBulk }));

    const response = await router.request('/api/mail/messages/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: 'account-1',
        identityId: 'identity-1',
        recipients: Array.from({ length: 101 }, (_, index) => ({
          address: `recipient-${index}@example.com`,
        })),
        subject: 'Hello',
        text: 'Mail body',
        idempotencyKey: 'bulk-too-many-recipients',
      }),
    });

    expect(response.status).toBe(400);
    expect(sendBulk).not.toHaveBeenCalled();
  });
});

async function createRouter(
  authenticated: boolean,
  mail: MailService,
  allowed: boolean | ((resource: string) => boolean) = true,
  oauthCallbackUrl?: string,
  publicOrigin = 'https://mail.example.com',
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
        publicOrigin,
        oauthCallbackUrl,
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
    connectAccount: async () => ({
      id: 'account-1',
      userId: 'user-1',
      provider: { type: 'test', name: 'test' },
      address: 'user@example.com',
      scopes: [],
      status: 'active',
    }),
    completeAuthorization: async () => ({
      id: 'account-1',
      userId: 'user-1',
      provider: { type: 'test', name: 'test' },
      address: 'user@example.com',
      scopes: [],
      status: 'active',
    }),
    listAccounts: async () => [],
    updateAccount: async (_context, input) => ({
      id: input.accountId,
      userId: 'user-1',
      provider: { type: 'test', name: 'test' },
      address: 'user@example.com',
      scopes: [],
      status: input.status ?? 'active',
    }),
    removeAccount: async () => {},
    listManagedAccounts: async () => [],
    listManagedOperationLogs: async () => ({
      accounts: [],
      syncRuns: [],
      submissions: [],
    }),
    listManagedFolders: async () => [],
    listManagedMessages: async () => ({ items: [] }),
    manageMessages: async () => ({ items: [], succeeded: 0, failed: 0 }),
    listFolders: async () => [],
    listLabels: async () => [],
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
    updateLabel: async () => {
      throw new Error('Not implemented');
    },
    deleteLabel: async () => {},
    updateMessageLabels: async () => messageView(),
    getUnreadCount: async () => 0,
    startSync: async (_context, input) => syncRun(input.accountId, 'user-1'),
    getSyncRun: async () => undefined,
    listSyncRuns: async () => [],
    listSyncRunsPage: async () => ({ items: [], total: 0 }),
    listSubmissionsPage: async () => ({ items: [], total: 0 }),
    retrySyncRun: async () => syncRun('account-1', 'user-1'),
    cancelSyncRun: async () => ({
      ...syncRun('account-1', 'user-1'),
      status: 'cancelled',
    }),
    retrySubmission: async () => {
      throw new Error('Not implemented');
    },
    cancelSubmission: async () => {
      throw new Error('Not implemented');
    },
    listSubmissions: async () => [],
    listMessages: async () => ({ items: [] }),
    getManagedMessage: async () => undefined,
    getManagedAttachment: async () => ({
      fileName: 'attachment.bin',
      contentType: 'application/octet-stream',
      stream: streamOf(''),
    }),
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
    labelIds: [],
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

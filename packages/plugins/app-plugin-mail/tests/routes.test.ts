import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createConfigPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { mailApiRoutes } from '../server/routes/api.js';
import { mailServiceToken } from '../server/tokens.js';
import type { MailService, MailSyncRunView } from '../server/types.js';

describe('mail API routes', () => {
  it('owns an authentication boundary', async () => {
    const router = await createRouter(false, service());
    const response = await router.request('/mail/accounts');
    expect(response.status).toBe(401);
  });

  it('starts a bounded asynchronous sync for the authenticated user', async () => {
    const startSync = vi.fn<MailService['startSync']>(async (context, input) =>
      syncRun(input.accountId, context.actorId),
    );
    const router = await createRouter(true, service({ startSync }));
    const response = await router.request('/mail/accounts/account-1/sync', {
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

  it('rejects invalid send requests before calling the Mail service', async () => {
    const sendMessage = vi.fn<MailService['sendMessage']>();
    const router = await createRouter(true, service({ sendMessage }));
    const response = await router.request('/mail/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'account-1' }),
    });

    expect(response.status).toBe(400);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not expose internal service errors', async () => {
    const listAccounts = vi.fn<MailService['listAccounts']>(async () => {
      throw new Error('database password appeared in an internal error');
    });
    const router = await createRouter(true, service({ listAccounts }));

    const response = await router.request('/mail/accounts');
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

  it('does not silently discard unsupported attachments', async () => {
    const sendMessage = vi.fn<MailService['sendMessage']>(async () => {
      throw new TypeError('Attachments are not supported.');
    });
    const router = await createRouter(true, service({ sendMessage }));

    const response = await router.request('/mail/messages/send', {
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
  container.instance(mailServiceToken, mail);
  return mailApiRoutes.createRouter({
    appName: 'test',
    publicBasePath: '/test',
    config: { app: { name: 'test', publicBasePath: '/test' } },
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
}

function service(overrides: Partial<MailService> = {}): MailService {
  return {
    listAccounts: async () => [],
    listIdentities: async () => [],
    startSync: async (_context, input) => syncRun(input.accountId, 'user-1'),
    getSyncRun: async () => undefined,
    listMessages: async () => ({ items: [] }),
    getMessage: async () => undefined,
    sendMessage: async (_context, input) => ({
      id: input.idempotencyKey,
      accountId: input.accountId,
      status: 'accepted',
    }),
    ...overrides,
  };
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

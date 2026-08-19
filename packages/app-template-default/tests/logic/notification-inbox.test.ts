// @vitest-environment node

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  createSessionManager,
  createSessionMiddleware,
  type AppSessionConfig,
  type SessionEnv,
} from '@nocobase/session';

import { createMemoryNotificationStore } from '../../registry/notification/server/domain.ts';
import { createNotificationInboxRouter } from '../../registry/notification/server/inbox.ts';

describe('notification inbox routes', () => {
  it('enforces ownership and paginates equal timestamps with a stable cursor', async () => {
    const fixture = await createFixture();
    expect((await fixture.app.request('http://localhost/inbox')).status).toBe(401);

    const first = await fixture.app.request('http://localhost/inbox?limit=1', {
      headers: { cookie: fixture.userOneCookie },
    });
    const firstBody = (await first.json()) as {
      data: readonly { id: string; title: string }[];
      nextCursor: string;
    };
    expect(firstBody.data).toHaveLength(1);
    expect(firstBody.data[0]?.title).toBe('Inbox item');

    const second = await fixture.app.request(
      `http://localhost/inbox?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      { headers: { cookie: fixture.userOneCookie } },
    );
    const secondBody = (await second.json()) as { data: readonly { id: string }[] };
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.data[0]?.id).not.toBe(firstBody.data[0]?.id);

    const otherUser = await fixture.app.request('http://localhost/inbox', {
      headers: { cookie: fixture.userTwoCookie },
    });
    await expect(otherUser.json()).resolves.toMatchObject({ data: [] });
    await fixture.dispose();
  });

  it('requires CSRF, applies CAS mutations, and marks only the principal inbox read', async () => {
    const fixture = await createFixture();
    const list = await fixture.app.request('http://localhost/inbox', {
      headers: { cookie: fixture.userOneCookie },
    });
    const listBody = (await list.json()) as { data: readonly { id: string; version: number }[] };
    const item = listBody.data[0]!;

    const rejected = await fixture.app.request(`http://localhost/inbox/${item.id}`, {
      method: 'POST',
      headers: { cookie: fixture.userOneCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', expectedVersion: item.version }),
    });
    expect(rejected.status).toBe(403);

    const csrf = await fixture.app.request('http://localhost/inbox/csrf', {
      headers: { cookie: fixture.userOneCookie },
    });
    const csrfBody = (await csrf.json()) as { token: string };
    const headers = {
      cookie: `${fixture.userOneCookie}; ${firstCookie(csrf)}`,
      origin: 'http://localhost',
      'x-csrf-token': csrfBody.token,
      'content-type': 'application/json',
    };
    const updated = await fixture.app.request(`http://localhost/inbox/${item.id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'read', expectedVersion: item.version }),
    });
    expect(updated.status).toBe(200);
    const stale = await fixture.app.request(`http://localhost/inbox/${item.id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'unread', expectedVersion: item.version }),
    });
    expect(stale.status).toBe(409);

    const readAll = await fixture.app.request('http://localhost/inbox/read-all', {
      method: 'POST',
      headers,
      body: '{}',
    });
    await expect(readAll.json()).resolves.toMatchObject({ updated: 1 });
    const count = await fixture.app.request('http://localhost/inbox/unread-count', {
      headers: { cookie: fixture.userOneCookie },
    });
    await expect(count.json()).resolves.toEqual({ count: 0 });
    await fixture.dispose();
  });
});

interface InboxFixture {
  readonly app: Hono<SessionEnv>;
  readonly userOneCookie: string;
  readonly userTwoCookie: string;
  dispose(): Promise<void>;
}

async function createFixture(): Promise<InboxFixture> {
  const store = createMemoryNotificationStore();
  const timestamp = '2026-08-19T01:00:00.000Z';
  await store.createNotificationBundle({
    notification: {
      id: 'notification-1',
      sourceType: 'tests.inbox',
      principalService: 'tests',
      triggeredAt: timestamp,
      messageMode: 'direct',
      summaryStatus: 'succeeded',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    deliveries: ['delivery-1', 'delivery-2'].map((id) => ({
      id,
      notificationId: 'notification-1',
      channel: 'in-app' as const,
      recipientKey: 'user:u1',
      recipientSnapshot: { kind: 'user', userId: 'u1' },
      recipientSchemaVersion: 1,
      contentSnapshot: { title: 'Inbox item', body: `Body ${id}`, actionUrl: '/records/1' },
      contentSchemaVersion: 1,
      providerChainSnapshot: ['in-app-db'],
      providerChainSchemaVersion: 1,
      providerCursor: 0,
      currentAttempt: 1,
      status: 'delivered' as const,
      statusChangedAt: timestamp,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    userNotificationItems: ['1', '2'].map((suffix) => ({
      id: `item-${suffix}`,
      deliveryId: `delivery-${suffix}`,
      notificationId: 'notification-1',
      userId: 'u1',
      channel: 'in-app' as const,
      availableAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    })),
  });

  const manager = createSessionManager(testSessionConfig());
  const app = new Hono<SessionEnv>();
  app.use('*', createSessionMiddleware(manager));
  app.get('/login/:userId', async (context) => {
    await context.var.session.update({ userId: context.req.param('userId') });
    return context.json({ ok: true });
  });
  app.route('/inbox', createNotificationInboxRouter({ store }));
  const userOneCookie = firstCookie(await app.request('http://localhost/login/u1'));
  const userTwoCookie = firstCookie(await app.request('http://localhost/login/u2'));
  return { app, userOneCookie, userTwoCookie, dispose: () => manager.dispose() };
}

function firstCookie(response: Response): string {
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

function testSessionConfig(): AppSessionConfig {
  return {
    enabled: true,
    default: 'memory',
    stores: { memory: { driver: 'memory' } },
    cookie: { name: 'test_session' },
    lifetime: { absolute: '1h' },
    secret: 'notification-inbox-test-secret-not-for-production',
    gcLottery: [0, 1],
  };
}

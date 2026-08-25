import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createServer,
  type AppDisposer,
  type AppScope,
} from '../src/server/embedded.js';

interface OrdersApiResponse {
  data: {
    customers: Array<{ id: string }>;
    orders: Array<{
      id: string;
      createdAt: string;
      customerId: string;
      paymentStatus: string;
      status: string;
      totalAmount: number;
    }>;
    products: Array<{ id: string; price: number }>;
    [key: string]: unknown;
  };
}

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dispose) => dispose()));
});

describe('orders app', () => {
  it('initializes a protected SQLite runtime and a working admin account', async () => {
    const { app, dataDir } = await createTestApp();
    expect((await app.request('http://orders.test/api/bootstrap')).status).toBe(
      401,
    );
    const cookie = await signIn(app);
    const bootstrap = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    expect(bootstrap.data.orders).toHaveLength(8);
    expect(
      Number.isNaN(new Date(bootstrap.data.orders[0].createdAt).getTime()),
    ).toBe(false);
    expect((await stat(path.join(dataDir, 'orders.sqlite'))).isFile()).toBe(
      true,
    );
  });

  it('persists order creation and applies server-side totals', async () => {
    const { app } = await createTestApp();
    const cookie = await signIn(app);
    const bootstrap = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    const customerId = bootstrap.data.customers[0].id;
    const product = bootstrap.data.products[0];
    const created = await requestJson(
      app,
      '/api/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          lines: [{ productId: product.id, quantity: 2 }],
          notes: 'test order',
        }),
      },
      cookie,
    );
    expect(created.data).toMatchObject({
      customerId,
      status: 'draft',
      paymentStatus: 'unpaid',
      totalAmount: product.price * 2,
    });
    const refreshed = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    expect(refreshed.data.orders[0].id).toBe(created.data.id);
  });

  it('enforces order transitions on the server', async () => {
    const { app } = await createTestApp();
    const cookie = await signIn(app);
    const bootstrap = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    const order = bootstrap.data.orders.find(
      (item: { status: string }) => item.status === 'draft',
    );
    const blocked = await app.request(
      request(
        `/api/orders/${order.id}/transition`,
        { method: 'POST', body: JSON.stringify({ status: 'completed' }) },
        cookie,
      ),
    );
    expect(blocked.status).toBe(409);
    const submitted = await requestJson(
      app,
      `/api/orders/${order.id}/transition`,
      { method: 'POST', body: JSON.stringify({ status: 'pending' }) },
      cookie,
    );
    expect(submitted.data.status).toBe('pending');
  });

  it('manages App members and enforces the saved role on business APIs', async () => {
    const { app } = await createTestApp();
    const adminCookie = await signIn(app);
    const roles = await requestJson(
      app,
      '/api/settings/roles',
      undefined,
      adminCookie,
    );
    expect(
      (roles.data as unknown as Array<{ key: string }>).map((role) => role.key),
    ).toEqual(['orders-admin', 'orders-operator', 'orders-viewer']);

    const members = await requestJson(
      app,
      '/api/settings/members',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '订单访客',
          username: 'orders.viewer',
          email: 'orders.viewer@example.com',
          password: 'viewer123',
          roleKey: 'orders-viewer',
        }),
      },
      adminCookie,
    );
    expect(members.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: 'orders.viewer',
          roleKey: 'orders-viewer',
        }),
      ]),
    );

    const viewerCookie = await signInAs(app, 'orders.viewer', 'viewer123');
    expect(
      (await app.request(request('/api/bootstrap', {}, viewerCookie))).status,
    ).toBe(200);
    const denied = await app.request(
      request(
        '/api/orders',
        { method: 'POST', body: JSON.stringify({}) },
        viewerCookie,
      ),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      code: 'ORDERS_PERMISSION_DENIED',
    });
  });

  it('keeps migration and seed initialization idempotent', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orders-app-'));
    const firstScope = createScope(dataDir);
    const first = await createServer(firstScope.scope);
    const before = await requestJson(
      first,
      '/api/bootstrap',
      undefined,
      await signIn(first),
    );
    await firstScope.dispose();
    const secondScope = createScope(dataDir);
    const second = await createServer(secondScope.scope);
    const after = await requestJson(
      second,
      '/api/bootstrap',
      undefined,
      await signIn(second),
    );
    expect(after.data.orders).toEqual(before.data.orders);
    expect(after.data.customers).toEqual(before.data.customers);
    cleanup.push(async () => {
      await secondScope.dispose();
      await rm(dataDir, { recursive: true, force: true });
    });
  });
});

async function createTestApp(): Promise<{
  app: Awaited<ReturnType<typeof createServer>>;
  dataDir: string;
}> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orders-app-'));
  const managed = createScope(dataDir);
  const app = await createServer(managed.scope);
  cleanup.push(async () => {
    await managed.dispose();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { app, dataDir };
}

function createScope(dataDir: string): {
  scope: AppScope;
  dispose: () => Promise<void>;
} {
  const disposers: AppDisposer[] = [];
  return {
    scope: {
      id: 'orders',
      appName: 'orders',
      displayName: '订单运营中心',
      releaseId: 'test-release',
      basePath: '/orders',
      dataDir,
      registerDisposer: (_name, disposer) => disposers.push(disposer),
    },
    dispose: async () => {
      await Promise.all(disposers.splice(0).map((dispose) => dispose()));
    },
  };
}

function request(
  pathname: string,
  init: RequestInit = {},
  cookie?: string,
): Request {
  return new Request(`http://orders.test${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      origin: 'http://orders.test',
    },
  });
}

async function signIn(app: {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}): Promise<string> {
  return signInAs(app, 'nocobase', 'admin123');
}

async function signInAs(
  app: {
    request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  },
  username: string,
  password: string,
): Promise<string> {
  const response = await app.request(
    request('/api/auth/sign-in/username', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function requestJson(
  app: {
    request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  },
  pathname: string,
  init?: RequestInit,
  cookie?: string,
) {
  const response = await app.request(request(pathname, init, cookie));
  expect(response.status).toBeLessThan(400);
  return response.json() as Promise<OrdersApiResponse>;
}

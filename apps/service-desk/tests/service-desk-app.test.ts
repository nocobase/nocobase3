import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createServer,
  type AppDisposer,
  type AppScope,
} from '../src/server/embedded.js';

interface BootstrapResponse {
  data: {
    customers: Array<{ id: string }>;
    services: Array<{ id: string }>;
    agents: Array<{ id: string }>;
    tickets: Array<{
      id: string;
      status: string;
      assigneeId: string | null;
      customerId: string;
      serviceId: string;
      slaDueAt: string;
      createdAt: string;
    }>;
  };
}

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dispose) => dispose()));
});

describe('service desk app', () => {
  it('initializes a protected SQLite runtime and admin account', async () => {
    const { app, dataDir } = await createTestApp();
    expect((await app.request(request('/api/bootstrap'))).status).toBe(401);
    const cookie = await signIn(app);
    const bootstrap = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    expect(bootstrap.data.tickets).toHaveLength(6);
    expect(
      Number.isNaN(new Date(bootstrap.data.tickets[0].createdAt).getTime()),
    ).toBe(false);
    expect(
      (await stat(path.join(dataDir, 'service-desk.sqlite'))).isFile(),
    ).toBe(true);
  });

  it('persists ticket creation and calculates SLA on the server', async () => {
    const { app } = await createTestApp();
    const cookie = await signIn(app);
    const bootstrap = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    const created = await requestJson(
      app,
      '/api/tickets',
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Agent runtime is unavailable',
          description: 'production runtime stopped responding',
          customerId: bootstrap.data.customers[0].id,
          serviceId: bootstrap.data.services[0].id,
          priority: 'urgent',
        }),
      },
      cookie,
    );
    expect(created.data).toMatchObject({
      status: 'new',
      priority: 'urgent',
      customerId: bootstrap.data.customers[0].id,
      serviceId: bootstrap.data.services[0].id,
    });
    expect(new Date(created.data.slaDueAt).getTime()).toBeGreaterThan(
      new Date(created.data.createdAt).getTime(),
    );
  });

  it('enforces assignment and ticket transitions on the server', async () => {
    const { app } = await createTestApp();
    const cookie = await signIn(app);
    const bootstrap = await requestJson(
      app,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    const ticket = bootstrap.data.tickets.find((item) => item.status === 'new');
    if (!ticket) throw new Error('Seed must include a new ticket.');
    const blocked = await app.request(
      request(
        `/api/tickets/${ticket.id}/transition`,
        {
          method: 'POST',
          body: JSON.stringify({ status: 'assigned' }),
        },
        cookie,
      ),
    );
    expect(blocked.status).toBe(409);
    const assigned = await requestJson(
      app,
      `/api/tickets/${ticket.id}/assign`,
      {
        method: 'POST',
        body: JSON.stringify({ agentId: bootstrap.data.agents[0].id }),
      },
      cookie,
    );
    expect(assigned.data.status).toBe('assigned');
    expect(assigned.data.assigneeId).toBe(bootstrap.data.agents[0].id);
    const started = await requestJson(
      app,
      `/api/tickets/${ticket.id}/transition`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'in_progress' }),
      },
      cookie,
    );
    expect(started.data.status).toBe('in_progress');
  });

  it('keeps service-desk roles local and enforces them on business APIs', async () => {
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
    ).toEqual([
      'service-desk-admin',
      'service-desk-lead',
      'service-desk-agent',
    ]);

    const members = await requestJson(
      app,
      '/api/settings/members',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '客服成员',
          username: 'desk.agent',
          email: 'desk.agent@example.com',
          password: 'agent123',
          roleKey: 'service-desk-agent',
        }),
      },
      adminCookie,
    );
    expect(members.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: 'desk.agent',
          roleKey: 'service-desk-agent',
        }),
      ]),
    );

    const agentCookie = await signInAs(app, 'desk.agent', 'agent123');
    expect(
      (await app.request(request('/api/bootstrap', {}, agentCookie))).status,
    ).toBe(200);
    const denied = await app.request(
      request(
        '/api/customers',
        { method: 'POST', body: JSON.stringify({}) },
        agentCookie,
      ),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      code: 'SERVICE_DESK_PERMISSION_DENIED',
    });
  });

  it('keeps migration and seed initialization idempotent', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'service-desk-app-'));
    const first = await createServer(scope(dataDir));
    const cookie = await signIn(first);
    const before = await requestJson(
      first,
      '/api/bootstrap',
      undefined,
      cookie,
    );
    const second = await createServer(scope(dataDir));
    const secondCookie = await signIn(second);
    const after = await requestJson(
      second,
      '/api/bootstrap',
      undefined,
      secondCookie,
    );
    expect(after.data.tickets).toEqual(before.data.tickets);
    expect(after.data.customers).toEqual(before.data.customers);
    cleanup.push(async () => {
      await rm(dataDir, { recursive: true, force: true });
    });
  });
});

async function createTestApp(): Promise<{
  app: Awaited<ReturnType<typeof createServer>>;
  dataDir: string;
}> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'service-desk-app-'));
  const app = await createServer(scope(dataDir));
  cleanup.push(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });
  return { app, dataDir };
}

function scope(dataDir: string): AppScope {
  const disposers: AppDisposer[] = [];
  return {
    id: 'service-desk',
    appName: 'service-desk',
    displayName: '客户服务中心',
    releaseId: 'test-release',
    basePath: '/service-desk',
    dataDir,
    registerDisposer: (_name, dispose) => disposers.push(dispose),
  };
}

function request(
  pathname: string,
  init: RequestInit = {},
  cookie?: string,
): Request {
  return new Request(`http://service-desk.test${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      origin: 'http://service-desk.test',
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
): Promise<{
  data: BootstrapResponse['data'] &
    Record<string, Record<string, unknown> | unknown>;
}> {
  const response = await app.request(request(pathname, init, cookie));
  expect(response.status).toBeLessThan(400);
  return response.json() as Promise<{
    data: BootstrapResponse['data'] &
      Record<string, Record<string, unknown> | unknown>;
  }>;
}

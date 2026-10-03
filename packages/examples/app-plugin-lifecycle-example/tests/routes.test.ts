import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAppPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { LifecycleRuntime, MemoryLifecycleStore } from '@nocobase/lifecycle';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { expenseLifecycle } from '../server/lifecycles/expense.js';
import { createExampleServices } from '../server/lifecycles/services.js';
import { apiRoutes } from '../server/routes/index.js';
import {
  lifecycleExampleServiceToken,
  type LifecycleExampleService,
} from '../server/tokens.js';

const allow = {
  required: () => async (context, next) => {
    context.set('auth', { user: { id: 'user-1' } });
    await next();
  },
} as unknown as Auth;
const deny = {
  required: () => (context) => context.json({ code: 'UNAUTHORIZED' }, 401),
} as unknown as Auth;

function application(authentication: Auth) {
  // A real runtime on a memory store: the record routes are the library's,
  // so they are tested against a lifecycle, not a mock.
  const store = new MemoryLifecycleStore();
  const runtime = new LifecycleRuntime({ store });
  runtime.register(expenseLifecycle, {
    services: createExampleServices({ info: () => undefined }),
  });
  store.insertRecord('lifecycleExampleExpenses', {
    id: 1,
    title: '上海出差',
    items: [],
    amountCents: 800_000,
    applicantId: 'lin',
    approverId: 'chen',
    paymentRef: null,
    failPayments: 0,
    status: 'awaitingManager',
    statusChangedAt: '2026-10-01T09:00:00.000Z',
    lifecycleVersion: 2,
  });
  const service = {
    runtime,
    createExpense: vi.fn(async (values: object) => ({ id: 1, ...values })),
    listTickets: vi.fn(async () => []),
    parameters: vi.fn(() => ({ waitMinutes: 2, reopenDays: 7 })),
  };
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  container.instance(
    lifecycleExampleServiceToken,
    service as unknown as LifecycleExampleService,
  );
  const app: AppPluginApplication = {
    appName: 'main',
    publicBasePath: '',
    config: {} as never,
    paths: createAppPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  };
  return { app, service };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('lifecycle example routes', () => {
  it('requires a signed-in user', async () => {
    const router = await apiRoutes.createRouter(application(deny).app);
    expect((await router.request('/lifecycle-example/tickets')).status).toBe(
      401,
    );
  });

  it('lists records with the parameters the page quotes', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const response = await router.request(
      '/lifecycle-example/tickets?actAs=agent-zhou',
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      records: [],
      parameters: { waitMinutes: 2, reopenDays: 7 },
    });
    expect(service.listTickets).toHaveBeenCalledWith('agent-zhou');
  });

  it('fires a transition as one of the lifecycle personas through the record routes', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const response = await router.request(
      post('/lifecycle-example/lifecycles/expenses/1/fire?actAs=chen', {
        transition: 'requestInfo',
        input: { reason: '请补充行程单' },
        requestId: 'click-1',
        expectVersion: 2,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: 'needsInfo',
      version: 3,
      replayed: false,
    });
    // The request key travels with the click, so a retried request fires once.
    const again = await router.request(
      post('/lifecycle-example/lifecycles/expenses/1/fire?actAs=chen', {
        transition: 'requestInfo',
        input: { reason: '请补充行程单' },
        requestId: 'click-1',
      }),
    );
    await expect(again.json()).resolves.toMatchObject({ replayed: true });
    const history = await service.runtime.history('expenses', 1);
    expect(history.transitions.map((entry) => entry.actorId)).toEqual(['chen']);
  });

  it('rejects a persona the lifecycle does not define', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const response = await router.request(
      post('/lifecycle-example/lifecycles/expenses/1/fire?actAs=mallory', {
        transition: 'approve',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('answers a refused transition with its reasons and status', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const denied = await router.request(
      post('/lifecycle-example/lifecycles/expenses/1/fire?actAs=sun', {
        transition: 'approve',
      }),
    );
    expect(denied.status).toBe(403);
    // The page shows why, not only that it was refused.
    await expect(denied.json()).resolves.toMatchObject({
      code: 'GUARD_REJECTED',
      message: 'Only the current approver can decide on this report.',
      blockers: [
        {
          source: 'guard',
          code: 'approverOnly',
          message: 'Only the current approver can decide on this report.',
        },
      ],
    });
    const stale = await router.request(
      post('/lifecycle-example/lifecycles/expenses/1/fire?actAs=chen', {
        transition: 'approve',
        expectVersion: 1,
      }),
    );
    expect(stale.status).toBe(409);
    const view = await router.request(
      '/lifecycle-example/lifecycles/expenses/1?actAs=lin',
    );
    await expect(view.json()).resolves.toMatchObject({
      state: 'awaitingManager',
      available: expect.arrayContaining([
        expect.objectContaining({ name: 'withdraw', allowed: true }),
        expect.objectContaining({ name: 'approve', allowed: false }),
      ]),
    });
  });

  it('validates a new expense before creating it', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const bad = await router.request(
      post('/lifecycle-example/expenses', {
        title: '打车',
        actAs: 'lin',
        failPayments: -1,
      }),
    );
    const good = await router.request(
      post('/lifecycle-example/expenses', {
        title: '打车',
        actAs: 'lin',
        items: [
          {
            date: '2026-09-28',
            category: 'transport',
            description: '打车',
            amountCents: 12_000,
          },
        ],
      }),
    );
    expect(bad.status).toBe(400);
    expect(good.status).toBe(201);
    expect(service.createExpense).toHaveBeenCalledWith(
      {
        title: '打车',
        purpose: '',
        items: [
          {
            date: '2026-09-28',
            category: 'transport',
            description: '打车',
            amountCents: 12_000,
          },
        ],
        failPayments: 0,
      },
      'lin',
    );
  });
});

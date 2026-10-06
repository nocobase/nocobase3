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
import {
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
  generateApiDocument,
} from '@nocobase/app-server/router';

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
    createExpense: vi.fn(async (values: object) => ({ id: 2, ...values })),
    listTickets: vi.fn(async () => ({ records: [], total: 0 })),
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
    expect((await router.request('/lifecycleExample/tickets')).status).toBe(
      401,
    );
  });

  it('lists a page of records with the parameters the page quotes', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const response = await router.request(
      '/lifecycleExample/tickets?actAs=agent-zhou',
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0,
        parameters: { waitMinutes: 2, reopenDays: 7 },
      },
    });
    expect(service.listTickets).toHaveBeenCalledWith('agent-zhou', {
      page: 1,
      pageSize: 20,
    });
    const tooMany = await router.request(
      '/lifecycleExample/tickets?actAs=agent-zhou&pageSize=500',
    );
    expect(tooMany.status).toBe(400);
  });

  it('fires a transition as one of the lifecycle personas through the record routes', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const response = await router.request(
      post('/lifecycleExample/expenses/1/fire?actAs=chen', {
        transition: 'requestInfo',
        input: { reason: '请补充行程单' },
        requestId: 'click-1',
        expectVersion: 2,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        record: { id: '1' },
        state: 'needsInfo',
        version: 3,
        replayed: false,
      },
    });
    // The request key travels with the click, so a retried request fires once.
    const again = await router.request(
      post('/lifecycleExample/expenses/1/fire?actAs=chen', {
        transition: 'requestInfo',
        input: { reason: '请补充行程单' },
        requestId: 'click-1',
      }),
    );
    await expect(again.json()).resolves.toMatchObject({
      data: { replayed: true },
    });
    const history = await service.runtime.history('expenses', 1);
    expect(history.transitions.map((entry) => entry.actorId)).toEqual(['chen']);
  });

  it('rejects a persona the example does not define', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const response = await router.request(
      post('/lifecycleExample/expenses/1/fire?actAs=mallory', {
        transition: 'approve',
        requestId: 'click-1',
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        reason: 'INVALID_INPUT',
        fieldViolations: [expect.objectContaining({ field: 'actAs' })],
      },
    });
  });

  it('answers a refused transition in the standard body, with its reasons', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const denied = await router.request(
      post('/lifecycleExample/expenses/1/fire?actAs=sun', {
        transition: 'approve',
        requestId: 'click-1',
      }),
    );
    expect(denied.status).toBe(403);
    // The page shows why, not only that it was refused.
    await expect(denied.json()).resolves.toMatchObject({
      error: {
        status: 'PERMISSION_DENIED',
        reason: 'GUARD_REJECTED',
        domain: 'lifecycleExample',
        metadata: {
          blockers: [
            {
              source: 'guard',
              code: 'approverOnly',
              message: 'Only the current approver can decide on this report.',
            },
          ],
        },
      },
    });
    const stale = await router.request(
      post('/lifecycleExample/expenses/1/fire?actAs=chen', {
        transition: 'approve',
        requestId: 'click-2',
        expectVersion: 1,
      }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { status: 'ABORTED', reason: 'CONFLICT' },
    });
    const invalid = await router.request(
      post('/lifecycleExample/expenses/1/fire?actAs=chen', {
        transition: 'requestInfo',
        requestId: 'click-3',
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: {
        reason: 'INVALID_INPUT',
        fieldViolations: [{ field: 'input.reason' }],
      },
    });
    const view = await router.request('/lifecycleExample/expenses/1?actAs=lin');
    await expect(view.json()).resolves.toMatchObject({
      data: {
        state: 'awaitingManager',
        available: expect.arrayContaining([
          expect.objectContaining({ name: 'withdraw', allowed: true }),
          expect.objectContaining({ name: 'approve', allowed: false }),
        ]),
      },
    });
    const missing = await router.request(
      '/lifecycleExample/expenses/99?actAs=lin',
    );
    expect(missing.status).toBe(404);
  });

  it('describes a lifecycle, and refuses an effect run of another record', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const described = await router.request(
      '/lifecycleExample/expenses/lifecycle?actAs=lin',
    );
    await expect(described.json()).resolves.toMatchObject({
      data: {
        description: { name: 'expenses' },
        diagram: expect.stringContaining('stateDiagram-v2'),
      },
    });
    const retried = await router.request(
      post('/lifecycleExample/expenses/1/effectRuns/7/retry?actAs=lin', {}),
    );
    expect(retried.status).toBe(404);
    await expect(retried.json()).resolves.toMatchObject({
      error: { reason: 'EFFECT_RUN_NOT_FOUND' },
    });
  });

  it('validates a new expense before creating it', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const bad = await router.request(
      post('/lifecycleExample/expenses?actAs=lin', {
        title: '打车',
        items: [],
        failPayments: -1,
      }),
    );
    // A strict body: a field the route does not take is refused, not ignored.
    const unknown = await router.request(
      post('/lifecycleExample/expenses?actAs=lin', {
        title: '打车',
        items: [],
        actAs: 'lin',
      }),
    );
    const good = await router.request(
      post('/lifecycleExample/expenses?actAs=lin', {
        title: '打车',
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
    expect(unknown.status).toBe(400);
    expect(good.status).toBe(201);
    await expect(good.json()).resolves.toMatchObject({
      data: { id: '2', title: '打车' },
    });
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

  it('declares every route in the API document', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    expect(findUndeclaredApiRoutes(router)).toEqual([]);
    const document = await generateApiDocument(router, {
      info: { title: 'Lifecycle example', version: '0.0.0' },
    });
    expect(findApiDocumentSchemaProblems(document)).toEqual([]);
    const operations = Object.values(document.paths ?? {}).flatMap((item) =>
      Object.values(item ?? {}),
    ) as { operationId?: string; tags?: string[] }[];
    expect(operations.map(({ operationId }) => operationId).sort()).toEqual([
      'lifecycleExampleCancelExpenseEffectRun',
      'lifecycleExampleCancelTicketEffectRun',
      'lifecycleExampleCreateExpense',
      'lifecycleExampleCreateTicket',
      'lifecycleExampleDescribeExpenseLifecycle',
      'lifecycleExampleDescribeTicketLifecycle',
      'lifecycleExampleFireExpenseTransition',
      'lifecycleExampleFireTicketTransition',
      'lifecycleExampleGetExpense',
      'lifecycleExampleGetTicket',
      'lifecycleExampleListExpenses',
      'lifecycleExampleListTickets',
      'lifecycleExampleRetryExpenseEffectRun',
      'lifecycleExampleRetryTicketEffectRun',
      'lifecycleExampleRunTriggers',
      'lifecycleExampleUpdateExpense',
    ]);
    expect(new Set(operations.flatMap(({ tags }) => tags ?? []))).toEqual(
      new Set(['LifecycleExample']),
    );
  });
});

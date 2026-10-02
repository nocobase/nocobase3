import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAppPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { LifecycleError } from '@nocobase/lifecycle';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

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
  const detail = {
    record: { id: 1 },
    available: [],
    history: { transitions: [], effectRuns: [] },
  };
  const service = {
    fire: vi.fn(async () => detail),
    createExpense: vi.fn(async (values: object) => ({ id: 1, ...values })),
    listTickets: vi.fn(async () => []),
    detail: vi.fn(async () => detail),
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

  it('fires a transition as one of the lifecycle personas', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const response = await router.request(
      post('/lifecycle-example/expenses/1/fire', {
        transition: 'approve',
        actAs: 'chen',
        input: { comment: 'OK' },
      }),
    );
    expect(response.status).toBe(200);
    expect(service.fire).toHaveBeenCalledWith(
      'expenses',
      '1',
      'approve',
      { comment: 'OK' },
      'chen',
    );
  });

  it('rejects a persona the lifecycle does not define', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const response = await router.request(
      post('/lifecycle-example/expenses/1/fire', {
        transition: 'approve',
        actAs: 'mallory',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('maps a refused transition to an HTTP status', async () => {
    const { app, service } = application(allow);
    const blocker = {
      source: 'guard' as const,
      code: 'GUARD_REJECTED',
      message: '只有当前审批人可以处理',
    };
    service.fire.mockRejectedValueOnce(
      new LifecycleError('GUARD_REJECTED', blocker.message, {
        blockers: [blocker],
      }),
    );
    service.fire.mockRejectedValueOnce(
      new LifecycleError('INVALID_STATE', 'no'),
    );
    const router = await apiRoutes.createRouter(app);
    const body = { transition: 'approve', actAs: 'chen' };
    const denied = await router.request(
      post('/lifecycle-example/expenses/1/fire', body),
    );
    const conflict = await router.request(
      post('/lifecycle-example/expenses/1/fire', body),
    );
    expect(denied.status).toBe(403);
    // The page shows why, not only that it was refused.
    await expect(denied.json()).resolves.toMatchObject({
      code: 'GUARD_REJECTED',
      message: '只有当前审批人可以处理',
      blockers: [blocker],
    });
    expect(conflict.status).toBe(409);
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

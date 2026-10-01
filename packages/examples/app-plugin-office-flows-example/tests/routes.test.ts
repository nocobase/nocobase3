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
  OfficeFlowsError,
  type OfficeFlowsService,
} from '../server/services/office-flows.js';
import { officeFlowsServiceToken } from '../server/tokens.js';

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
  const service = {
    fireIncoming: vi.fn(async () => undefined),
    fireTask: vi.fn(async () => undefined),
    addRow: vi.fn(async () => 1),
  };
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  container.instance(
    officeFlowsServiceToken,
    service as unknown as OfficeFlowsService,
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

describe('office flows routes', () => {
  it('requires a signed-in user', async () => {
    const router = await apiRoutes.createRouter(application(deny).app);
    expect((await router.request('/office-flows/config')).status).toBe(401);
  });

  it('fires a transition as one of the example people', async () => {
    const { app, service } = application(allow);
    const router = await apiRoutes.createRouter(app);
    const response = await router.request(
      post('/office-flows/incoming/7/fire', {
        transition: 'dispatchClerks',
        actAs: 'zhoujie',
      }),
    );
    expect(response.status).toBe(204);
    expect(service.fireIncoming).toHaveBeenCalledWith(
      '7',
      'dispatchClerks',
      {},
      'zhoujie',
    );
  });

  it('rejects someone outside the cast', async () => {
    const router = await apiRoutes.createRouter(application(allow).app);
    const response = await router.request(
      post('/office-flows/incoming/7/fire', {
        transition: 'close',
        actAs: 'mallory',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('maps refusals to HTTP statuses', async () => {
    const { app, service } = application(allow);
    service.fireTask.mockRejectedValueOnce(
      new LifecycleError('GUARD_REJECTED', 'no'),
    );
    service.addRow.mockRejectedValueOnce(
      new OfficeFlowsError('FORBIDDEN', 'no'),
    );
    const router = await apiRoutes.createRouter(app);
    const fired = await router.request(
      post('/office-flows/tasks/clerk/3/fire', {
        transition: 'sign',
        actAs: 'gaoyan',
      }),
    );
    const added = await router.request(
      post('/office-flows/tasks/clerk/3/rows', {
        departmentName: '工会',
        actAs: 'gaoyan',
      }),
    );
    const unknownKind = await router.request(
      post('/office-flows/tasks/nobody/3/fire', {
        transition: 'sign',
        actAs: 'gaoyan',
      }),
    );
    expect(fired.status).toBe(403);
    expect(added.status).toBe(403);
    expect(unknownKind.status).toBe(404);
  });
});

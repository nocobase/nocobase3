import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '../server/tokens.js';

describe('@nocobase/app-plugin-scheduler', () => {
  it('denies anonymous requests through its own authentication middleware', async () => {
    const { router } = await createRouter({
      authenticated: false,
      allowed: true,
    });
    const response = await router.request('/schedules');
    expect(response.status).toBe(401);
  });

  it('denies authenticated callers without Schedule page access', async () => {
    const { router, can } = await createRouter({
      authenticated: true,
      allowed: false,
    });
    const response = await router.request('/schedules');
    expect(response.status).toBe(403);
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    });
  });

  it('returns only controlled list and occurrence projections to authorized callers', async () => {
    const { router } = await createRouter({
      authenticated: true,
      allowed: true,
    });
    const list = await router.request('/schedules');
    const occurrences = await router.request(
      '/schedules/schedule-1/occurrences',
    );
    expect(list.status).toBe(200);
    expect(occurrences.status).toBe(200);
    expect(await list.json()).toEqual({
      data: [
        expect.objectContaining({ id: 'schedule-1', targetType: 'workflow' }),
      ],
    });
    expect(await occurrences.json()).toEqual({
      data: [
        expect.objectContaining({
          id: 'occurrence-1',
          targetReceipt: { eventKey: 'controlled' },
        }),
      ],
    });
    expect(
      JSON.stringify(await (await router.request('/schedules')).json()),
    ).not.toContain('secret-input');
  });
});

async function createRouter(options: {
  authenticated: boolean;
  allowed: boolean;
}) {
  const container = new ServiceContainer();
  const can = vi.fn(async () => options.allowed);
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (!options.authenticated)
        return context.json({ error: 'Authentication required.' }, 401);
      await next();
    },
  } as unknown as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', { can });
      await next();
    },
  } as unknown as AppAuthorization);
  container.instance(schedulerServiceToken, {
    list: async () => [
      {
        id: 'schedule-1',
        appName: 'test',
        owner: 'owner',
        key: 'key',
        title: 'Schedule',
        cron: '* * * * *',
        timezone: 'UTC',
        enabled: true,
        targetType: 'workflow',
        lifecycleState: 'active',
        definitionHash: 'hash',
        runCount: 1,
        scheduleStatus: 'active',
        targetSummary: { targetLabel: 'Workflow', state: 'ready' },
      },
    ],
    listOccurrences: async () => [
      {
        id: 'occurrence-1',
        scheduleId: 'schedule-1',
        scheduledFor: '2026-09-02T00:00:00.000Z',
        runNumber: 1,
        status: 'triggered',
        executionCount: 1,
        startedAt: '2026-09-02T00:00:01.000Z',
        targetReceipt: { eventKey: 'controlled' },
      },
    ],
    sync: async () => {},
  } satisfies SchedulerService);
  const router = await apiRoutes.createRouter({
    appName: 'test',
    publicBasePath: '',
    paths: {} as never,
    config: { app: { name: 'test', publicBasePath: '' } },
    router: new Hono(),
    container,
  } as AppPluginApplication);
  return { router, can };
}

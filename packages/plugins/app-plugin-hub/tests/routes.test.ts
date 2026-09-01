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
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import { hubServiceToken, type HubService } from '../server/tokens.js';

describe('@nocobase/app-plugin-hub API routes', () => {
  it('rejects anonymous requests', async () => {
    const listApps = vi.fn<HubService['listApps']>();
    const router = await apiRoutes.createRouter(
      createApplication('anonymous', listApps),
    );

    const response = await router.request('/hub/apps');

    expect(response.status).toBe(401);
    expect(listApps).not.toHaveBeenCalled();
  });

  it('rejects authenticated users without system administrator access', async () => {
    const listApps = vi.fn<HubService['listApps']>();
    const router = await apiRoutes.createRouter(
      createApplication('member', listApps),
    );

    const response = await router.request('/hub/apps');

    expect(response.status).toBe(403);
    expect(listApps).not.toHaveBeenCalled();
  });

  it('serves Hub data to system administrators', async () => {
    const listApps = vi.fn<HubService['listApps']>().mockResolvedValue([]);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', listApps),
    );

    const response = await router.request('/hub/apps');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
    expect(listApps).toHaveBeenCalledOnce();
  });

  it('rejects oversized Release bodies before reading them', async () => {
    const router = await apiRoutes.createRouter(
      createApplication(
        'administrator',
        vi.fn<HubService['listApps']>().mockResolvedValue([]),
      ),
    );

    const response = await router.request('/hub/apps/customer/releases', {
      method: 'POST',
      headers: {
        'content-length': String(256 * 1024 * 1024 + 1),
        'x-release-version': '1.0.0',
      },
      body: 'not-read',
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ARTIFACT_TOO_LARGE' },
    });
  });
});

function createApplication(
  role: 'anonymous' | 'member' | 'administrator',
  listApps: HubService['listApps'],
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (role === 'anonymous') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      await next();
    },
  } as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', {
        identity: { principal: { type: 'user', id: role } },
      });
      await next();
    },
    permissionSets: {
      getEffective: async () =>
        role === 'administrator' ? [{ key: 'system-administrator' }] : [],
    },
  } as AppAuthorization);
  container.instance(hubServiceToken, { listApps } as HubService);
  return {
    appName: 'hub',
    publicBasePath: '',
    config: {} as AppPluginApplication['config'],
    container,
    paths: {} as AppPluginApplication['paths'],
  };
}

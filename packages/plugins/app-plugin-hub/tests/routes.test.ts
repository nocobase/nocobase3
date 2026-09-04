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

  it('keeps the Release config example out of lists and reads it on demand', async () => {
    const release = {
      id: 'release-1',
      appId: 'customer',
      version: '1.0.0',
      artifactKey: 'releases/customer/release-1.tgz',
      checksum: 'a'.repeat(64),
      size: 100,
      configTemplate: 'auth:\n  secret: sensitive\n',
      manifest: null,
      createdAt: new Date('2026-09-04T00:00:00Z'),
    } as const;
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        listReleases: vi
          .fn<HubService['listReleases']>()
          .mockResolvedValue([release]),
        getRelease: vi
          .fn<HubService['getRelease']>()
          .mockResolvedValue(release),
      }),
    );

    const listResponse = await router.request('/hub/apps/customer/releases');
    const listBody = (await listResponse.json()) as {
      readonly data: readonly Record<string, unknown>[];
    };
    expect(listBody.data[0]).toMatchObject({
      id: 'release-1',
      hasConfigTemplate: true,
    });
    expect(listBody.data[0]).not.toHaveProperty('configTemplate');

    const configResponse = await router.request(
      '/hub/apps/customer/releases/release-1/config-template',
    );
    expect(configResponse.headers.get('cache-control')).toBe('no-store');
    await expect(configResponse.json()).resolves.toEqual({
      data: { content: 'auth:\n  secret: sensitive\n' },
    });
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
      },
      body: 'not-read',
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ARTIFACT_TOO_LARGE' },
    });
  });

  it('refreshes one application from the Host status', async () => {
    const refresh = vi.fn<HubService['refresh']>().mockResolvedValue({
      app: { id: 'customer' },
    } as never);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        refresh,
      }),
    );

    const response = await router.request('/hub/apps/customer/refresh', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith('customer');
  });

  it('starts a previously deployed application', async () => {
    const start = vi.fn<HubService['start']>().mockResolvedValue({
      app: { id: 'customer' },
    } as never);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        start,
      }),
    );

    const response = await router.request('/hub/apps/customer/start', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledWith('customer');
  });

  it('updates application startup settings', async () => {
    const updateSettings = vi
      .fn<HubService['updateSettings']>()
      .mockResolvedValue({ app: { id: 'customer' } } as never);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        updateSettings,
      }),
    );

    const response = await router.request('/hub/apps/customer/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activation: 'lazy' }),
    });

    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith('customer', {
      activation: 'lazy',
    });
  });

  it('accepts deployments asynchronously', async () => {
    const deploy = vi.fn<HubService['deploy']>().mockResolvedValue({
      id: 'deployment-1',
      status: 'queued',
    } as never);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        deploy,
      }),
    );

    const response = await router.request('/hub/apps/customer/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        releaseId: 'release-1',
        config: { mode: 'external' },
      }),
    });

    expect(response.status).toBe(202);
    expect(deploy).toHaveBeenCalledWith('customer', {
      releaseId: 'release-1',
      config: { mode: 'external' },
    });
  });

  it('creates rollback operations asynchronously', async () => {
    const rollback = vi.fn<HubService['rollback']>().mockResolvedValue({
      id: 'deployment-2',
      status: 'queued',
    } as never);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        rollback,
      }),
    );

    const response = await router.request('/hub/apps/customer/rollback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deploymentId: 'deployment-1',
        config: { mode: 'file', content: 'feature: true\n' },
      }),
    });

    expect(response.status).toBe(202);
    expect(rollback).toHaveBeenCalledWith('customer', {
      deploymentId: 'deployment-1',
      config: { mode: 'file', content: 'feature: true\n' },
    });
  });

  it('updates the active file configuration without creating a deployment', async () => {
    const updateConfig = vi.fn<HubService['updateConfig']>().mockResolvedValue({
      mode: 'file',
      content: 'feature: true\n',
    });
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        updateConfig,
      }),
    );

    const response = await router.request('/hub/apps/customer/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'feature: true\n' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(updateConfig).toHaveBeenCalledWith('customer', {
      content: 'feature: true\n',
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { mode: 'file', content: 'feature: true\n' },
    });
  });

  it('removes one application for a system administrator', async () => {
    const remove = vi.fn<HubService['remove']>().mockResolvedValue(undefined);
    const router = await apiRoutes.createRouter(
      createApplication('administrator', {
        listApps: vi.fn<HubService['listApps']>().mockResolvedValue([]),
        remove,
      }),
    );

    const response = await router.request('/hub/apps/customer', {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith('customer');
  });
});

function createApplication(
  role: 'anonymous' | 'member' | 'administrator',
  service:
    | HubService['listApps']
    | (Partial<HubService> & Pick<HubService, 'listApps'>),
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
  container.instance(
    hubServiceToken,
    (typeof service === 'function'
      ? { listApps: service }
      : service) as HubService,
  );
  return {
    appName: 'hub',
    publicBasePath: '',
    config: {} as AppPluginApplication['config'],
    container,
    paths: {} as AppPluginApplication['paths'],
  };
}

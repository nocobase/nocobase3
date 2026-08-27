import { describe, expect, it, vi } from 'vitest';

import {
  HubApiError,
  getHubApiBase,
  hasHubCapability,
  hubGet,
  setHubUnauthorizedHandler,
  unwrapHubResponse,
} from '@/features/hub/api';
import { getDeploymentProgress } from '@/features/hub/status';
import { appRoutes, registryRoutesEnabled } from '@/routes';

describe('Hub client API', () => {
  it('uses the injected browser API URL and falls back to /hub/api', () => {
    const original = (globalThis as { NOCOBASE_API_URL?: string })
      .NOCOBASE_API_URL;

    (globalThis as { NOCOBASE_API_URL?: string }).NOCOBASE_API_URL =
      '/control/api/';
    expect(getHubApiBase()).toBe('/control/api');

    delete (globalThis as { NOCOBASE_API_URL?: string }).NOCOBASE_API_URL;
    expect(getHubApiBase()).toBe('/hub/api');

    if (original === undefined) {
      delete (globalThis as { NOCOBASE_API_URL?: string }).NOCOBASE_API_URL;
    } else {
      (globalThis as { NOCOBASE_API_URL?: string }).NOCOBASE_API_URL = original;
    }
  });

  it('unwraps the stable response envelope', () => {
    expect(
      unwrapHubResponse({
        data: [{ id: 'app-1' }],
        meta: { total: 1, limit: 20, offset: 0 },
        requestId: 'req-1',
      }),
    ).toEqual({
      data: [{ id: 'app-1' }],
      meta: { total: 1, limit: 20, offset: 0 },
      requestId: 'req-1',
    });
  });

  it('turns an error envelope into a useful typed error', () => {
    expect(() =>
      unwrapHubResponse(
        {
          error: { code: 'FORBIDDEN', message: 'Missing deploy capability' },
          requestId: 'req-2',
        },
        403,
      ),
    ).toThrowError(HubApiError);

    try {
      unwrapHubResponse(
        {
          error: { code: 'FORBIDDEN', message: 'Missing deploy capability' },
          requestId: 'req-2',
        },
        403,
      );
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        requestId: 'req-2',
      });
    }
  });

  it('notifies the auth boundary when a Hub request becomes unauthorized', async () => {
    const onUnauthorized = vi.fn();
    setHubUnauthorizedHandler(onUnauthorized);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: { code: 'UNAUTHORIZED', message: 'Session expired' },
          requestId: 'expired-session',
        },
        { status: 401 },
      ),
    );

    await expect(hubGet('/me', fetcher)).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setHubUnauthorizedHandler(undefined);
  });

  it('matches exact and wildcard capabilities', () => {
    const capabilities = {
      global: [
        { resource: 'hub.app', actions: ['read', 'create'] },
        { resource: 'hub.deployment', actions: ['read'] },
      ],
      application: [],
    };

    expect(hasHubCapability(capabilities, 'hub.app', 'create')).toBe(true);
    expect(hasHubCapability(capabilities, 'hub.deployment', 'create')).toBe(
      false,
    );
    expect(
      hasHubCapability(
        { global: [{ resource: '*', actions: ['*'] }] },
        'hub.deployment',
        'create',
      ),
    ).toBe(true);

    expect(
      hasHubCapability(
        {
          global: [],
          application: [
            {
              applicationId: 'app-1',
              capabilities: [
                { resource: 'hub.deployment', actions: ['create'] },
              ],
            },
          ],
        },
        'hub.deployment',
        'create',
        'app-1',
      ),
    ).toBe(true);
  });
});

describe('Hub route configuration', () => {
  it('keeps Hub settings routable without exposing it in navigation', () => {
    expect(registryRoutesEnabled).toBe(false);
    expect(appRoutes.map((route) => route.path)).toEqual([
      '/apps',
      '/apps/:appId',
      '/deployments',
      '/deployments/:deploymentId',
      '/audit',
      '/members',
      '/settings',
    ]);
    expect(
      appRoutes.flatMap((route) =>
        route.resource
          ? [
              {
                name: route.name,
                capability: route.resource.meta?.hubResource,
              },
            ]
          : [],
      ),
    ).toEqual([
      { name: 'apps', capability: 'hub.app' },
      { name: 'deployments', capability: 'hub.deployment' },
      { name: 'audit', capability: 'hub.auditLog' },
      { name: 'members', capability: 'hub.member' },
    ]);
    expect(appRoutes.find((route) => route.name === 'settings')?.resource).toBe(
      undefined,
    );
  });
});

describe('deployment progress', () => {
  it('maps lifecycle states to readable progress', () => {
    expect(getDeploymentProgress('queued')).toEqual({
      percent: 10,
      label: 'Queued',
    });
    expect(getDeploymentProgress('switching')).toEqual({
      percent: 75,
      label: 'Switching traffic',
    });
    expect(getDeploymentProgress('succeeded')).toEqual({
      percent: 100,
      label: 'Succeeded',
    });
    expect(getDeploymentProgress('failed')).toEqual({
      percent: 100,
      label: 'Failed',
    });
  });
});

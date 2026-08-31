import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import {
  systemInfoServiceToken,
  type SystemInfoService,
} from '../server/tokens.js';

describe('@nocobase/app-plugin-system-info', () => {
  it('serves system information for an authenticated request', async () => {
    const router = await apiRoutes.createRouter(
      createApplication(
        { required: () => async (_context, next) => next() } as unknown as Auth,
        {
          getInfo: () => ({
            packageName: '@nocobase/app-plugin-system-info',
            version: '0.0.1-test',
            nodeVersion: 'v24.0.0-test',
            serverTime: '2026-08-30T00:00:00.000Z',
          }),
        },
      ),
    );

    const response = await router.request('/system-info');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      packageName: '@nocobase/app-plugin-system-info',
      version: '0.0.1-test',
      nodeVersion: 'v24.0.0-test',
      serverTime: '2026-08-30T00:00:00.000Z',
    });
  });

  it('requires authentication before reading system information', async () => {
    const router = await apiRoutes.createRouter(
      createApplication(
        {
          required: () => (context) =>
            context.json(
              { code: 'UNAUTHORIZED', message: 'Authentication required' },
              401,
            ),
        } as unknown as Auth,
        {
          getInfo: () => {
            throw new Error('The service must not run for anonymous requests.');
          },
        },
      ),
    );

    const response = await router.request('/system-info');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it('declares an API route contribution', () => {
    expect(apiRoutes).toMatchObject({ scope: 'api' });
    expect(apiRoutes.createRouter).toBeTypeOf('function');
  });

  it('does not apply authentication to later Route contributions', async () => {
    const application = new Hono();
    const pluginRouter = await apiRoutes.createRouter(
      createApplication(
        {
          required: () => (context) =>
            context.json({ code: 'UNAUTHORIZED' }, 401),
        } as unknown as Auth,
        {
          getInfo: () => {
            throw new Error('Anonymous requests must not read system info.');
          },
        },
      ),
    );
    application.route('/api', pluginRouter);
    application.get('/api/later-plugin', (context) => context.text('later'));

    expect((await application.request('/api/system-info')).status).toBe(401);
    await expect(
      (await application.request('/api/later-plugin')).text(),
    ).resolves.toBe('later');
  });
});

function createApplication(
  authentication: Auth,
  systemInfo: SystemInfoService,
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  container.instance(systemInfoServiceToken, systemInfo);
  return {
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: {} as never,
    router: new Hono(),
    container,
  };
}

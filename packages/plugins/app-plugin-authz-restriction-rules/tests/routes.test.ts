import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { ServiceContainer } from '@nocobase/service-provider';
import { createConfigPaths } from '@nocobase/app-server/config';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization/server';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import contributions from '../server/routes.js';

async function fixture(installed = true, signedIn = true, permitted = true) {
  const authorization = createAppAuthorization({});
  const list = vi.fn(async () => []);
  if (installed) Object.assign(authorization, { restrictionRules: { list } });
  const require = vi.fn(async () => {
    if (!permitted)
      throw new AuthorizationDeniedError({ effect: 'deny', reasons: [] });
  });
  const scope = authorization.for({ principal: { type: 'user', id: 'admin' } });
  scope.require = require;
  authorization.middleware = () => async (context, next) => {
    context.set('authz', scope);
    await next();
  };
  const container = new ServiceContainer();
  container.instance(authorizationToken, authorization);
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (!signedIn) return context.json({ code: 'UNAUTHENTICATED' }, 401);
      await next();
    },
  } as Auth);
  const router = new Hono();
  for (const route of contributions)
    router.route(
      '/',
      await route.createRouter({
        container,
        appName: 'test',
        publicBasePath: '',
        config: { app: { name: 'test', publicBasePath: '' } },
        paths: createConfigPaths({ rootDir: '/missing' }),
        router,
      }),
    );
  return { router: new Hono().route('/portal/api', router), require, list };
}
describe('independent rule management routes', () => {
  it('owns authentication and authorization, including options', async () => {
    for (const path of [
      '/authz/restriction-rules',
      '/authz/restriction-rules/options',
      '/authz/restriction-rules/records/orders',
      '/authz/restriction-rules/subjects/user',
    ]) {
      const anonymous = await fixture(true, false);
      expect(
        (await anonymous.router.request('/portal/api' + path)).status,
      ).toBe(401);
      expect(anonymous.list).not.toHaveBeenCalled();
      const denied = await fixture(true, true, false);
      expect((await denied.router.request('/portal/api' + path)).status).toBe(
        403,
      );
      expect(denied.list).not.toHaveBeenCalled();
      expect(denied.require).toHaveBeenCalledWith({
        resource: { type: 'settings', id: 'authorization.restriction-rules' },
        action: 'read',
      });
    }
  });
  it('serves CRUD and options with no main authorization router mounted', async () => {
    const { router, list } = await fixture();
    expect(
      (await router.request('/portal/api/authz/restriction-rules')).status,
    ).toBe(200);
    expect(list).toHaveBeenCalledOnce();
    expect(
      (await router.request('/portal/api/authz/restriction-rules/options'))
        .status,
    ).toBe(200);
  });
  it('registers no endpoints when the rule engine is absent', async () => {
    const { router } = await fixture(false);
    expect(
      (await router.request('/portal/api/authz/restriction-rules')).status,
    ).toBe(404);
    expect(
      (await router.request('/portal/api/authz/restriction-rules/options'))
        .status,
    ).toBe(404);
  });
});

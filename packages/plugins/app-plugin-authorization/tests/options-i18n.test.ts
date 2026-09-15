import { createConfigPaths } from '@nocobase/app-server/config';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Authorization } from '@nocobase/authorization/core';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { createI18nMiddleware, I18nRuntime } from '@nocobase/i18n/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AUTHORIZATION_NAMESPACE } from '../shared.js';
import { createAppAuthorization } from '../server/authorization.js';
import { defineRecordAccessPolicy } from '../server/database/record-access.js';
import serverLocales from '../server/locales/index.js';
import { pages } from '../server/pages-authorization.js';
import { apiRoutes } from '../server/routes/index.js';
import {
  authorizationToken,
  type AppAuthorizationService,
} from '../server/tokens.js';
import { createOrdersDatabase } from './orders-database.js';

let database: DatabaseManager;
let connection: DatabaseConnection;

beforeAll(async () => {
  database = await createOrdersDatabase();
  connection = database.connection();
});

afterAll(async () => {
  await database.destroy();
});

/** The options body, read down to the parts these tests name. */
interface OptionsBody {
  data: {
    resourceTypes: readonly {
      value: string;
      label: string;
      resources: readonly {
        value: string;
        label: string;
        description?: string;
      }[];
      actions: readonly { value: string; label: string }[];
    }[];
    subjectTypes: readonly { value: string; label: string }[];
    recordAccessPolicies: readonly {
      value: string;
      label: string;
      description?: string;
    }[];
  };
}

describe('the options endpoint translates on the server', () => {
  it('answers in English by default', async () => {
    const router = await mountedRouter(authorization());

    const response = await router.request('/api/authz/permission-sets/options');

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as OptionsBody;
    const pageType = resourceType(data, 'page');
    expect(pageType.label).toBe('Pages');
    expect(pageType.actions).toEqual([{ value: 'access', label: 'Access' }]);
    expect(pageType.resources[0]).toEqual({
      value: '*',
      label: 'All pages',
      description: 'Allow access to every page, including pages added later.',
      actions: [{ value: 'access', label: 'Access' }],
    });
    const settings = resourceType(data, 'authorization.settings');
    expect(settings.label).toBe('Authorization settings');
    expect(settings.resources[0]).toMatchObject({
      value: 'permission-sets',
      label: 'Permission Sets',
    });
    expect(resourceType(data, 'database.collection').actions).toEqual([
      { value: 'read', label: 'Read' },
      { value: 'create', label: 'Create' },
      { value: 'update', label: 'Update' },
      { value: 'delete', label: 'Delete' },
    ]);
    expect(data.subjectTypes[0]).toMatchObject({
      value: 'authenticated',
      label: 'All signed-in users',
    });
    expect(data.recordAccessPolicies).toContainEqual({
      value: 'customFilter',
      label: 'Custom Filter',
      description: 'Select records with a custom filter condition.',
    });
  });

  it('answers in Chinese when the request asks for it', async () => {
    const router = await mountedRouter(authorization());

    const response = await router.request(
      '/api/authz/permission-sets/options',
      { headers: { 'accept-language': 'zh-CN' } },
    );

    const { data } = (await response.json()) as OptionsBody;
    const pageType = resourceType(data, 'page');
    expect(pageType.label).toBe('页面');
    expect(pageType.actions).toEqual([{ value: 'access', label: '访问' }]);
    expect(pageType.resources[0]).toMatchObject({
      value: '*',
      label: '所有页面',
    });
    const settings = resourceType(data, 'authorization.settings');
    expect(settings.label).toBe('授权设置');
    expect(settings.resources[0]).toMatchObject({
      value: 'permission-sets',
      label: '权限集',
    });
    expect(data.subjectTypes[0]?.label).toBe('所有已登录用户');
    expect(data.recordAccessPolicies).toContainEqual({
      value: 'customFilter',
      label: '自定义筛选',
      description: '使用自定义筛选条件选择记录。',
    });
  });

  it('sends a registered string as it was written, in every language', async () => {
    const authz = authorization();
    authz.db.collections.add({ name: 'orders', title: 'Orders' });
    const router = await mountedRouter(authz);

    const labels = await Promise.all(
      [undefined, 'zh-CN'].map(async (locale) => {
        const response = await router.request(
          '/api/authz/permission-sets/options',
          locale ? { headers: { 'accept-language': locale } } : undefined,
        );
        const { data } = (await response.json()) as OptionsBody;
        return resourceType(data, 'database.collection').resources[0]?.label;
      }),
    );

    expect(labels).toEqual(['Orders', 'Orders']);
  });

  it('resolves a registered key through the catalogue of its namespace', async () => {
    const authz = authorization();
    authz.db.collections.add({
      name: 'orders',
      title: { key: 'options.resourceTypes.collection' },
    });
    authz.db.recordAccess.add(
      defineRecordAccessPolicy({
        key: 'regional',
        // Nothing declares this key, so its last segment humanised is what shows.
        title: { key: 'options.recordAccessPolicies.myRegion' },
        resolve: () => true,
      }),
    );
    const router = await mountedRouter(authz);

    const response = await router.request(
      '/api/authz/permission-sets/options',
      { headers: { 'accept-language': 'zh-CN' } },
    );

    const { data } = (await response.json()) as OptionsBody;
    expect(resourceType(data, 'database.collection').resources[0]?.label).toBe(
      '数据表',
    );
    expect(data.recordAccessPolicies).toContainEqual({
      value: 'regional',
      label: 'My Region',
    });
  });
});

function resourceType(
  data: OptionsBody['data'],
  value: string,
): OptionsBody['data']['resourceTypes'][number] {
  const found = data.resourceTypes.find((item) => item.value === value);
  if (!found) throw new Error(`No resource type ${value} in the options`);
  return found;
}

function authorization(): AppAuthorizationService {
  return createAppAuthorization({
    connection,
    config: { plugins: [pages()] },
  });
}

/** The plugin routes under `/api`, behind the i18n middleware an application mounts. */
async function mountedRouter(
  authorization: AppAuthorizationService,
): Promise<Hono> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace(AUTHORIZATION_NAMESPACE, serverLocales);
  await runtime.init();
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authenticationToken, {
    required: () => async (_context, next) => next(),
  } as unknown as Auth);
  container.instance(authorizationToken, alwaysPermitted(authorization));
  const routes = await apiRoutes.createRouter({
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  return router.route('/api', routes);
}

function alwaysPermitted(
  authorization: AppAuthorizationService,
): AppAuthorizationService {
  const permitted = Object.create(authorization) as AppAuthorizationService;
  permitted.middleware = () => async (context, next) => {
    context.set('authz', {
      require: () => Promise.resolve(),
      can: () => Promise.resolve(true),
      authorize: () => Promise.resolve({ effect: 'permit' }),
      permissions: () => Promise.resolve({}),
    } as unknown as ReturnType<Authorization['for']>);
    await next();
  };
  return permitted;
}

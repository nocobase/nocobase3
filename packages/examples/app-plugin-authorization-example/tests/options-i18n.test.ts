import { localizeOptions } from '../../../plugins/app-plugin-authorization/client/components/localized-options.js';
import type {
  AuthorizationOptions,
  AuthorizationOptionsResponse,
} from '../../../plugins/app-plugin-authorization/client/authorization-client.js';
import en from '../../../plugins/app-plugin-authorization/locales/en-US.js';
import zh from '../../../plugins/app-plugin-authorization/locales/zh-CN.js';
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import {
  AuthorizationDeniedError,
  defineRecordAccess,
  type AuthorizationContext,
  type Composite,
} from '@nocobase/authorization/core';
import { createAppPaths } from '@nocobase/app-server/config';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { createI18nMiddleware, I18nRuntime } from '@nocobase/i18n/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION_NAMESPACE } from '../../../plugins/app-plugin-authorization/shared.js';
import {
  createAppAuthorization,
  type AppAuthorization,
} from '../../../plugins/app-plugin-authorization/server/authorization.js';
import serverLocales from '../../../plugins/app-plugin-authorization/server/locales/index.js';
import { apiRoutes } from '../../../plugins/app-plugin-authorization/server/routes/index.js';
import { authorizationToken } from '../../../plugins/app-plugin-authorization/server/tokens.js';
import { createOrdersDatabase } from '../../../plugins/app-plugin-authorization/tests/orders-database.js';

let database: DatabaseManager;
let connection: DatabaseConnection;

beforeAll(async () => {
  database = await createOrdersDatabase();
  connection = database.connection();
});

afterAll(async () => {
  await database.destroy();
});

describe('locale-independent option descriptors', () => {
  it('returns identical descriptors for English and Chinese requests', async () => {
    const router = await mountedRouter(authorization());
    const en = await (
      await router.request('/api/authz/permission-sets/options')
    ).json();
    const zh = await (
      await router.request('/api/authz/permission-sets/options', {
        headers: { 'accept-language': 'zh-CN' },
      })
    ).json();
    expect(zh).toEqual(en);
    expect(en.data.subjectTypes[0].title).toMatchObject({
      key: 'options.subjectTypes.authenticated',
      ns: AUTHORIZATION_NAMESPACE,
    });
  });

  it('answers in English by default', async () => {
    const router = await mountedRouter(authorization());

    const response = await router.request('/api/authz/permission-sets/options');

    expect(response.status).toBe(200);
    const data = await readOptions(response);
    expect(outline(data)).toEqual([
      ['pages', ['page']],
      ['business', []],
      ['administration', ['authorization']],
    ]);
    const settings = subsection(data, 'authorization');
    expect(settings.label).toBe('Authorization');
    expect(
      settings.resources.find(
        (item) => item.value === 'authorization.permission-sets',
      ),
    ).toMatchObject({ type: 'settings', label: 'Permission Sets' });
    expect(data.subjectTypes[0]).toMatchObject({
      value: 'authenticated',
      label: 'All signed-in users',
    });
    expect(data.recordAccess).toContainEqual({
      value: 'customFilter',
      label: 'Custom Filter',
      description: 'Select records with a custom filter condition.',
    });
  });

  it('publishes registered subject selectors and dispatches paged queries and resolution', async () => {
    const authz = authorization();
    authz.subjects.add('department', {
      filterActive: async (ids) => ids,
      administration: {
        title: 'Departments',
        selection: {
          type: 'collection',
          list: async (query, context) => {
            await context.authz.require({
              resource: { type: 'department', id: '*' },
              action: 'read',
            });
            return {
              items: [
                {
                  id: 'sales',
                  title: `${query.search}:${query.page}:${query.pageSize}`,
                },
              ],
              total: 42,
            };
          },
          resolve: async (ids) =>
            ids.map((id) => ({ id, title: `Department ${id}` })),
        },
      },
    });
    const router = await mountedRouter(authz);
    const options = await router.request('/api/authz/sharing-rules/options');
    const data = await readOptions(options);
    expect(data.subjectTypes).toContainEqual({
      value: 'department',
      label: 'Departments',
      selection: { type: 'collection' },
    });
    const listed = await router.request(
      '/api/authz/sharing-rules/subjects/department?search=sales&page=2&pageSize=20',
    );
    expect(await listed.json()).toEqual({
      data: { items: [{ id: 'sales', title: 'sales:2:20' }], total: 42 },
    });
    const resolved = await router.request(
      '/api/authz/restriction-rules/subjects/department/resolve',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['sales'] }),
      },
    );
    expect(await resolved.json()).toEqual({
      data: [{ id: 'sales', title: 'Department sales' }],
    });
    expect(
      (
        await router.request(
          '/api/authz/sharing-rules/subjects/department?pageSize=101',
        )
      ).status,
    ).toBe(400);
    expect(
      (await router.request('/api/authz/sharing-rules/subjects/unknown'))
        .status,
    ).toBe(404);
  });

  it.each(['permission-sets', 'sharing-rules', 'restriction-rules'])(
    'gates %s subject searches and resolution before callbacks run',
    async (settings) => {
      const authz = authorization();
      const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const resolve = vi.fn().mockResolvedValue([]);
      authz.subjects.add('department', {
        filterActive: async (ids) => ids,
        administration: {
          title: 'Departments',
          selection: { type: 'collection', list, resolve },
        },
      });
      const require = vi
        .fn()
        .mockRejectedValue(
          new AuthorizationDeniedError({ effect: 'deny', reasons: [] }),
        );
      const router = await mountedRouter(authz, require);
      expect(
        (await router.request(`/api/authz/${settings}/subjects/department`))
          .status,
      ).toBe(403);
      expect(
        (
          await router.request(
            `/api/authz/${settings}/subjects/department/resolve`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ids: ['sales'] }),
            },
          )
        ).status,
      ).toBe(403);
      expect(list).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
      expect(require).toHaveBeenCalledWith({
        resource: { type: 'settings', id: `authorization.${settings}` },
        action: 'read',
      });
    },
  );

  it('includes settings items registered by another settings module', async () => {
    const authz = authorization();
    authz.ui.sections.add({
      name: 'ai',
      title: 'AI',
      parent: 'administration',
    });
    authz.settings.add({
      id: 'ai.models',
      title: 'Models',
      actions: [
        { name: 'read', title: 'Read' },
        { name: 'update', title: 'Update' },
      ],
    });
    authz.ui.place({ type: 'settings', id: 'ai.models' }, { section: 'ai' });
    const router = await mountedRouter(authz);
    const response = await router.request('/api/authz/permission-sets/options');
    const data = await readOptions(response);
    expect(
      data.sections
        .find((section) => section.value === 'administration')
        ?.subsections.map((item) => [item.value, item.label]),
    ).toEqual([
      ['authorization', 'Authorization'],
      ['ai', 'AI'],
    ]);
    expect(subsection(data, 'ai').resources).toContainEqual(
      expect.objectContaining({
        type: 'settings',
        value: 'ai.models',
        label: 'Models',
        actions: [
          { value: 'read', label: 'Read' },
          { value: 'update', label: 'Update' },
        ],
      }),
    );
  });

  it('answers in Chinese when the request asks for it', async () => {
    const router = await mountedRouter(authorization());

    const response = await router.request(
      '/api/authz/permission-sets/options',
      { headers: { 'accept-language': 'zh-CN' } },
    );

    const data = await readOptions(response, 'zh-CN');
    expect(outline(data)).toEqual([
      ['pages', ['page']],
      ['business', []],
      ['administration', ['authorization']],
    ]);
    expect(data.sections.map((section) => section.label)).toEqual([
      '页面权限',
      '业务权限',
      zh.sections.administration,
    ]);
    const settings = subsection(data, 'authorization');
    expect(settings.label).toBe('权限管理');
    expect(
      settings.resources.find(
        (item) => item.value === 'authorization.permission-sets',
      ),
    ).toMatchObject({ label: '权限集' });
    expect(data.subjectTypes[0]?.label).toBe('所有已登录用户');
    expect(data.recordAccess).toContainEqual({
      value: 'customFilter',
      label: '自定义筛选',
      description: '使用自定义筛选条件选择记录。',
    });
  });

  it('sends a registered string as it was written, in every language', async () => {
    const authz = authorization();
    authz.ui.sections.add({
      name: 'sales',
      title: 'Sales',
      parent: 'business',
    });
    authz.ui.place(authz.composites.define(ordersResource('Orders')), {
      section: 'sales',
    });
    const router = await mountedRouter(authz);

    const labels = await Promise.all(
      [undefined, 'zh-CN'].map(async (locale) => {
        const response = await router.request(
          '/api/authz/permission-sets/options',
          locale ? { headers: { 'accept-language': locale } } : undefined,
        );
        const data = await readOptions(response, locale);
        return subsection(data, 'sales').resources.find(
          (item) => item.value === 'orders',
        )?.label;
      }),
    );

    expect(labels).toEqual(['Orders', 'Orders']);
  });

  it('resolves a registered key through the catalogue of its namespace', async () => {
    const authz = authorization();
    authz.ui.sections.add({
      name: 'sales',
      title: 'Sales',
      parent: 'business',
    });
    authz.ui.place(
      authz.composites.define(
        ordersResource({
          key: 'options.resourceTypes.collection',
          ns: AUTHORIZATION_NAMESPACE,
        }),
      ),
      { section: 'sales' },
    );
    authz.recordAccess.define(
      defineRecordAccess('regional', (access) =>
        access
          .title({
            key: 'options.recordAccessPolicies.myRegion',
            ns: AUTHORIZATION_NAMESPACE,
          })
          .collections('*')
          .resolver(() => true),
      ),
    );
    const router = await mountedRouter(authz);

    const response = await router.request(
      '/api/authz/permission-sets/options',
      { headers: { 'accept-language': 'zh-CN' } },
    );

    const data = await readOptions(response, 'zh-CN');
    expect(
      subsection(data, 'sales').resources.find(
        (item) => item.value === 'orders',
      )?.label,
    ).toBe('数据表');
    // The key is missing from the catalogue, so the humanized default shows.
    expect(data.recordAccess).toContainEqual({
      value: 'regional',
      label: 'My Region',
    });
  });
});

function ordersResource(title: Composite['title']): Composite {
  return {
    name: 'orders',
    title,
    actions: [
      {
        name: 'view',
        title: 'View',
        grants: [
          {
            resource: { type: 'database.collection', id: 'orders' },
            actions: [
              { action: 'read', policy: { type: 'database', fields: '*' } },
            ],
          },
        ],
      },
    ],
  };
}

/** Each section with the names of its subsections. */
function outline(data: AuthorizationOptions): [string, string[]][] {
  return data.sections.map((section) => [
    section.value,
    section.subsections.map((item) => item.value),
  ]);
}

function subsection(
  data: AuthorizationOptions,
  value: string,
): AuthorizationOptions['sections'][number]['subsections'][number] {
  const found = data.sections
    .flatMap((section) => section.subsections)
    .find((item) => item.value === value);
  if (!found) throw new Error(`No subsection ${value} in the options`);
  return found;
}

function authorization(): AppAuthorization {
  const authz = createAppAuthorization({
    config: { plugins: [defaultAccess(), sharingRules(), restrictionRules()] },
    connection,
    database,
  });
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  return authz;
}

/** The plugin routes under `/api`, behind the i18n middleware an application mounts. */
async function mountedRouter(
  authorization: AppAuthorization,
  require?: AuthorizationContext['require'],
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
  container.instance(
    authorizationToken,
    alwaysPermitted(authorization, require),
  );
  // Rule plugins serve their routes through `authz.routes`, so the
  // authorization contribution alone mounts every `/api/authz` path.
  const routes = await apiRoutes.createRouter({
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: createAppPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  return router.route('/api', routes);
}

function alwaysPermitted(
  authorization: AppAuthorization,
  require?: AuthorizationContext['require'],
): AppAuthorization {
  const permitted = Object.create(authorization) as AppAuthorization;
  permitted.middleware = () => async (context, next) => {
    context.set('authz', {
      require: require ?? (() => Promise.resolve()),
      can: () => Promise.resolve(true),
      authorize: () => Promise.resolve({ effect: 'permit', reasons: [] }),
      snapshot: () => Promise.resolve({ unrestricted: true, permissions: [] }),
    } as unknown as AuthorizationContext);
    await next();
  };
  return permitted;
}

async function readOptions(
  response: Response,
  locale = 'en-US',
): Promise<AuthorizationOptions> {
  const { data } = (await response.json()) as {
    data: AuthorizationOptionsResponse;
  };
  return localizeOptions(data, (key, options) => {
    const value = key
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object'
            ? Reflect.get(node, part)
            : undefined,
        locale === 'zh-CN' ? zh : en,
      );
    return typeof value === 'string'
      ? value
      : String(options?.defaultValue ?? key);
  });
}

import {
  AuthorizationDeniedError,
  defineRecordAccess,
  type AuthorizationContext,
  type CompositeResource,
} from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { createI18nMiddleware, I18nRuntime } from '@nocobase/i18n/server';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthorizationOptionsResponse } from '../../../client/authorization-client.js';
import {
  createAppAuthorization,
  type AppAuthorization,
} from '../../../server/authorization.js';
import serverLocales from '../../../server/locales/index.js';
import { AUTHORIZATION_NAMESPACE } from '../../../shared.js';
import { mountedRouter } from '../../helpers/mounted-router.js';
import { createOrdersDatabase } from '../../helpers/orders-database.js';
import { testRulePlugin } from '../../helpers/rule-plugin.js';

let database: DatabaseManager;
let connection: DatabaseConnection;

beforeAll(async () => {
  database = await createOrdersDatabase();
  connection = database.connection();
});

afterAll(async () => {
  await database.destroy();
});

function authorization(): AppAuthorization {
  const authz = createAppAuthorization({
    config: { plugins: [testRulePlugin('sharing-rules')] },
    connection,
    database,
  });
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  return authz;
}

/** The same authorization with every check answered by `require`. */
function permitted(
  authz: AppAuthorization,
  require: AuthorizationContext['require'] = () => Promise.resolve(),
): AppAuthorization {
  const open = Object.create(authz) as AppAuthorization;
  open.middleware = () => async (context, next) => {
    context.set('authz', {
      require,
      can: () => Promise.resolve(true),
      authorize: () => Promise.resolve({ effect: 'permit', reasons: [] }),
      snapshot: () => Promise.resolve({ unrestricted: true, permissions: [] }),
    } as unknown as AuthorizationContext);
    await next();
  };
  return open;
}

/** The plugin routes behind the i18n middleware an application mounts. */
async function localizedRouter(
  authz: AppAuthorization,
  require?: AuthorizationContext['require'],
): Promise<Hono> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace(AUTHORIZATION_NAMESPACE, serverLocales);
  await runtime.init();
  const router = new Hono();
  router.use('*', createI18nMiddleware(runtime));
  return router.route('/', await mountedRouter(permitted(authz, require)));
}

async function options(
  router: Hono,
  locale?: string,
): Promise<AuthorizationOptionsResponse> {
  const response = await router.request(
    '/api/authz/permission-sets/options',
    locale ? { headers: { 'accept-language': locale } } : undefined,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: AuthorizationOptionsResponse })
    .data;
}

function ordersResource(title: CompositeResource['title']): CompositeResource {
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

describe('the options and subject routes', () => {
  it('returns identical descriptors for English and Chinese requests', async () => {
    const router = await localizedRouter(authorization());
    const en = await options(router);
    expect(await options(router, 'zh-CN')).toEqual(en);
    expect(en.subjectTypes[0]?.title).toMatchObject({
      key: 'options.subjectTypes.authenticated',
      ns: AUTHORIZATION_NAMESPACE,
    });
  });

  it('sends a registered string or translation key unchanged, in every language', async () => {
    const authz = authorization();
    authz.ui.sections.add({
      name: 'sales',
      title: 'Sales',
      parent: 'business',
    });
    const key = { key: 'options.settingsModules.authorization', ns: 'app' };
    authz.ui.place(authz.compositeResources.define(ordersResource('Orders')), {
      section: 'sales',
    });
    authz.ui.place(
      authz.compositeResources.define({
        ...ordersResource(key),
        name: 'invoices',
      }),
      { section: 'sales' },
    );
    authz.recordAccess.define(
      defineRecordAccess('regional', (access) =>
        access
          .title(key)
          .collections('*')
          .resolver(() => true),
      ),
    );
    const router = await localizedRouter(authz);

    for (const locale of [undefined, 'zh-CN']) {
      const data = await options(router, locale);
      const sales = data.sections
        .flatMap((section) => section.subsections)
        .find((subsection) => subsection.name === 'sales');
      expect(
        sales?.resources.map((resource) => [resource.id, resource.title]),
      ).toEqual([
        ['orders', 'Orders'],
        ['invoices', expect.objectContaining(key)],
      ]);
      expect(
        data.recordAccess.find((entry) => entry.key === 'regional')?.title,
      ).toEqual(expect.objectContaining(key));
    }
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
    const router = await localizedRouter(authz);
    const data = (
      (await (
        await router.request('/api/authz/sharing-rules/options')
      ).json()) as { data: AuthorizationOptionsResponse }
    ).data;
    expect(data.subjectTypes).toContainEqual({
      type: 'department',
      title: 'Departments',
      selection: { type: 'collection' },
    });
    const listed = await router.request(
      '/api/authz/sharing-rules/subjects/department?search=sales&page=2&pageSize=20',
    );
    expect(await listed.json()).toEqual({
      data: { items: [{ id: 'sales', title: 'sales:2:20' }], total: 42 },
    });
    const resolved = await router.request(
      '/api/authz/sharing-rules/subjects/department/resolve',
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

  it("lists a subject's members and decorates resolved subjects with their management path", async () => {
    const authz = authorization();
    const members = vi.fn(
      (
        id: string,
        query: { search?: string; page: number; pageSize: number },
      ) =>
        Promise.resolve({
          items: [
            {
              id: 'alice',
              title: `${id}:${query.search}:${query.page}:${query.pageSize}`,
              description: 'Sales',
            },
          ],
          total: 61,
        }),
    );
    authz.subjects.add('department', {
      filterActive: async (ids) => ids,
      administration: {
        title: 'Departments',
        selection: {
          type: 'collection',
          list: async () => ({ items: [], total: 0 }),
          resolve: async (ids) =>
            ids.map((id) => ({ id, title: `Department ${id}` })),
        },
        members,
        manage: (id) =>
          id === 'hidden' ? undefined : `/settings/organization/${id}`,
      },
    });
    authz.subjects.add('project', {
      filterActive: async (ids) => ids,
      administration: {
        title: 'Projects',
        selection: {
          type: 'collection',
          list: async () => ({ items: [], total: 0 }),
          resolve: async (ids) => ids.map((id) => ({ id, title: id })),
        },
      },
    });
    const router = await localizedRouter(authz);
    const data = await options(router);
    expect(data.subjectTypes).toContainEqual({
      type: 'department',
      title: 'Departments',
      selection: { type: 'collection' },
      members: true,
      manage: true,
    });
    expect(data.subjectTypes).toContainEqual({
      type: 'project',
      title: 'Projects',
      selection: { type: 'collection' },
    });
    for (const surface of ['permission-sets', 'inspector', 'sharing-rules']) {
      const listed = await router.request(
        `/api/authz/${surface}/subjects/department/sales%2Feast/members?search=ali&page=3&pageSize=30`,
      );
      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual({
        data: {
          items: [
            { id: 'alice', title: 'sales/east:ali:3:30', description: 'Sales' },
          ],
          total: 61,
        },
      });
    }
    expect(members).toHaveBeenLastCalledWith(
      'sales/east',
      { search: 'ali', page: 3, pageSize: 30 },
      expect.objectContaining({ authz: expect.anything() }),
    );
    members.mockClear();
    expect(
      (
        await router.request(
          '/api/authz/permission-sets/subjects/department/sales/members?pageSize=101',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await router.request(
          '/api/authz/permission-sets/subjects/department/sales/members?page=0',
        )
      ).status,
    ).toBe(400);
    expect(members).not.toHaveBeenCalled();
    for (const type of ['project', 'unknown'])
      expect(
        (
          await router.request(
            `/api/authz/permission-sets/subjects/${type}/sales/members`,
          )
        ).status,
      ).toBe(404);
    const resolved = await router.request(
      '/api/authz/permission-sets/subjects/department/resolve',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['sales', 'hidden'] }),
      },
    );
    expect(await resolved.json()).toEqual({
      data: [
        {
          id: 'sales',
          title: 'Department sales',
          manage: '/settings/organization/sales',
        },
        { id: 'hidden', title: 'Department hidden' },
      ],
    });
    const plain = await router.request(
      '/api/authz/permission-sets/subjects/project/resolve',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['apollo'] }),
      },
    );
    expect(await plain.json()).toEqual({
      data: [{ id: 'apollo', title: 'apollo' }],
    });
  });

  it.each([
    ['permission-sets', 'read'],
    ['inspector', 'inspect'],
    ['sharing-rules', 'read'],
  ])(
    'gates %s member listings before the callback runs',
    async (surface, action) => {
      const authz = authorization();
      const members = vi.fn().mockResolvedValue({ items: [], total: 0 });
      authz.subjects.add('department', {
        filterActive: async (ids) => ids,
        administration: {
          title: 'Departments',
          selection: {
            type: 'collection',
            list: vi.fn(),
            resolve: vi.fn(),
          },
          members,
        },
      });
      const require = vi
        .fn()
        .mockRejectedValue(
          new AuthorizationDeniedError({ effect: 'deny', reasons: [] }),
        );
      const router = await localizedRouter(authz, require);
      expect(
        (
          await router.request(
            `/api/authz/${surface}/subjects/department/sales/members`,
          )
        ).status,
      ).toBe(403);
      expect(members).not.toHaveBeenCalled();
      expect(require).toHaveBeenCalledWith({
        resource: { type: 'settings', id: `authorization.${surface}` },
        action,
      });
    },
  );

  it.each(['permission-sets', 'sharing-rules'])(
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
      const router = await localizedRouter(authz, require);
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
});

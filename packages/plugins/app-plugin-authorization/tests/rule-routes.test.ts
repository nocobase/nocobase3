import { createDefaultAccessHandler } from '../../app-plugin-authz-default-access/server/handler.js';
import { createSharingRulesHandler } from '../../app-plugin-authz-sharing-rules/server/handler.js';
import { createRestrictionRulesHandler } from '../../app-plugin-authz-restriction-rules/server/handler.js';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  AuthorizationRouteRegistry,
  createAuthorization,
  defaultAccess,
  restrictionRules,
  sharingRules,
  type Authorization,
  type DefaultAccessRule,
  type DefaultAccessStore,
  type RestrictionRule,
  type RestrictionRuleStore,
  type SharingRule,
  type SharingRuleStore,
} from '@nocobase/authorization';

const BASE_PATH = '/api/authz';

class MemoryDefaultAccessStore implements DefaultAccessStore {
  readonly rules = new Map<string, DefaultAccessRule>();

  list(): Promise<readonly DefaultAccessRule[]> {
    return Promise.resolve([...this.rules.values()]);
  }
  get(type: string, id: string): Promise<DefaultAccessRule | undefined> {
    return Promise.resolve(this.rules.get(`${type}:${id}`));
  }
  set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    this.rules.set(`${rule.resource.type}:${rule.resource.id}`, rule);
    return Promise.resolve(rule);
  }
  delete(type: string, id: string): Promise<void> {
    this.rules.delete(`${type}:${id}`);
    return Promise.resolve();
  }
  withTransaction(): DefaultAccessStore {
    return this;
  }
}

class MemoryRuleStore<TRule extends { key: string }> {
  readonly rules = new Map<string, TRule>();

  create(rule: TRule): Promise<TRule> {
    this.rules.set(rule.key, rule);
    return Promise.resolve(rule);
  }
  update(key: string, rule: TRule): Promise<TRule> {
    this.rules.delete(key);
    this.rules.set(rule.key, rule);
    return Promise.resolve(rule);
  }
  delete(key: string): Promise<void> {
    this.rules.delete(key);
    return Promise.resolve();
  }
  get(key: string): Promise<TRule | undefined> {
    return Promise.resolve(this.rules.get(key));
  }
  list(): Promise<readonly TRule[]> {
    return Promise.resolve([...this.rules.values()]);
  }
  withTransaction(): this {
    return this;
  }
}

const sharingRule: SharingRule = {
  key: 'orders-to-support',
  title: 'Orders shared with support',
  resource: { type: 'database.collection', id: 'main.orders' },
  subjects: [{ type: 'user', id: 'alice' }],
  actions: [{ action: 'read', selection: { type: 'records', ids: ['1'] } }],
};

const restrictionRule: RestrictionRule = {
  key: 'orders-read-only',
  resource: { type: 'database.collection', id: 'main.orders' },
  subjects: [{ type: 'authenticated', id: '*' }],
  actions: [{ action: 'update', scope: { type: 'ids', ids: ['1'] } }],
};

describe('the HTTP surface each rule plugin serves', () => {
  it('lists, creates, updates and deletes Default Access Rules', async () => {
    const store = new MemoryDefaultAccessStore();
    const { call, require } = fixture([defaultAccess({ store })]);
    const rule: DefaultAccessRule = {
      resource: { type: 'database.collection', id: 'main.orders' },
      actions: [{ action: 'read', scope: { type: 'all' } }],
    };

    const created = await call('/default-access', json('PUT', rule));
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toEqual({ data: rule });
    expect(require).toHaveBeenLastCalledWith({
      resource: { type: 'settings', id: 'authorization.default-access' },
      action: 'configure',
    });

    const updated = await call('/default-access', json('PUT', rule));
    expect(updated.status).toBe(200);
    expect(require).toHaveBeenLastCalledWith({
      resource: { type: 'settings', id: 'authorization.default-access' },
      action: 'configure',
    });

    const listed = await call('/default-access');
    await expect(listed.json()).resolves.toEqual({ data: [rule] });

    const deleted = await call(
      '/default-access/database.collection/main.orders',
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(204);
    expect(store.rules.size).toBe(0);
  });

  it('lists, creates, updates and deletes Sharing Rules', async () => {
    const store = new MemoryRuleStore<SharingRule>();
    const { call } = fixture([
      sharingRules({ store: store as SharingRuleStore }),
    ]);

    const created = await call('/sharing-rules', json('POST', sharingRule));
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ data: sharingRule });

    const listed = await call('/sharing-rules');
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ data: [sharingRule] });

    const renamed = { ...sharingRule, title: 'Renamed' };
    const updated = await call(
      `/sharing-rules/${sharingRule.key}`,
      json('PUT', renamed),
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toEqual({ data: renamed });

    const deleted = await call(`/sharing-rules/${sharingRule.key}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
    expect(store.rules.size).toBe(0);
  });

  it('lists, creates, updates and deletes Restriction Rules', async () => {
    const store = new MemoryRuleStore<RestrictionRule>();
    const { call } = fixture([
      restrictionRules({ store: store as RestrictionRuleStore }),
    ]);

    const created = await call(
      '/restriction-rules',
      json('POST', restrictionRule),
    );
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ data: restrictionRule });

    const listed = await call('/restriction-rules');
    await expect(listed.json()).resolves.toEqual({ data: [restrictionRule] });

    const renamed = { ...restrictionRule, title: 'Renamed' };
    const updated = await call(
      `/restriction-rules/${restrictionRule.key}`,
      json('PUT', renamed),
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toEqual({ data: renamed });

    const deleted = await call(`/restriction-rules/${restrictionRule.key}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
    expect(store.rules.size).toBe(0);
  });

  it.each([
    { settings: 'default-access', path: '/default-access' },
    { settings: 'sharing-rules', path: '/sharing-rules' },
    { settings: 'restriction-rules', path: '/restriction-rules' },
  ])('refuses $path without its settings permission', async ({ path }) => {
    const { call, require } = fixture([
      defaultAccess({ store: new MemoryDefaultAccessStore() }),
      sharingRules({
        store: new MemoryRuleStore<SharingRule>() as SharingRuleStore,
      }),
      restrictionRules({
        store: new MemoryRuleStore<RestrictionRule>() as RestrictionRuleStore,
      }),
    ]);
    require.mockRejectedValue(
      new AuthorizationDeniedError({
        effect: 'deny',
        reasons: [{ code: 'DENIED', message: 'Not allowed' }],
      }),
    );

    const response = await call(path);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each([
    {
      path: '/sharing-rules',
      body: { key: 'broken', resource: { type: 'x', id: 'y' } },
    },
    {
      path: '/restriction-rules',
      body: {
        key: 'broken',
        resource: { type: 'x', id: 'y' },
        subjects: [],
        actions: 'all',
      },
    },
    { path: '/default-access', body: { resource: { type: 'x', id: 'y' } } },
  ])('answers 400 for a malformed $path body', async ({ path, body }) => {
    const { call } = fixture([
      defaultAccess({ store: new MemoryDefaultAccessStore() }),
      sharingRules({
        store: new MemoryRuleStore<SharingRule>() as SharingRuleStore,
      }),
      restrictionRules({
        store: new MemoryRuleStore<RestrictionRule>() as RestrictionRuleStore,
      }),
    ]);

    const response = await call(
      path,
      json(path === '/default-access' ? 'PUT' : 'POST', body),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_AUTHORIZATION_INPUT',
    });
  });
});

describe('the routes an Authorization instance collected', () => {
  it('lists what its plugins registered', () => {
    const authz = createAuthorization({
      plugins: [
        defaultAccess({ store: new MemoryDefaultAccessStore() }),
        sharingRules({
          store: new MemoryRuleStore<SharingRule>() as SharingRuleStore,
        }),
      ],
    });

    expect(authz.routes.list()).toEqual([]);
  });

  it('refuses a path another plugin already registered', () => {
    const routes = new AuthorizationRouteRegistry();
    const handler = (): Promise<Response> =>
      Promise.resolve(new Response(null, { status: 204 }));
    routes.add('/sharing-rules', handler);

    expect(() => routes.add('/sharing-rules', handler)).toThrow(
      'Authorization route already registered: /sharing-rules',
    );
  });

  it('dispatches by path and answers nothing for a path nobody claims', async () => {
    const routes = new AuthorizationRouteRegistry();
    routes.add('/sharing-rules', (input) =>
      Promise.resolve(Response.json({ url: input.request.url })),
    );
    const request = (path: string): Request =>
      new Request(`http://app${BASE_PATH}${path}`);
    const authorization = { require: () => Promise.resolve() };

    const matched = routes.handle({
      request: request('/sharing-rules/orders'),
      path: '/sharing-rules/orders',
      authorization,
    });
    expect(await (await matched!).json()).toEqual({
      url: `http://app${BASE_PATH}/sharing-rules/orders`,
    });
    expect(
      routes.handle({
        request: request('/restriction-rules'),
        path: '/restriction-rules',
        authorization,
      }),
    ).toBeUndefined();
  });
});

function fixture(
  plugins: Parameters<typeof createAuthorization>[0]['plugins'],
): {
  authz: Authorization;
  require: ReturnType<typeof vi.fn>;
  call(path: string, init?: RequestInit): Promise<Response>;
} {
  const authz = createAuthorization({ plugins });
  for (const plugin of plugins) {
    const api = plugin.authorizationApi;
    if (api && 'defaultAccess' in api)
      authz.routes.add(
        '/default-access',
        createDefaultAccessHandler(
          api.defaultAccess as Parameters<typeof createDefaultAccessHandler>[0],
        ),
      );
    if (api && 'sharingRules' in api)
      authz.routes.add(
        '/sharing-rules',
        createSharingRulesHandler(
          api.sharingRules as Parameters<typeof createSharingRulesHandler>[0],
        ),
      );
    if (api && 'restrictionRules' in api)
      authz.routes.add(
        '/restriction-rules',
        createRestrictionRulesHandler(
          api.restrictionRules as Parameters<
            typeof createRestrictionRulesHandler
          >[0],
        ),
      );
  }
  const require = vi.fn(() => Promise.resolve());
  return {
    authz,
    require,
    async call(path: string, init?: RequestInit): Promise<Response> {
      const response = authz.routes.handle({
        request: new Request(`http://app${BASE_PATH}${path}`, init),
        path,
        authorization: { require },
      });
      if (!response) throw new Error(`No Authorization route serves ${path}`);
      return response;
    },
  };
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

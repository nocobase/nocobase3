import { describe, expect, it, vi } from 'vitest';
import {
  compositesPlugin,
  createAuthorization,
  selection,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import {
  databasePlugin,
  settingsPlugin,
} from '@nocobase/app-plugin-authorization/server';
import {
  defaultAccessPlugin,
  type DefaultAccessRule,
  type DefaultAccessStore,
} from '@nocobase/authorization/default-access';
import { createDefaultAccessHandler } from '../server/handler.js';

const rule: DefaultAccessRule = {
  key: 'orders-default',
  resource: { type: 'database.collection', id: 'orders' },
  actions: [{ action: 'read', selection: selection.all() }],
};

function host() {
  const database = databasePlugin();
  const authz = createAuthorization({
    plugins: [
      {
        id: 'grants',
        grants: { resolve: async () => [], resolveAll: async () => [] },
      },
      settingsPlugin(),
      compositesPlugin(),
      database,
    ],
  });
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  return authz;
}

describe('Default Access management handler', () => {
  it('creates, lists, updates and deletes a rule with settings checks', async () => {
    const rules = new Map<string, DefaultAccessRule>();
    const api = {
      list: async () => [...rules.values()],
      get: async (key: string) => rules.get(key),
      create: async (value: DefaultAccessRule) => {
        rules.set(value.key, value);
        return value;
      },
      update: async (key: string, value: DefaultAccessRule) => {
        rules.delete(key);
        rules.set(value.key, value);
        return value;
      },
      delete: async (key: string) => {
        rules.delete(key);
      },
    };
    const handler = createDefaultAccessHandler(host(), api);
    const require = vi.fn(async () => {});
    const call = (path: string, init?: RequestInit) =>
      handler({
        request: new Request(`http://app/api/authz${path}`, init),
        path,
        authorization: { require } as unknown as AuthorizationContext,
      });
    const json = (method: string, body: unknown): RequestInit => ({
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect((await call('/default-access', json('POST', rule))).status).toBe(
      201,
    );
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'settings', id: 'authorization.default-access' },
      action: 'create',
    });
    expect(await (await call('/default-access')).json()).toEqual({
      data: [rule],
    });
    const updated = {
      ...rule,
      actions: [{ action: 'read', selection: selection.records(['o1']) }],
    };
    expect(
      (await call('/default-access/orders-default', json('PUT', updated)))
        .status,
    ).toBe(200);
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'settings', id: 'authorization.default-access' },
      action: 'update',
    });
    expect(
      (await call('/default-access/missing', json('PUT', updated))).status,
    ).toBe(404);
    expect(
      (await call('/default-access/orders-default', { method: 'DELETE' }))
        .status,
    ).toBe(204);
    expect(rules.size).toBe(0);
  });

  it('rejects malformed rules and rules outside the model', async () => {
    const handler = createDefaultAccessHandler(host(), {
      list: async () => [],
      get: async () => undefined,
      create: async (value) => value,
      update: async (_key, value) => value,
      delete: async () => {},
    });
    const post = (body: unknown) =>
      handler({
        request: new Request('http://app/api/authz/default-access', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        path: '/default-access',
        authorization: {
          require: vi.fn(async () => {}),
        } as unknown as AuthorizationContext,
      });
    expect((await post({ resource: { type: 'x', id: 'y' } })).status).toBe(400);
    expect(
      (
        await post({
          ...rule,
          resource: { type: 'database.collection', id: 'invoices' },
        })
      ).status,
    ).toBe(400);
  });

  it('answers 409 for a second rule on the same resource', async () => {
    const rules = new Map<string, DefaultAccessRule>();
    const store: DefaultAccessStore<unknown> = {
      list: async () => [...rules.values()],
      get: async (key) => rules.get(key),
      create: async (value) => {
        rules.set(value.key, value);
        return value;
      },
      update: async (key, value) => {
        rules.delete(key);
        rules.set(value.key, value);
        return value;
      },
      delete: async (key) => {
        rules.delete(key);
      },
      withTransaction: () => store,
    };
    const api = defaultAccessPlugin({ store }).authorizationApi.defaultAccess;
    const handler = createDefaultAccessHandler(host(), api);
    const send = (path: string, method: string, body: unknown) =>
      handler({
        request: new Request(`http://app/api/authz${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        path,
        authorization: {
          require: vi.fn(async () => {}),
        } as unknown as AuthorizationContext,
      });
    expect((await send('/default-access', 'POST', rule)).status).toBe(201);
    const second = await send('/default-access', 'POST', {
      ...rule,
      key: 'orders-again',
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      code: 'DEFAULT_ACCESS_CONFLICT',
    });
    // Updating the rule in place, even under a new key, is not a conflict.
    expect(
      (
        await send('/default-access/orders-default', 'PUT', {
          ...rule,
          key: 'orders-renamed',
        })
      ).status,
    ).toBe(200);
    expect([...rules.keys()]).toEqual(['orders-renamed']);
  });
});

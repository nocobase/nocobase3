import { describe, expect, it, vi } from 'vitest';
import {
  createAuthorization,
  selection,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import {
  databasePlugin,
  settingsPlugin,
} from '@nocobase/app-plugin-authorization/server';
import type { RestrictionRule } from '@nocobase/authorization/restriction-rules';
import { createRestrictionRulesHandler } from '../server/handler.js';

const rule: RestrictionRule = {
  key: 'orders-default',
  title: 'Orders rule',
  resource: { type: 'database.collection', id: 'orders' },
  subjects: [{ type: 'user', id: 'alice' }],
  actions: [{ action: 'read', selection: selection.records(['o1']) }],
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
      database,
    ],
  });
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  return authz;
}

describe('RestrictionRules management handler', () => {
  it('creates, lists, updates and deletes a rule with settings checks', async () => {
    const rules = new Map<string, RestrictionRule>();
    const api = {
      list: async () => [...rules.values()],
      get: async (key: string) => rules.get(key),
      create: async (value: RestrictionRule) => {
        rules.set(value.key, value);
        return value;
      },
      update: async (key: string, value: RestrictionRule) => {
        rules.delete(key);
        rules.set(value.key, value);
        return value;
      },
      delete: async (key: string) => {
        rules.delete(key);
      },
    };
    const handler = createRestrictionRulesHandler(host(), api);
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

    expect((await call('/restriction-rules', json('POST', rule))).status).toBe(
      201,
    );
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'settings', id: 'authorization.restriction-rules' },
      action: 'create',
    });
    expect(await (await call('/restriction-rules')).json()).toEqual({
      data: [rule],
    });
    const updated = {
      ...rule,
      actions: [{ action: 'read', selection: selection.records(['o1']) }],
    };
    expect(
      (await call('/restriction-rules/orders-default', json('PUT', updated)))
        .status,
    ).toBe(200);
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'settings', id: 'authorization.restriction-rules' },
      action: 'update',
    });
    expect(
      (await call('/restriction-rules/missing', json('PUT', updated))).status,
    ).toBe(404);
    expect(
      (await call('/restriction-rules/orders-default', { method: 'DELETE' }))
        .status,
    ).toBe(204);
    expect(rules.size).toBe(0);
  });

  it('rejects malformed rules and rules outside the model', async () => {
    const handler = createRestrictionRulesHandler(host(), {
      list: async () => [],
      get: async () => undefined,
      create: async (value) => value,
      update: async (_key, value) => value,
      delete: async () => {},
    });
    const post = (body: unknown) =>
      handler({
        request: new Request('http://app/api/authz/restriction-rules', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        path: '/restriction-rules',
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
});

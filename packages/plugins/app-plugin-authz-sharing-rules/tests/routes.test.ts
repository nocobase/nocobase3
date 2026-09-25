import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  selection,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { sharingRules } from '../server/authorization.js';

const PATH = '/sharing-rules';
const SETTINGS = { type: 'settings', id: 'authorization.sharing-rules' };

class MemoryStore {
  readonly rules = new Map<string, SharingRule>();
  list = async () => [...this.rules.values()];
  get = async (key: string) => this.rules.get(key);
  create = async (rule: SharingRule) => {
    this.rules.set(rule.key, rule);
    return rule;
  };
  update = async (key: string, rule: SharingRule) => {
    this.rules.delete(key);
    this.rules.set(rule.key, rule);
    return rule;
  };
  delete = async (key: string) => {
    this.rules.delete(key);
  };
  withTransaction = () => this;
}

const rule: SharingRule = {
  key: 'orders-rule',
  resource: { type: 'database.collection', id: 'orders' },
  actions: [{ action: 'read', selection: selection.records(['o1']) }],
  subjects: [{ type: 'user', id: 'alice' }],
};

function fixture(permitted = true) {
  const store = new MemoryStore();
  const authz = createAppAuthorization({
    config: { plugins: [sharingRules({ store })] },
  });
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  const require = vi.fn(async () => {
    if (!permitted)
      throw new AuthorizationDeniedError({ effect: 'deny', reasons: [] });
  });
  const call = async (path: string, init?: RequestInit): Promise<Response> => {
    const response = await authz.routes.handle({
      request: new Request(`http://app/api/authz${path}`, init),
      path,
      authorization: { require } as unknown as AuthorizationContext,
    });
    if (!response) throw new Error(`No route answered ${path}`);
    return response;
  };
  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { authz, store, require, call, json };
}

describe('sharing rules through the authorization dispatcher', () => {
  it('registers its settings item and route', () => {
    const { authz } = fixture();
    expect(
      authz.resourceTypes.get('settings').items?.get(SETTINGS.id),
    ).toMatchObject({
      actions: ['read', 'create', 'update', 'delete'].map((name) =>
        expect.objectContaining({ name }),
      ),
    });
    expect(authz.ui.placementOf(SETTINGS)).toEqual({
      section: 'authorization',
    });
    expect(authz.routes.list()).toContain(PATH);
    expect('sharingRules' in authz).toBe(true);
  });

  it('gates every route on its own settings item', async () => {
    const { call, require } = fixture();
    for (const path of [PATH, `${PATH}/options`, `${PATH}/records/orders`]) {
      expect((await call(path)).status).toBe(200);
      expect(require).toHaveBeenLastCalledWith({
        resource: SETTINGS,
        action: 'read',
      });
    }
    expect((await call(`${PATH}/subjects/user`)).status).toBe(404);
  });

  it('answers 403 when the settings check fails', async () => {
    const { call } = fixture(false);
    expect((await call(PATH)).status).toBe(403);
    expect((await call(`${PATH}/options`)).status).toBe(403);
  });

  it('creates, lists, updates and deletes a rule with settings checks', async () => {
    const { call, json, require, store } = fixture();

    expect((await call(PATH, json('POST', rule))).status).toBe(201);
    expect(require).toHaveBeenLastCalledWith({
      resource: SETTINGS,
      action: 'create',
    });
    expect(await (await call(PATH)).json()).toEqual({ data: [rule] });
    const updated = {
      ...rule,
      actions: [{ action: 'read', selection: selection.records(['o2']) }],
    };
    expect(
      (await call(`${PATH}/orders-rule`, json('PUT', updated))).status,
    ).toBe(200);
    expect(require).toHaveBeenLastCalledWith({
      resource: SETTINGS,
      action: 'update',
    });
    expect((await call(`${PATH}/missing`, json('PUT', updated))).status).toBe(
      404,
    );
    expect(
      (await call(`${PATH}/orders-rule`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect(require).toHaveBeenLastCalledWith({
      resource: SETTINGS,
      action: 'delete',
    });
    expect(store.rules.size).toBe(0);
  });

  it('rejects malformed rules and rules outside the model', async () => {
    const { call, json } = fixture();
    expect(
      (await call(PATH, json('POST', { resource: { type: 'x', id: 'y' } })))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          PATH,
          json('POST', {
            ...rule,
            resource: { type: 'database.collection', id: 'invoices' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('refuses a rule that selects all records', async () => {
    const { call, json } = fixture();
    const response = await call(
      PATH,
      json('POST', {
        ...rule,
        actions: [{ action: 'read', selection: selection.all() }],
      }),
    );
    expect(response.status).toBe(400);
  });

  it('persists a translated title until it is renamed, and refuses a malformed one', async () => {
    const { call, json } = fixture();
    const title = { key: 'rules.handover', ns: '@nocobase/test' };

    const created = await call(PATH, json('POST', { ...rule, title }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ data: { title } });
    const [saved] = (await (await call(PATH)).json()).data;
    const updated = await call(`${PATH}/orders-rule`, json('PUT', saved));
    expect(await updated.json()).toMatchObject({ data: { title } });
    await call(
      `${PATH}/orders-rule`,
      json('PUT', { ...saved, title: 'My custom title' }),
    );
    expect(await (await call(PATH)).json()).toMatchObject({
      data: [{ key: 'orders-rule', title: 'My custom title' }],
    });
    expect(
      (
        await call(
          PATH,
          json('POST', {
            ...rule,
            key: 'invalid-title',
            title: { key: 'missing-namespace' },
          }),
        )
      ).status,
    ).toBe(400);
  });
});

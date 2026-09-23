import { describe, expect, it, vi } from 'vitest';
import { createRestrictionRulesHandler } from '../server/handler.js';

const rule = {
  key: 'orders-rule',
  title: 'Orders rule',
  resource: { type: 'database.collection', id: 'main.orders' },
  subjects: [{ type: 'user', id: 'alice' }],
  actions: [{ action: 'read', scope: { type: 'ids', ids: ['1'] } }],
};

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('Restriction Rules management handler', () => {
  it('creates, lists, updates, and deletes a rule with settings checks', async () => {
    const rules = new Map<string, typeof rule>();
    const api = {
      list: async () => [...rules.values()],
      get: async (key: string) => rules.get(key),
      create: async (value: typeof rule) => {
        rules.set(value.key, value);
        return value;
      },
      update: async (key: string, value: typeof rule) => {
        rules.set(key, value);
        return value;
      },
      delete: async (key: string) => {
        rules.delete(key);
      },
    } as unknown as Parameters<typeof createRestrictionRulesHandler>[0];
    const handler = createRestrictionRulesHandler(api);
    const require = vi.fn(async () => {});
    const call = (suffix = '', init?: RequestInit) =>
      handler({
        request: new Request(
          `http://app/api/authz/restriction-rules${suffix}`,
          init,
        ),
        path: '/restriction-rules' + suffix,
        authorization: { require },
      });

    const created = await call('', json('POST', rule));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ data: rule });
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'settings', id: 'authorization.restriction-rules' },
      action: 'create',
    });
    expect(await (await call()).json()).toEqual({ data: [rule] });
    const updated = { ...rule, title: 'Renamed' };
    expect((await call('/orders-rule', json('PUT', updated))).status).toBe(200);
    expect(rules.get('orders-rule')).toEqual(updated);
    expect((await call('/orders-rule', { method: 'DELETE' })).status).toBe(204);
    expect(rules.size).toBe(0);
  });

  it('rejects malformed rules', async () => {
    const handler = createRestrictionRulesHandler(
      {} as Parameters<typeof createRestrictionRulesHandler>[0],
    );
    const response = await handler({
      request: new Request(
        'http://app/api/authz/restriction-rules',
        json('POST', { key: 'broken', resource: { type: 'x', id: 'y' } }),
      ),
      path: '/restriction-rules',
      authorization: { require: vi.fn(async () => {}) },
    });
    expect(response.status).toBe(400);
  });
});

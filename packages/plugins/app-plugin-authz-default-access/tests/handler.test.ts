import { describe, expect, it, vi } from 'vitest';
import { createDefaultAccessHandler } from '../server/handler.js';

const rule = {
  resource: { type: 'database.collection', id: 'main.orders' },
  actions: [{ action: 'read', scope: { type: 'all' } }],
};

describe('Default Access management handler', () => {
  it('sets, lists, and deletes a rule with settings checks', async () => {
    const rules = new Map<string, typeof rule>();
    const api = {
      list: async () => [...rules.values()],
      get: async (_type: string, id: string) => rules.get(id),
      set: async (value: typeof rule) => {
        rules.set(value.resource.id, value);
        return value;
      },
      delete: async (_type: string, id: string) => {
        rules.delete(id);
      },
    } as unknown as Parameters<typeof createDefaultAccessHandler>[0];
    const handler = createDefaultAccessHandler(api);
    const require = vi.fn(async () => {});
    const call = (path: string, init?: RequestInit) =>
      handler({
        request: new Request(`http://app/api/authz${path}`, init),
        path,
        authorization: { require },
      });

    const created = await call('/default-access', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rule),
    });
    expect(created.status).toBe(200);
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'settings', id: 'authorization.default-access' },
      action: 'configure',
    });
    expect(await (await call('/default-access')).json()).toEqual({
      data: [rule],
    });
    expect(
      (
        await call('/default-access/database.collection/main.orders', {
          method: 'DELETE',
        })
      ).status,
    ).toBe(204);
    expect(rules.size).toBe(0);
  });

  it('rejects malformed rules', async () => {
    const handler = createDefaultAccessHandler(
      {} as Parameters<typeof createDefaultAccessHandler>[0],
    );
    const response = await handler({
      request: new Request('http://app/api/authz/default-access', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resource: { type: 'x', id: 'y' } }),
      }),
      path: '/default-access',
      authorization: { require: vi.fn(async () => {}) },
    });
    expect(response.status).toBe(400);
  });
});

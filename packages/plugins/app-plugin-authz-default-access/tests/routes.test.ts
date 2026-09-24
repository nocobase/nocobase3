import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import type { DefaultAccessRule } from '@nocobase/authorization/default-access';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { defaultAccess } from '../server/authorization.js';

class MemoryStore {
  rules: DefaultAccessRule[] = [];
  list = async () => this.rules;
  get = async (key: string) => this.rules.find((rule) => rule.key === key);
  create = async (rule: DefaultAccessRule) => {
    this.rules.push(rule);
    return rule;
  };
  update = async (_key: string, rule: DefaultAccessRule) => rule;
  delete = async () => {};
  withTransaction = () => this;
}

function fixture(permitted = true) {
  const authz = createAppAuthorization({
    config: { plugins: [defaultAccess({ store: new MemoryStore() })] },
  });
  const require = vi.fn(async () => {
    if (!permitted)
      throw new AuthorizationDeniedError({ effect: 'deny', reasons: [] });
  });
  const call = (path: string, init?: RequestInit) =>
    authz.routes.handle({
      request: new Request(`http://app/api/authz${path}`, init),
      path,
      authorization: { require } as unknown as AuthorizationContext,
    });
  return { authz, require, call };
}

describe('default access through the authorization dispatcher', () => {
  it('registers its settings item and route', () => {
    const { authz } = fixture();
    expect(
      authz.resourceTypes
        .get('settings')
        .items?.get('authorization.default-access'),
    ).toMatchObject({
      actions: ['read', 'create', 'update', 'delete'].map((name) =>
        expect.objectContaining({ name }),
      ),
    });
    expect(
      authz.ui.placementOf({
        type: 'settings',
        id: 'authorization.default-access',
      }),
    ).toEqual({ section: 'authorization' });
    expect(authz.routes.list()).toContain('/default-access');
    expect('defaultAccess' in authz).toBe(true);
  });

  it('gates every route on its own settings item', async () => {
    const { call, require } = fixture();
    for (const path of [
      '/default-access',
      '/default-access/options',
      '/default-access/records/orders',
    ]) {
      const response = await call(path);
      expect(response?.status).toBe(200);
      expect(require).toHaveBeenLastCalledWith({
        resource: { type: 'settings', id: 'authorization.default-access' },
        action: 'read',
      });
    }
    expect((await call('/default-access/subjects/user'))?.status).toBe(404);
  });

  it('answers 403 when the settings check fails', async () => {
    const { call } = fixture(false);
    expect((await call('/default-access'))?.status).toBe(403);
    expect((await call('/default-access/options'))?.status).toBe(403);
  });
});

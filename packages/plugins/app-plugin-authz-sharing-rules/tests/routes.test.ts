import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { sharingRules } from '../server/authorization.js';

class MemoryStore {
  rules: SharingRule[] = [];
  list = async () => this.rules;
  get = async (key: string) => this.rules.find((rule) => rule.key === key);
  create = async (rule: SharingRule) => {
    this.rules.push(rule);
    return rule;
  };
  update = async (_key: string, rule: SharingRule) => rule;
  delete = async () => {};
  withTransaction = () => this;
}

function fixture(permitted = true) {
  const authz = createAppAuthorization({
    config: { plugins: [sharingRules({ store: new MemoryStore() })] },
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

describe('sharing rules through the authorization dispatcher', () => {
  it('registers its settings item and route', () => {
    const { authz } = fixture();
    expect(
      authz.resourceTypes
        .get('settings')
        .items?.get('authorization.sharing-rules'),
    ).toMatchObject({
      section: 'authorization',
      actions: ['read', 'create', 'update', 'delete'].map((name) =>
        expect.objectContaining({ name }),
      ),
    });
    expect(authz.routes.list()).toContain('/sharing-rules');
    expect('sharingRules' in authz).toBe(true);
  });

  it('gates every route on its own settings item', async () => {
    const { call, require } = fixture();
    for (const path of [
      '/sharing-rules',
      '/sharing-rules/options',
      '/sharing-rules/records/orders',
    ]) {
      const response = await call(path);
      expect(response?.status).toBe(200);
      expect(require).toHaveBeenLastCalledWith({
        resource: { type: 'settings', id: 'authorization.sharing-rules' },
        action: 'read',
      });
    }
    expect((await call('/sharing-rules/subjects/user'))?.status).toBe(404);
  });

  it('answers 403 when the settings check fails', async () => {
    const { call } = fixture(false);
    expect((await call('/sharing-rules'))?.status).toBe(403);
    expect((await call('/sharing-rules/options'))?.status).toBe(403);
  });

  it('refuses a rule that selects all records', async () => {
    const { authz, call } = fixture();
    authz.database.collections.add({ name: 'orders', title: 'Orders' });
    const response = await call('/sharing-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'everything',
        resource: { type: 'database.collection', id: 'orders' },
        subjects: [{ type: 'user', id: 'alice' }],
        actions: [{ action: 'read', selection: { type: 'all' } }],
      }),
    });
    expect(response?.status).toBe(400);
  });
});

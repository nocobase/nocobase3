import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import type { RestrictionRule } from '@nocobase/authorization/restriction-rules';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { restrictionRules } from '../server/authorization.js';

class MemoryStore {
  rules: RestrictionRule[] = [];
  list = async () => this.rules;
  get = async (key: string) => this.rules.find((rule) => rule.key === key);
  create = async (rule: RestrictionRule) => {
    this.rules.push(rule);
    return rule;
  };
  update = async (_key: string, rule: RestrictionRule) => rule;
  delete = async () => {};
  withTransaction = () => this;
}

function fixture(permitted = true) {
  const authz = createAppAuthorization({
    config: { plugins: [restrictionRules({ store: new MemoryStore() })] },
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

describe('restriction rules through the authorization dispatcher', () => {
  it('registers its settings item and route', () => {
    const { authz } = fixture();
    expect(
      authz.resourceTypes
        .get('settings')
        .items?.get('authorization.restriction-rules'),
    ).toMatchObject({
      group: 'authorization',
      actions: ['read', 'create', 'update', 'delete'].map((name) =>
        expect.objectContaining({ name }),
      ),
    });
    expect(authz.routes.list()).toContain('/restriction-rules');
    expect('restrictionRules' in authz).toBe(true);
  });

  it('gates every route on its own settings item', async () => {
    const { call, require } = fixture();
    for (const path of [
      '/restriction-rules',
      '/restriction-rules/options',
      '/restriction-rules/records/orders',
    ]) {
      const response = await call(path);
      expect(response?.status).toBe(200);
      expect(require).toHaveBeenLastCalledWith({
        resource: { type: 'settings', id: 'authorization.restriction-rules' },
        action: 'read',
      });
    }
    expect((await call('/restriction-rules/subjects/user'))?.status).toBe(404);
  });

  it('answers 403 when the settings check fails', async () => {
    const { call } = fixture(false);
    expect((await call('/restriction-rules'))?.status).toBe(403);
    expect((await call('/restriction-rules/options'))?.status).toBe(403);
  });

  it('accepts a rule that selects all records', async () => {
    const { authz, call } = fixture();
    authz.database.collections.add({ name: 'orders', title: 'Orders' });
    const response = await call('/restriction-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'everything',
        resource: { type: 'database.collection', id: 'orders' },
        subjects: [{ type: 'user', id: 'alice' }],
        actions: [{ action: 'read', selection: { type: 'all' } }],
      }),
    });
    expect(response?.status).toBe(201);
  });
});

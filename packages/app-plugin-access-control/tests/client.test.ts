import { createAppClient } from '@nocobase/app-sdk';
import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import { registerAppAccessControlSettingsModules } from '../client/bootstrap.js';
import { createAppAccessControlClient } from '../client/api.js';
import {
  getOrCreateAppSettingsModuleRegistry,
  registerDefaultAppSettingsModules,
} from '@nocobase/app-plugin-settings/client';

describe('@nocobase/app-plugin-access-control client', () => {
  it('replaces the three access placeholders with real shared pages', async () => {
    const appClient = createAppClient({ fetch: async () => new Response() });
    registerDefaultAppSettingsModules(appClient);
    await bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-access-control',
      source: 'plugin',
      refine: {} as never,
    });

    const registry = getOrCreateAppSettingsModuleRegistry(appClient);
    expect(
      ['users', 'roles', 'permissions'].map((id) => registry.get(id)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: '已接入', placeholder: false }),
      ]),
    );
    expect(
      ['users', 'roles', 'permissions'].every(
        (id) => typeof registry.get(id)?.pageLoader === 'function',
      ),
    ).toBe(true);
  });

  it('uses the current App API instead of a Hub or cross-App endpoint', async () => {
    const calls: string[] = [];
    const appClient = createAppClient({
      baseURL: 'http://app.test/api',
      fetch: async (input) => {
        calls.push(String(input));
        return Response.json({ data: [] });
      },
    });
    const access = createAppAccessControlClient(appClient);
    await access.fetchMembers();
    await access.fetchRoles();
    expect(calls).toEqual([
      'http://app.test/api/settings/members',
      'http://app.test/api/settings/roles',
    ]);
  });

  it('can register the same shared pages for an application compatibility layer', () => {
    const appClient = createAppClient({ fetch: async () => new Response() });
    registerDefaultAppSettingsModules(appClient);
    registerAppAccessControlSettingsModules(appClient);

    const registry = getOrCreateAppSettingsModuleRegistry(appClient);
    expect(registry.get('users')?.packageName).toBe(
      '@nocobase/app-plugin-access-control',
    );
    expect(registry.get('permissions')?.pageLoader).toBeTypeOf('function');
  });
});

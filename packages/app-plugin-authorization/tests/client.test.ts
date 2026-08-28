import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import settings from '../client/settings.js';
import { firstActions } from '../client/components/rule-utils.js';

describe('@nocobase/app-plugin-authorization client', () => {
  it('contributes its administration pages to the settings centre', () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(settings).toMatchObject([
      {
        id: 'authorization/permission-sets',
        title: 'Permission Sets',
        group: 'Authorization',
        access: {
          resource: 'authorization.settings.permission-sets',
          action: 'read',
        },
      },
      { id: 'authorization/default-access', title: 'Default Access' },
      { id: 'authorization/sharing-rules', title: 'Sharing Rules' },
      { id: 'authorization/restriction-rules', title: 'Restriction Rules' },
    ]);
    expect(settings.every((setting) => setting.pageLoader)).toBe(true);
    expect(providers).toEqual([]);
  });

  it('keeps every administration page at the URL it was published at', () => {
    expect(
      resolveAppClientContributions([
        { packageName: '@nocobase/app-plugin-authorization', settings },
      ]).settings.map((setting) => setting.path),
    ).toEqual([
      '/settings/authorization/permission-sets',
      '/settings/authorization/default-access',
      '/settings/authorization/sharing-rules',
      '/settings/authorization/restriction-rules',
    ]);
  });

  it('uses CRUD order when choosing the initial action', () => {
    expect(
      firstActions(
        {
          plugins: ['database'],
          resourceTypes: [
            {
              value: 'database.collection',
              label: 'Collections',
              resources: [],
              actions: [
                { value: 'delete', label: 'Delete' },
                { value: 'update', label: 'Update' },
                { value: 'read', label: 'Read' },
              ],
            },
          ],
          subjectTypes: [],
          collections: [],
          recordAccessPolicies: [],
        },
        'database.collection',
      ),
    ).toEqual(['read']);
  });

  it('uses actions declared by the selected resource', () => {
    expect(
      firstActions(
        {
          plugins: [],
          resourceTypes: [
            {
              value: 'authorization.settings',
              label: 'Settings',
              resources: [
                {
                  value: 'audit-log',
                  label: 'Audit Log',
                  actions: [{ value: 'read', label: 'Read' }],
                },
              ],
              actions: [
                { value: 'create', label: 'Create' },
                { value: 'read', label: 'Read' },
              ],
            },
          ],
          subjectTypes: [],
          collections: [],
          recordAccessPolicies: [],
        },
        'authorization.settings',
        'audit-log',
      ),
    ).toEqual(['read']);
  });
});

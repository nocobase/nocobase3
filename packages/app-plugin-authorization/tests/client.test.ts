import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import settings from '../client/settings.js';
import { firstActions } from '../client/components/rule-utils.js';

describe('@nocobase/app-plugin-authorization client', () => {
  it('contributes its administration pages as one settings group', () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(settings).toMatchObject([
      { id: 'authorization', title: 'Authorization' },
    ]);
    expect(providers).toEqual([]);
  });

  it('keeps every administration page at the URL it was published at', () => {
    const resolved = resolveAppClientContributions([
      { packageName: '@nocobase/app-plugin-authorization', settings },
    ]);

    expect(resolved.settings.map((setting) => setting.path)).toEqual([
      '/settings/authorization/permission-sets',
      '/settings/authorization/default-access',
      '/settings/authorization/sharing-rules',
      '/settings/authorization/restriction-rules',
    ]);
    expect(
      resolved.settings.map((setting) => setting.access?.resource),
    ).toEqual([
      'authorization.settings.permission-sets',
      'authorization.settings.default-access',
      'authorization.settings.sharing-rules',
      'authorization.settings.restriction-rules',
    ]);
    // The group and every page carry an icon, so the navigation never falls back to a bare row. A lucide icon is a
    // forwardRef object rather than a plain function, so this checks for a renderable rather than for a typeof.
    expect(resolved.settingGroups[0].icon).toBeTruthy();
    expect(resolved.settings.every((setting) => Boolean(setting.icon))).toBe(
      true,
    );
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

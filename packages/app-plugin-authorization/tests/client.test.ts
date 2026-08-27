import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import routes from '../client/routes.js';
import { firstActions } from '../client/components/rule-utils.js';

describe('@nocobase/app-plugin-authorization client', () => {
  it('registers its client bootstrap and settings route', () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(routes).toMatchObject([
      {
        name: 'permission-sets',
        path: '/settings/authorization/permission-sets',
      },
      { name: 'default-access' },
      { name: 'sharing-rules' },
      { name: 'restriction-rules' },
    ]);
    expect(providers).toEqual([]);
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

import { expect, it } from 'vitest';
import { ResourceItems } from '@nocobase/authorization/core';
import { createAppAuthorization } from '../server/index.js';
import { authorizationOptions } from '../server/options.js';

it('lists sections in order and every displayed type, but no hidden type', async () => {
  const authz = createAppAuthorization({});
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  const custom = new ResourceItems();
  authz.resourceTypes.add({ type: 'custom', title: 'Custom', items: custom });
  custom.add({ id: 'one', title: 'One', actions: ['read'] });
  authz.resourceTypes.add({
    type: 'hub.app',
    title: 'Apps',
    section: 'administration',
    actions: ['read'],
  });
  const options = await authorizationOptions(authz);
  expect(options.sections.map((section) => section.name)).toEqual([
    'pages',
    'business',
    'administration',
  ]);
  expect(options.resourceTypes.map((type) => type.type)).toEqual([
    'business',
    'hub.app',
    'page',
    'settings',
  ]);
  expect(
    options.resourceTypes.find((type) => type.type === 'page'),
  ).toMatchObject({
    section: 'pages',
    items: [],
    actions: [{ name: 'access' }],
  });
  expect(
    options.resourceTypes
      .find((type) => type.type === 'settings')
      ?.items.map((item) => item.id),
  ).toEqual(['authorization.permission-sets', 'authorization.inspector']);
  expect(
    options.resourceTypes.find((type) => type.type === 'settings')?.groups,
  ).toEqual([
    {
      name: 'authorization',
      title: expect.objectContaining({
        key: 'options.settingsModules.authorization',
      }),
    },
  ]);
});

it('describes business data scopes and narrows rule options to them', async () => {
  const authz = createAppAuthorization({});
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  authz.groups.add({ name: 'sales', title: 'Sales' });
  expect(
    (await authorizationOptions(authz, { rules: true })).resourceTypes,
  ).toEqual([]);
  const title = { key: 'sales.title', ns: 'example' };
  const actionTitle = { key: 'sales.view', ns: 'example' };
  authz.business.define({
    name: 'sales.orders',
    title,
    group: 'sales',
    actions: [
      {
        name: 'view',
        title: actionTitle,
        dataScopes: [
          {
            key: 'orders',
            title: 'Orders',
            collection: 'orders',
            options: ['recordsIOwn', 'allRecords'],
          },
        ],
        grants: [
          {
            resource: { type: 'database.collection', id: 'orders' },
            actions: [
              {
                action: 'read',
                policy: { type: 'database' },
                scopeKey: 'orders',
              },
            ],
          },
        ],
      },
      {
        name: 'export',
        title: 'Export',
        grants: [
          {
            resource: { type: 'database.collection', id: 'orders' },
            actions: [{ action: 'read', policy: { type: 'database' } }],
          },
        ],
      },
    ],
  });
  const options = await authorizationOptions(authz);
  const business = options.resourceTypes.find(
    (type) => type.type === 'business',
  );
  expect(business).toMatchObject({
    section: 'business',
    groups: [{ name: 'sales', title: 'Sales' }],
    items: [
      {
        id: 'sales.orders',
        title: expect.objectContaining(title),
        group: 'sales',
        actions: [
          { name: 'view', title: expect.objectContaining(actionTitle) },
          { name: 'export', title: 'Export' },
        ],
        dataScopes: {
          view: [
            {
              key: 'orders',
              title: 'Orders',
              collection: 'orders',
              fields: [],
              recordAccess: ['allRecords'],
            },
          ],
        },
      },
    ],
  });
  const rules = await authorizationOptions(authz, { rules: true });
  expect(rules.resourceTypes.map((type) => type.type)).toEqual(['business']);
  expect(rules.recordAccess.map((entry) => entry.key)).toContain('recordsIOwn');
});

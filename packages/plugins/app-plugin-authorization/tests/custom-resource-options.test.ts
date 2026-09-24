import { expect, it } from 'vitest';
import { ResourceItems } from '@nocobase/authorization/core';
import { createAppAuthorization } from '../server/index.js';
import { authorizationOptions } from '../server/options.js';

const tree = (
  options: Awaited<ReturnType<typeof authorizationOptions>>,
): [string, string[]][] =>
  options.sections.map((section) => [
    section.name,
    section.subsections.map((subsection) => subsection.name),
  ]);

it('lists sections with their subsections, but no type without a default section', async () => {
  const authz = createAppAuthorization({});
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  const custom = new ResourceItems();
  authz.resourceTypes.add({ type: 'custom', title: 'Custom', items: custom });
  custom.add({ id: 'one', title: 'One', actions: ['read'] });
  authz.resourceTypes.add({
    type: 'hub.app',
    title: 'Apps',
    actions: ['read'],
  });
  authz.sections.add({
    name: 'automation',
    title: 'Automation',
    parent: 'administration',
  });
  authz.settings.add({
    id: 'workflow',
    title: 'Workflow',
    section: 'automation',
    actions: [{ name: 'manage' }],
  });
  authz.settings.add({
    id: 'misc',
    title: 'Misc',
    actions: [{ name: 'manage' }],
  });
  const options = await authorizationOptions(authz);
  expect(tree(options)).toEqual([
    ['pages', ['page']],
    ['business', []],
    ['administration', ['authorization', 'automation', 'administration.other']],
  ]);
  expect(options.sections[0]?.subsections[0]).toMatchObject({
    name: 'page',
    recordType: { type: 'page', actions: [{ name: 'access' }] },
    resources: [],
  });
  const administration = options.sections[2]!.subsections;
  expect(administration[0]).toMatchObject({
    name: 'authorization',
    title: expect.objectContaining({
      key: 'options.settingsModules.authorization',
    }),
  });
  expect(administration[0]?.resources.map((resource) => resource.id)).toEqual([
    'authorization.permission-sets',
    'authorization.inspector',
  ]);
  expect(administration[1]?.resources).toEqual([
    {
      type: 'settings',
      id: 'workflow',
      title: 'Workflow',
      actions: [{ name: 'manage', title: 'manage' }],
    },
  ]);
  // A resource without a subsection lands in its default section's "Other".
  expect(administration[2]).toMatchObject({
    title: expect.objectContaining({ key: 'sections.other' }),
    resources: [{ type: 'settings', id: 'misc' }],
  });
  expect(options.resourceGroups).toBeUndefined();
});

it('lists the resource groups the resources name, with their ancestors', async () => {
  const authz = createAppAuthorization({});
  authz.resourceGroups.add({ name: 'ledgers', title: 'Ledgers' });
  authz.resourceGroups.add({
    name: 'payables',
    title: 'Payables',
    parent: 'ledgers',
    order: 2,
  });
  authz.resourceGroups.add({ name: 'unused', title: 'Unused' });
  authz.settings.add({
    id: 'bills',
    title: 'Bills',
    actions: [{ name: 'manage' }],
  });
  authz.resourceTypes.get('settings').items?.add({
    id: 'invoices',
    title: 'Invoices',
    group: 'payables',
    actions: ['manage'],
  });
  const options = await authorizationOptions(authz);
  expect(options.resourceGroups).toEqual([
    { name: 'ledgers', title: 'Ledgers' },
    { name: 'payables', title: 'Payables', parent: 'ledgers', order: 2 },
  ]);
  expect(
    options.sections[2]?.subsections
      .flatMap((subsection) => subsection.resources)
      .find((resource) => resource.id === 'invoices'),
  ).toMatchObject({ group: 'payables' });
});

it('describes business data scopes and narrows rule options to them', async () => {
  const authz = createAppAuthorization({});
  authz.database.collections.add({ name: 'orders', title: 'Orders' });
  authz.sections.add({ name: 'sales', title: 'Sales', parent: 'business' });
  expect(tree(await authorizationOptions(authz, { rules: true }))).toEqual([
    ['pages', []],
    ['business', []],
    ['administration', []],
  ]);
  const title = { key: 'sales.title', ns: 'example' };
  const actionTitle = { key: 'sales.view', ns: 'example' };
  authz.business.define({
    name: 'sales.orders',
    title,
    section: 'sales',
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
  expect(options.sections[1]).toMatchObject({
    name: 'business',
    subsections: [
      {
        name: 'sales',
        title: 'Sales',
        resources: [
          {
            type: 'business',
            id: 'sales.orders',
            title: expect.objectContaining(title),
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
      },
    ],
  });
  const rules = await authorizationOptions(authz, { rules: true });
  expect(tree(rules)).toEqual([
    ['pages', []],
    ['business', ['sales']],
    ['administration', []],
  ]);
  expect(rules.recordAccess.map((entry) => entry.key)).toContain('recordsIOwn');
});

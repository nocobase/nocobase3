import type {
  AuthorizationOptions,
  LocalizedText,
} from '../client/authorization-client.js';
import { expect, it } from 'vitest';
import { createAppAuthorization } from '../server/index.js';
import {
  permissionSetOptions,
  databaseScopeRuleOptions,
} from '../server/routes/options.js';

it('exposes pages independently while keeping raw collections and custom handlers internal', async () => {
  const authz = createAppAuthorization({});
  authz.pages.add({ name: 'orders', title: 'Orders', actions: ['access'] });
  authz.db.collections.add('orders');
  authz.resourceTypes.add({
    resourceType: 'custom',
    authorize: async () => ({ effect: 'deny', reasons: [] }),
  });
  authz.getResource('custom').items.add({ id: 'one', actions: ['read'] });
  const title = { key: 'sales.title', ns: 'example' };
  const actionTitle = { key: 'sales.view', ns: 'example' };
  const assertSeparated = async () => {
    const options = (await permissionSetOptions(
      authz,
      undefined,
    )) as AuthorizationOptions<LocalizedText>;
    expect(options.resourceTypes.map((type) => type.value)).toEqual([
      'resource',
      'page',
    ]);
    expect(
      options.resourceTypes.find((type) => type.value === 'page')?.resources,
    ).toEqual([
      expect.objectContaining({
        value: 'orders',
        actions: [{ value: 'access', label: expect.anything() }],
      }),
    ]);
    expect(options.resourceTypes.map((type) => type.value)).not.toContain(
      'database.collection',
    );
    expect(options.resourceTypes.map((type) => type.value)).not.toContain(
      'custom',
    );
  };
  await assertSeparated();
  expect(
    (
      (await databaseScopeRuleOptions(
        authz,
        undefined,
      )) as AuthorizationOptions<LocalizedText>
    ).resourceTypes,
  ).toEqual([]);
  authz.resourceGroups.add({ name: 'sales', title: 'Sales' });
  await assertSeparated();
  authz.resources.add({
    name: 'sales.orders',
    title,
    group: 'sales',
    actions: [
      {
        name: 'view',
        title: actionTitle,
        scopes: {
          orders: {
            title: 'Orders',
            resource: { type: 'database.collection', id: 'orders' },
          },
        },
        grants: [authz.db.grant('orders', { read: { scope: 'orders' } })],
      },
    ],
  });
  const options = (await permissionSetOptions(
    authz,
    undefined,
  )) as AuthorizationOptions<LocalizedText>;
  expect(
    options.resourceTypes[0].resources.find(
      (item) => item.value === 'sales.orders',
    ),
  ).toMatchObject({
    label: expect.objectContaining(title),
    actions: [{ value: 'view', label: expect.objectContaining(actionTitle) }],
  });
  expect(
    (
      (await databaseScopeRuleOptions(
        authz,
        undefined,
      )) as AuthorizationOptions<LocalizedText>
    ).resourceTypes[0].resources.map((item) => item.value),
  ).toEqual(['sales.orders']);
});

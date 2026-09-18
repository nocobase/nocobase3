import { expect, it } from 'vitest';
import { ResourceItems } from '../src/core/index.js';
it('rejects ambiguous or invalid action scope declarations', () => {
  const items = new ResourceItems();
  const field = {
    key: 'tasks',
    title: 'Tasks',
    defaultValue: 'own',
    options: [{ value: 'own', title: 'Own' }],
  };
  const config = { policyType: 'assignment', fields: [field] };
  expect(() =>
    items.add({ id: 'a', actions: ['read'], actionScopes: { assign: config } }),
  ).toThrow();
  expect(() =>
    items.add({
      id: 'a',
      actions: ['read'],
      actionScopes: {
        read: { ...config, fields: [{ ...field, defaultValue: 'missing' }] },
      },
    }),
  ).toThrow();
  expect(() =>
    items.add({
      id: 'a',
      actions: ['read'],
      actionScopes: { read: { ...config, fields: [field, field] } },
    }),
  ).toThrow();
  items.add({ id: 'a', actions: ['read'], actionScopes: { read: config } });
  expect(items.list()[0].actionScopes?.read).toEqual(config);
});

it('preserves the business origin of grants without named data scopes', async () => {
  const { BusinessResources, BusinessResourceGroups } =
    await import('../src/core/business-resources.js');
  const groups = new BusinessResourceGroups();
  groups.add({ name: 'sales', title: 'Sales' });
  const resources = new BusinessResources(groups);
  resources.add({
    name: 'sales.export',
    title: 'Export',
    group: 'sales',
    actions: [
      {
        name: 'run',
        title: 'Run',
        grants: [
          {
            resource: { type: 'page', id: 'export' },
            actions: [{ action: 'access' }],
          },
        ],
      },
    ],
  });
  expect(
    resources.expand({
      source: { plugin: 'test', id: 'one' },
      resource: { type: 'resource', id: 'sales.export' },
      action: 'run',
    })[1].origin,
  ).toEqual({
    resource: { type: 'resource', id: 'sales.export' },
    action: 'run',
  });
});

it('evaluates each composed target once with only that operation grants', async () => {
  const { createAuthorization } = await import('../src/core/index.js');
  const source = { plugin: 'test', id: 'set' };
  const grants = [
    { source, resource: { type: 'resource', id: 'reports' }, action: 'view' },
    { source, resource: { type: 'document', id: 'report' }, action: 'write' },
  ];
  let calls = 0;
  const authz = createAuthorization({
    plugins: [
      {
        id: 'test',
        grants: {
          resolveAll: async () => grants,
          resolve: async (input) =>
            grants.filter(
              (grant) =>
                grant.resource.type === input.resource.type &&
                grant.resource.id === input.resource.id &&
                grant.action === input.action,
            ),
        },
        setup(host) {
          host.resourceTypes.add({
            resourceType: 'document',
            async authorize(request, context) {
              calls++;
              expect(
                (await context.grants.resolveAll(request)).map(
                  (grant) => grant.action,
                ),
              ).toEqual(['read', 'read']);
              return {
                effect: 'conditional',
                conditions: { type: 'document', owner: 'alice' },
                reasons: [],
              };
            },
          });
        },
      },
    ],
  });
  authz.resourceGroups.add({ name: 'reports', title: 'Reports' });
  const target = {
    resource: { type: 'document', id: 'report' },
    actions: [{ action: 'read' }],
  };
  authz.resources.add({
    name: 'reports',
    title: 'Reports',
    group: 'reports',
    actions: [{ name: 'view', title: 'View', grants: [target, target] }],
  });
  const decision = await authz
    .for({ principal: { type: 'user', id: 'alice' } })
    .authorize({
      resource: { type: 'resource', id: 'reports' },
      action: 'view',
    });
  expect(calls).toBe(1);
  expect(decision.effect).toBe('conditional');
  expect(decision.conditions?.checks).toHaveLength(1);
  expect(decision.conditions?.checks[0].decision.conditions).toEqual({
    type: 'document',
    owner: 'alice',
  });
});

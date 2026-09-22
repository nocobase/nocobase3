import { expect, it } from 'vitest';
import {
  AuthorizationResourceGroups,
  AuthorizationResources,
  defineAuthorizationResource,
  type AuthorizationContribution,
} from '../src/core/index.js';

it('composes a third-party plugin contribution without database methods', () => {
  const groups = new AuthorizationResourceGroups();
  const resources = new AuthorizationResources(groups);
  const workflow: AuthorizationContribution = {
    build: () => ({
      grants: [
        {
          resource: { type: 'workflow', id: 'approval' },
          actions: [{ action: 'execute' }],
        },
      ],
    }),
  };
  groups.add({
    name: 'operations',
    title: 'Operations',
    category: 'administration',
  });
  const reference = defineAuthorizationResource('approval', (resource) =>
    resource
      .group('operations')
      .title('Approval')
      .action('run', (action) => action.title('Run').grant(workflow)),
  ).register(resources);
  expect(reference.grant('run').actions).toEqual([{ action: 'run' }]);
  expect(resources.operation('approval', 'run')?.grants[0].resource.type).toBe(
    'workflow',
  );
});

it('registers only complete resources and retains runtime validation', () => {
  const groups = new AuthorizationResourceGroups();
  const resources = new AuthorizationResources(groups);
  groups.add({ name: 'sales', title: 'Sales' });
  expect(resources.definitionsList()).toEqual([]);
  expect(() =>
    defineAuthorizationResource('quotes', (r) => r.group('sales')),
  ).toThrow('requires a group and actions');
  expect(() =>
    defineAuthorizationResource('quotes', (r) =>
      r.group('sales').action('view', (a) => a),
    ).register(resources),
  ).toThrow('underlying resources');
});

it('builds portable JSON declarations without registration and isolates snapshots', async () => {
  const { defineAuthorizationResource } = await import('../src/core/index.js');
  const resource = defineAuthorizationResource('reports', (resource) =>
    resource
      .group('sales')
      .title('Reports')
      .action('export', (action) =>
        action.title('Export').grant({
          build: () => ({
            grants: [
              {
                resource: { type: 'report', id: 'sales' },
                actions: [{ action: 'download' }],
              },
            ],
          }),
        }),
      ),
  );
  const first = new AuthorizationResourceGroups();
  const second = new AuthorizationResourceGroups();
  const fluent = new AuthorizationResources(first);
  const json = new AuthorizationResources(second);
  for (const groups of [first, second])
    groups.add({ name: 'sales', title: 'Sales', category: 'administration' });
  const data = resource.build();
  expect(fluent.definitionsList()).toEqual([]);
  expect(resource.reference().grant('export').resource.id).toBe('reports');
  data.title = 'Mutated';
  expect(resource.build().title).toBe('Reports');
  json.add(JSON.parse(JSON.stringify(resource.build())));
  resource.register(fluent);
  expect(fluent.definitionsList()).toEqual(json.definitionsList());
  expect(fluent.grant('reports', ['export'])).toEqual(
    json.grant('reports', ['export']),
  );
});

it('rejects page composition and limits business groups to database operations', () => {
  const groups = new AuthorizationResourceGroups();
  const resources = new AuthorizationResources(groups);
  groups.add({ name: 'sales', title: 'Sales' });
  groups.add({ name: 'system', title: 'System', category: 'administration' });
  const definition = (group: string, type: string) => ({
    name: `${group}.${type}`,
    group,
    title: 'Test',
    actions: [
      {
        name: 'view',
        title: 'View',
        grants: [
          { resource: { type, id: 'orders' }, actions: [{ action: 'read' }] },
        ],
      },
    ],
  });
  expect(() => resources.add(definition('sales', 'page'))).toThrow(
    'separately',
  );
  expect(() => resources.add(definition('system', 'page'))).toThrow(
    'separately',
  );
  expect(() => resources.add(definition('sales', 'settings'))).toThrow(
    'only reference database',
  );
  expect(() =>
    resources.add(definition('sales', 'database.collection')),
  ).not.toThrow();
  expect(() => resources.add(definition('system', 'settings'))).not.toThrow();
});

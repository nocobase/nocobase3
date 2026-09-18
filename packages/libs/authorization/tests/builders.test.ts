import { expect, it } from 'vitest';
import {
  BusinessResourceGroups,
  BusinessResources,
  type AuthorizationContribution,
} from '../src/core/index.js';

it('composes a third-party plugin contribution without database methods', () => {
  const groups = new BusinessResourceGroups();
  const resources = new BusinessResources(groups);
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
  const reference = groups
    .define('operations', { title: 'Operations', category: 'administration' })
    .resource('approval', { title: 'Approval' })
    .action('run', { title: 'Run' }, (action) => action.grant(workflow))
    .register();
  expect(reference.grant('run').actions).toEqual([{ action: 'run' }]);
  expect(resources.operation('approval', 'run')?.grants[0].resource.type).toBe(
    'workflow',
  );
});

it('registers only complete resources and retains runtime validation', () => {
  const groups = new BusinessResourceGroups();
  const resources = new BusinessResources(groups);
  const builder = groups
    .define('sales', { title: 'Sales' })
    .resource('quotes', { title: 'Quotes' });
  expect(resources.definitionsList()).toEqual([]);
  expect(() => builder.register()).toThrow('Invalid business actions');
  expect(() =>
    builder.action('view', { title: 'View' }, (action) => action).register(),
  ).toThrow('underlying resources');
});

it('builds portable JSON declarations without registration and isolates snapshots', async () => {
  const { businessResource } = await import('../src/core/index.js');
  const resource = businessResource('reports', {
    group: 'sales',
    title: 'Reports',
  }).action('export', { title: 'Export' }, (action) =>
    action.grant({
      build: () => ({
        grants: [
          {
            resource: { type: 'report', id: 'sales' },
            actions: [{ action: 'download' }],
          },
        ],
      }),
    }),
  );
  const first = new BusinessResourceGroups();
  const second = new BusinessResourceGroups();
  const fluent = new BusinessResources(first);
  const json = new BusinessResources(second);
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
  const groups = new BusinessResourceGroups();
  const resources = new BusinessResources(groups);
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

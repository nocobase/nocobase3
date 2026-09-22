import { expect, it } from 'vitest';
import {
  defineAuthorizationResource,
  type AuthorizationContribution,
} from '../src/core/index.js';
import { permissionSet } from '../src/plugins/permission-sets/index.js';
import { defaultAccessRule } from '../src/plugins/default-access/index.js';
import { sharingRule } from '../src/plugins/sharing-rules/index.js';
import { restrictionRule } from '../src/plugins/restriction-rules/index.js';

const contribution: AuthorizationContribution<{ quotes: string }> = {
  build: () => ({
    scopes: {
      quotes: {
        title: 'Quotes',
        resource: { type: 'database.collection', id: 'quotes' },
      },
    },
    grants: [
      {
        resource: { type: 'database.collection', id: 'quotes' },
        actions: [
          { action: 'read', policy: { type: 'database', scope: 'quotes' } },
        ],
      },
    ],
  }),
};
const resource = defineAuthorizationResource('sales.quotes', (resource) =>
  resource
    .title('Quotes')
    .group('sales')
    .action('view', (action) => action.title('View').grant(contribution)),
).reference();

it('builds independent permission-set and rule DSL without an application or store', () => {
  const grant = resource.grant({ view: { quotes: 'own' } });
  const role = permissionSet('sales').title('Sales');
  const configured = role.grant(grant);
  grant.actions = [];
  expect(role.build().grants).toEqual([]);
  expect(configured.build().grants[0].actions).toHaveLength(1);
  const scope = { type: 'database', recordAccess: 'own' };
  const defaults = defaultAccessRule(resource)
    .scope('view', 'quotes', scope)
    .build();
  const sharing = sharingRule('selected', resource)
    .title('Selected')
    .scope('view', 'quotes', { type: 'records', ids: ['q1'] })
    .subjects({ type: 'user', id: 'alex' })
    .reason('Handover')
    .build();
  const restriction = restrictionRule('public', resource)
    .scope('view', 'quotes', scope)
    .subjects({ type: 'team', id: 'sales' })
    .build();
  scope.recordAccess = 'changed';
  expect(defaults.actions).toEqual([
    {
      action: 'view',
      scopeKey: 'quotes',
      scope: { type: 'database', recordAccess: 'own' },
    },
  ]);
  expect(sharing.subjects).toEqual([{ type: 'user', id: 'alex' }]);
  expect(restriction.actions[0].scope).toEqual(defaults.actions[0].scope);
  for (const definition of [configured.build(), defaults, sharing, restriction])
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
});

it('rejects ambiguous and unknown rule targets before persistence', () => {
  const scope = { type: 'all' as const };
  expect(() =>
    defaultAccessRule(resource)
      .scope('view', 'quotes', scope)
      .scope('view', 'quotes', scope),
  ).toThrow('Duplicate');
  expect(() =>
    sharingRule('bad', resource).scope('missing' as never, 'quotes', {
      type: 'records',
      ids: [],
    }),
  ).toThrow('Unknown');
  expect(() =>
    restrictionRule('bad', resource).scope('view', 'wrong' as never, scope),
  ).toThrow('Unknown');
});

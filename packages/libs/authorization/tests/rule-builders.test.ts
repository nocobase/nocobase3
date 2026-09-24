import { expect, it } from 'vitest';
import {
  defineBusinessResource,
  selection,
  type BusinessContribution,
} from '../src/core/index.js';
import { definePermissionSet } from '../src/plugins/permission-sets/index.js';
import { defineDefaultAccessRule } from '../src/plugins/default-access/index.js';
import { defineSharingRule } from '../src/plugins/sharing-rules/index.js';
import { defineRestrictionRule } from '../src/plugins/restriction-rules/index.js';

const contribution: BusinessContribution<{ quotes: string }> = {
  build: () => ({
    dataScopes: [{ key: 'quotes', title: 'Quotes', collection: 'quotes' }],
    grants: [
      {
        resource: { type: 'database.collection', id: 'quotes' },
        actions: [{ action: 'read', scopeKey: 'quotes' }],
      },
    ],
  }),
};
const resource = defineBusinessResource('sales.quotes', (resource) =>
  resource
    .title('Quotes')
    .section('sales')
    .action('view', (action) => action.title('View').grant(contribution)),
).reference();

it('builds permission sets and rules without an application or store', () => {
  const grant = resource.grant({ view: { quotes: 'own' } });
  const role = definePermissionSet('sales').title('Sales');
  const configured = role.grant(grant);
  grant.actions = [];
  expect(role.build().grants).toEqual([]);
  expect(configured.build().grants[0]?.actions).toHaveLength(1);
  const own = selection.recordAccess('own');
  const defaults = defineDefaultAccessRule('quotes-default', resource)
    .scope('view', 'quotes', own)
    .build();
  const sharing = defineSharingRule('selected', resource)
    .title('Selected')
    .scope('view', 'quotes', selection.records(['q1']))
    .subjects({ type: 'user', id: 'alex' })
    .reason('Handover')
    .build();
  const restriction = defineRestrictionRule('public', resource)
    .scope('view', 'quotes', own)
    .subjects({ type: 'team', id: 'sales' })
    .build();
  expect(defaults).toEqual({
    key: 'quotes-default',
    resource: { type: 'business', id: 'sales.quotes' },
    actions: [
      {
        action: 'view',
        scopeKey: 'quotes',
        selection: { type: 'recordAccess', key: 'own' },
      },
    ],
  });
  expect(sharing).toMatchObject({
    key: 'selected',
    title: 'Selected',
    subjects: [{ type: 'user', id: 'alex' }],
    reason: 'Handover',
  });
  expect(restriction.actions[0]?.selection).toEqual(
    defaults.actions[0]?.selection,
  );
  for (const definition of [configured.build(), defaults, sharing, restriction])
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
});

it('rejects ambiguous and unknown rule targets before persistence', () => {
  const all = selection.all();
  expect(() =>
    defineDefaultAccessRule('d', resource)
      .scope('view', 'quotes', all)
      .scope('view', 'quotes', all),
  ).toThrow('Duplicate');
  expect(() =>
    defineSharingRule('bad', resource).scope(
      'missing' as never,
      'quotes' as never,
      selection.records([]),
    ),
  ).toThrow('Unknown');
  expect(() =>
    defineRestrictionRule('bad', resource).scope('view', 'wrong' as never, all),
  ).toThrow('Unknown');
  expect(() =>
    defineSharingRule('everything', resource).scope('view', 'quotes', all),
  ).toThrow('cannot select all records');
  expect(() =>
    defineRestrictionRule('limit', resource).scope(
      'view',
      'quotes',
      selection.records(['q1']),
    ),
  ).not.toThrow();
});

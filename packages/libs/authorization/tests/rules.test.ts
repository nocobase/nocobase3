import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  DefaultAccessConflictError,
  defaultAccessPlugin,
  defineComposite,
  permissionSetsPlugin,
  restrictionRulesPlugin,
  selection,
  sharingRulesPlugin,
  type AccessConstraint,
  type AuthorizationPlugin,
  type CompositeContribution,
  type DefaultAccessRule,
  type RestrictionRule,
  type SharingRule,
} from '../src/index.js';
import { definePermissionSet } from '../src/plugins/permission-sets/index.js';
import { defineDefaultAccessRule } from '../src/plugins/default-access/index.js';
import { defineSharingRule } from '../src/plugins/sharing-rules/index.js';
import { defineRestrictionRule } from '../src/plugins/restriction-rules/index.js';
import { MemoryRuleStore } from './helpers/memory-rule-store.js';
import { MockPermissionSetStore } from './helpers/mock-permission-set-store.js';

const resource = {
  type: 'database.collection',
  id: 'main.orders',
} as const;
const alice = { principal: { type: 'user', id: 'alice' } };

/**
 * A stand-in for a resource plugin: the library hands constraints out as
 * opaque scope references and never interprets them, so what a handler
 * received is the whole of what these tests can observe.
 */
function recordingResource(): {
  plugin: AuthorizationPlugin;
  received: AccessConstraint[][];
} {
  const received: AccessConstraint[][] = [];
  return {
    received,
    plugin: {
      id: 'recording',
      requiresGrants: true,
      setup(authz): void {
        authz.resourceTypes.add({
          type: 'database.collection',
          actions: ['read', 'create', 'update', 'delete'],
          async authorize(request, context) {
            const grants = await context.grants.resolve(request);
            if (grants.length === 0) {
              return { effect: 'deny', reasons: [] };
            }
            const constraints = await context.constraints.resolve(request);
            received.push([...constraints]);
            return {
              effect: 'conditional',
              conditions: { type: 'recording' },
              reasons: [],
            };
          },
          authorizeUnrestricted() {
            return Promise.resolve({ effect: 'permit', reasons: [] });
          },
        });
      },
    },
  };
}

function readerStore(): MockPermissionSetStore {
  return new MockPermissionSetStore({
    permissionSets: [
      {
        key: 'order-reader',
        grants: [
          {
            resource,
            actions: [{ action: 'read', policy: { type: 'database' } }],
          },
        ],
      },
    ],
    assignments: [
      {
        id: 'reader-assignment',
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'order-reader',
      },
    ],
  });
}

describe('rule plugins', () => {
  it('hands default access, sharing and restriction scopes to the resource handler', async () => {
    const rules = new MemoryRuleStore<SharingRule>([
      {
        key: 'shared-order',
        title: 'Shared orders',
        resource,
        actions: [
          {
            action: 'read',
            selection: { type: 'records', ids: ['order-1', 'order-2'] },
          },
        ],
        subjects: [{ type: 'user', id: 'alice' }],
      },
    ]);
    const restrictions = new MemoryRuleStore<RestrictionRule>([
      {
        key: 'owned-only',
        title: { key: 'owned', ns: 'orders' },
        resource,
        actions: [
          {
            action: 'read',
            selection: selection.recordAccess('recordsIOwn'),
          },
        ],
        subjects: [{ type: 'user', id: 'alice' }],
      },
    ]);
    const defaults = new MemoryRuleStore<DefaultAccessRule>([
      {
        key: 'orders-default',
        resource,
        actions: [{ action: 'read', selection: selection.all() }],
      },
    ]);
    const handler = recordingResource();
    const authorization = createAuthorization({
      plugins: [
        permissionSetsPlugin({ store: readerStore() }),
        defaultAccessPlugin({ store: defaults }),
        sharingRulesPlugin({ store: rules }),
        restrictionRulesPlugin({ store: restrictions }),
        handler.plugin,
      ],
    });

    await expect(
      authorization.for(alice).authorize({ resource, action: 'read' }),
    ).resolves.toMatchObject({ effect: 'conditional' });
    expect(handler.received).toEqual([
      [
        {
          source: { plugin: 'default-access', id: 'orders-default' },
          effect: 'expand',
          selection: { type: 'all' },
        },
        {
          source: {
            plugin: 'sharing-rules',
            id: 'shared-order',
            title: 'Shared orders',
          },
          effect: 'expand',
          selection: { type: 'records', ids: ['order-1', 'order-2'] },
        },
        {
          source: {
            plugin: 'restriction-rules',
            id: 'owned-only',
            title: { key: 'owned', ns: 'orders' },
          },
          effect: 'restrict',
          selection: { type: 'recordAccess', key: 'recordsIOwn' },
        },
      ],
    ]);
  });

  it('resolves independent scopes for each configured action', async () => {
    const defaults = new MemoryRuleStore<DefaultAccessRule>([
      {
        key: 'orders',
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: [
          { action: 'read', selection: selection.all() },
          { action: 'update', selection: selection.records(['order-1']) },
        ],
      },
    ]);
    const authorization = createAuthorization({
      plugins: [defaultAccessPlugin({ store: defaults })],
    });
    const input = {
      principal: { type: 'user', id: 'alice' },
      resource: { type: 'database.collection', id: 'main.orders' },
    } as const;

    await expect(
      authorization.constraints.resolve({ ...input, action: 'read' }),
    ).resolves.toMatchObject([{ selection: { type: 'all' } }]);
    await expect(
      authorization.constraints.resolve({ ...input, action: 'update' }),
    ).resolves.toMatchObject([
      { selection: { type: 'records', ids: ['order-1'] } },
    ]);
  });

  it('keeps one default-access rule per resource', async () => {
    const defaults = new MemoryRuleStore<DefaultAccessRule>();
    const { defaultAccess } = defaultAccessPlugin({
      store: defaults,
    }).authorizationApi;
    const first = {
      key: 'orders',
      resource,
      actions: [{ action: 'read', selection: selection.all() }],
    };
    await defaultAccess.create(first);
    await expect(
      defaultAccess.create({ ...first, key: 'orders-again' }),
    ).rejects.toBeInstanceOf(DefaultAccessConflictError);
    await expect(
      defaultAccess.update('orders', { ...first, key: 'orders-renamed' }),
    ).resolves.toMatchObject({ key: 'orders-renamed' });
  });

  it('validates rules before they reach the store', async () => {
    const sharing = new MemoryRuleStore<SharingRule>();
    const restrictions = new MemoryRuleStore<RestrictionRule>();
    const authz = createAuthorization({
      plugins: [
        sharingRulesPlugin({ store: sharing }),
        restrictionRulesPlugin({ store: restrictions }),
      ],
    });
    const rule = {
      key: 'r',
      resource,
      subjects: [{ type: 'user', id: 'alice' }],
      actions: [{ action: 'read', selection: selection.all() }],
    };
    await expect(authz.sharingRules.create(rule)).rejects.toThrow(
      'cannot select all records',
    );
    await expect(authz.restrictionRules.create(rule)).resolves.toEqual(rule);
    const records = {
      ...rule,
      actions: [{ action: 'read', selection: selection.records(['o1']) }],
    };
    await expect(authz.sharingRules.create(records)).resolves.toEqual(records);
    await expect(
      authz.sharingRules.update('r', {
        ...records,
        actions: [...records.actions, ...records.actions],
      }),
    ).rejects.toThrow('repeats read');
    await expect(authz.sharingRules.get('r')).resolves.toEqual(records);
    await authz.sharingRules.delete('r');
    await expect(authz.sharingRules.list()).resolves.toEqual([]);
    expect(authz.restrictionRules.withTransaction({})).toBeDefined();
  });

  it('applies a sharing rule only to the subjects it names', async () => {
    const authz = createAuthorization({
      plugins: [
        sharingRulesPlugin({
          store: new MemoryRuleStore<SharingRule>([
            {
              key: 'r',
              resource,
              subjects: [{ type: 'team', id: 'sales' }],
              actions: [
                { action: 'read', selection: selection.records(['o1']) },
              ],
            },
          ]),
        }),
      ],
    });
    const input = { resource, action: 'read' };
    await expect(
      authz.constraints.resolve({ ...input, ...alice }),
    ).resolves.toEqual([]);
    await expect(
      authz.constraints.resolve({
        ...input,
        ...alice,
        subjects: [{ type: 'team', id: 'sales' }],
      }),
    ).resolves.toHaveLength(1);
  });
});

const contribution: CompositeContribution<{ quotes: string }> = {
  build: () => ({
    dataScopes: [{ key: 'quotes', title: 'Quotes' }],
    grants: [
      {
        resource: { type: 'database.collection', id: 'quotes' },
        actions: [{ action: 'read', scopeKey: 'quotes' }],
      },
    ],
  }),
};
const quotes = defineComposite('sales.quotes', (resource) =>
  resource
    .title('Quotes')
    .action('view', (action) => action.title('View').grant(contribution)),
).reference();

describe('rule builders', () => {
  it('builds permission sets and rules without an application or store', () => {
    const grant = quotes.grant({ view: { quotes: 'own' } });
    const role = definePermissionSet('sales').title('Sales');
    const configured = role.grant(grant);
    grant.actions = [];
    expect(role.build().grants).toEqual([]);
    expect(configured.build().grants[0]?.actions).toHaveLength(1);
    const own = selection.recordAccess('own');
    const defaults = defineDefaultAccessRule('quotes-default', quotes)
      .scope('view', 'quotes', own)
      .build();
    const sharing = defineSharingRule('selected', quotes)
      .title('Selected')
      .scope('view', 'quotes', selection.records(['q1']))
      .subjects({ type: 'user', id: 'alex' })
      .reason('Handover')
      .build();
    const restriction = defineRestrictionRule('public', quotes)
      .scope('view', 'quotes', own)
      .subjects({ type: 'team', id: 'sales' })
      .build();
    expect(defaults).toEqual({
      key: 'quotes-default',
      resource: { type: 'composite', id: 'sales.quotes' },
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
    for (const definition of [
      configured.build(),
      defaults,
      sharing,
      restriction,
    ])
      expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });

  it('rejects ambiguous and unknown rule targets before persistence', () => {
    const all = selection.all();
    expect(() =>
      defineDefaultAccessRule('d', quotes)
        .scope('view', 'quotes', all)
        .scope('view', 'quotes', all),
    ).toThrow('Duplicate');
    expect(() =>
      defineSharingRule('bad', quotes).scope(
        'missing' as never,
        'quotes' as never,
        selection.records([]),
      ),
    ).toThrow('Unknown');
    expect(() =>
      defineRestrictionRule('bad', quotes).scope('view', 'wrong' as never, all),
    ).toThrow('Unknown');
    expect(() =>
      defineSharingRule('everything', quotes).scope('view', 'quotes', all),
    ).toThrow('cannot select all records');
    expect(() =>
      defineRestrictionRule('limit', quotes).scope(
        'view',
        'quotes',
        selection.records(['q1']),
      ),
    ).not.toThrow();
  });
});

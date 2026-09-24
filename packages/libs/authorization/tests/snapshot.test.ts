import { describe, expect, it } from 'vitest';
import {
  businessPlugin,
  createAuthorization,
  defineBusinessResource,
  grantBacked,
  ResourceItems,
  type AuthorizationGrant,
  type AuthorizationPlugin,
  type BusinessContribution,
  type PermissionGrant,
} from '../src/core/index.js';
import { permissionSetsPlugin } from '../src/plugins/permission-sets/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

const quotesScope: BusinessContribution<{ quotes: string }> = {
  build: () => ({
    dataScopes: [{ key: 'quotes', title: 'Quotes', collection: 'quotes' }],
    grants: [
      {
        resource: { type: 'database.collection', id: 'quotes' },
        actions: [
          { action: 'read', policy: { type: 'database' }, scopeKey: 'quotes' },
        ],
      },
    ],
  }),
};
const quotes = defineBusinessResource('sales.quotes', (resource) =>
  resource
    .title('Quotes')
    .section('sales')
    .action('submit', (action) => action.grant(quotesScope)),
);

const recordAccessGrant = (grant: AuthorizationGrant): boolean =>
  grant.origin?.selection !== undefined ||
  grant.policy?.recordAccess !== undefined;

/** Permits plain collection grants and leaves record-scoped ones conditional. */
const database: AuthorizationPlugin = {
  id: 'database',
  setup(authz) {
    const collections = new ResourceItems();
    const settings = new ResourceItems();
    authz.resourceTypes.add({
      type: 'database.collection',
      items: collections,
      title: 'Collections',
      actions: ['read', 'update'],
      async authorize(request, context) {
        const grants = await context.grants.resolve(request);
        if (!grants.length) return { effect: 'deny', reasons: [] };
        return grants.every(recordAccessGrant)
          ? {
              effect: 'conditional',
              conditions: { type: 'database' },
              reasons: [],
            }
          : { effect: 'permit', reasons: [] };
      },
    });
    collections.add({ id: 'quotes', title: 'Quotes' });
    authz.resourceTypes.add({
      type: 'settings',
      title: 'Settings',
      items: settings,
      authorize: grantBacked(),
    });
    settings.add({ id: 'workflow', title: 'Workflow', actions: ['manage'] });
  },
};

function setup(grants: readonly PermissionGrant[], unrestricted = false) {
  const permissionSets = permissionSetsPlugin({
    store: new MockPermissionSetStore({
      permissionSets: [{ key: 'sales', grants }],
      assignments: [
        {
          id: 'alice-sales',
          subject: { type: 'user', id: 'alice' },
          permissionSet: 'sales',
        },
      ],
    }),
  });
  const authz = createAuthorization({
    plugins: [permissionSets, businessPlugin(), database],
  });
  if (unrestricted)
    authz.permissionSets.protect({
      owner: 'test',
      keys: ['sales'],
      unrestricted: true,
    });
  authz.sections.add({ name: 'sales', title: 'Sales', parent: 'business' });
  authz.business.define(quotes);
  return authz;
}

const alice = { principal: { type: 'user', id: 'alice' } };
const grants: readonly PermissionGrant[] = [
  quotes.reference().grant({ submit: { quotes: 'allRecords' } }),
  {
    resource: { type: 'database.collection', id: 'quotes' },
    actions: [
      { action: 'update' },
      {
        action: 'read',
        policy: { type: 'database', recordAccess: ['recordsIOwn'] },
      },
    ],
  },
  {
    resource: { type: 'settings', id: 'workflow' },
    actions: [{ action: 'manage' }, { action: 'delete' }],
  },
  {
    resource: { type: 'settings', id: 'unknown' },
    actions: [{ action: 'manage' }],
  },
];

describe('the snapshot', () => {
  it('lists a scoped business grant', async () => {
    const snapshot = await setup(grants).for(alice).snapshot();
    expect(snapshot.unrestricted).toBe(false);
    expect(snapshot.permissions).toContainEqual({
      resource: { type: 'business', id: 'sales.quotes' },
      actions: ['submit'],
    });
  });

  it('omits record-scoped collection grants and unregistered items or actions', async () => {
    const snapshot = await setup(grants).for(alice).snapshot();
    expect(snapshot.permissions).toEqual([
      {
        resource: { type: 'business', id: 'sales.quotes' },
        actions: ['submit'],
      },
      {
        resource: { type: 'database.collection', id: 'quotes' },
        actions: ['update'],
      },
      { resource: { type: 'settings', id: 'workflow' }, actions: ['manage'] },
    ]);
  });

  it('agrees with can() for every candidate grant', async () => {
    const context = setup(grants).for(alice);
    const listed = new Set(
      (await context.snapshot()).permissions.flatMap((permission) =>
        permission.actions.map((action) =>
          JSON.stringify([permission.resource, action]),
        ),
      ),
    );
    const candidates = [
      ...grants.flatMap((grant) =>
        grant.actions.map((entry) => ({
          resource: grant.resource,
          action: entry.action,
        })),
      ),
      {
        resource: { type: 'database.collection', id: 'quotes' },
        action: 'read',
      },
    ];
    for (const candidate of candidates)
      expect(
        listed.has(JSON.stringify([candidate.resource, candidate.action])),
      ).toBe(await context.can(candidate));
  });

  it('reports an unrestricted identity without listing grants', async () => {
    await expect(setup(grants, true).for(alice).snapshot()).resolves.toEqual({
      unrestricted: true,
      permissions: [],
    });
  });
});

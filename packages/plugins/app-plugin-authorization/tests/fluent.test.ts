import { expect, it } from 'vitest';
import {
  BusinessResourceGroups,
  BusinessResources,
  BusinessActionBuilder,
} from '@nocobase/authorization/core';
import { DatabaseAuthorizationService } from '../server/database/api.js';
import { RecordAccessPolicyRegistry } from '../server/database/record-access-registry.js';
import { pages } from '../server/pages-authorization.js';

function setup() {
  const groups = new BusinessResourceGroups();
  const resources = new BusinessResources(groups);
  const db = new DatabaseAuthorizationService(new RecordAccessPolicyRegistry());
  const sales = groups.define('sales', { title: 'Sales' });
  const quotes = db
    .collection('quotes')
    .typed<{ id: string; amount: number; ownerId: string }>()
    .actions('read', 'update')
    .register();
  return { db, resources, sales, quotes };
}

it('composes plugin grants without leaking writes across reused scopes', () => {
  const { resources, sales, quotes } = setup();
  const scope = quotes
    .scope('quotes', { title: 'Quotes' })
    .read(['id', 'amount']);
  const reference = sales
    .resource('sales.quotes', { title: 'Quotes' })
    .action('view', { title: 'View' }, (action) => action.grant(scope))
    .action('edit', { title: 'Edit' }, (action) =>
      action.grant(scope.update(['amount'])),
    )
    .register();
  expect(resources.operation('sales.quotes', 'view')?.grants).toEqual([
    {
      resource: { type: 'database.collection', id: 'quotes' },
      actions: [
        {
          action: 'read',
          policy: {
            type: 'database',
            scope: 'quotes',
            fields: { output: ['id', 'amount'] },
          },
        },
      ],
    },
  ]);
  expect(
    resources
      .operation('sales.quotes', 'edit')
      ?.grants[0].actions.map((action) => action.action),
  ).toEqual(['read', 'update']);
  expect(reference.grant('view')).toEqual(
    resources.grant('sales.quotes', ['view']),
  );
});

it('registers resolvers, carries scope options and applies the selected default', async () => {
  const { db, resources, sales, quotes } = setup();
  const own = quotes
    .recordAccess('own')
    .title('Own')
    .resolve(({ filter, principal }) => filter.eq('ownerId', principal.id))
    .register();
  const scope = quotes
    .scope('quotes', { title: 'Quotes' })
    .options(own)
    .default(own)
    .read(['id']);
  const reference = sales
    .resource('quotes', { title: 'Quotes' })
    .action('view', { title: 'View' }, (action) => action.grant(scope))
    .register();
  const [grant] = reference.grant({ view: { quotes: 'own' } }).actions;
  const expanded = resources.expand({
    resource: { type: 'resource', id: 'quotes' },
    action: grant.action,
    policy: grant.policy,
    source: { plugin: 'test', id: 'test' },
  });
  expect(expanded[1].policy?.recordAccess).toEqual(['own']);
  const defaults = resources.expand({
    resource: { type: 'resource', id: 'quotes' },
    action: 'view',
    source: { plugin: 'test', id: 'test' },
  });
  expect(defaults[1].policy?.recordAccess).toEqual(['own']);
  expect(
    await db.recordAccess.get('own')!.resolve({
      principal: { type: 'user', id: 'alex' },
      collection: {
        name: 'quotes',
        fields: ['id', 'ownerId'],
        primaryKey: 'id',
        generatedPrimaryKey: false,
      },
      action: 'read',
      params: undefined,
    }),
  ).toEqual({
    kind: 'condition',
    path: ['ownerId'],
    operator: '$eq',
    value: 'alex',
  });
});

it('keeps independent scope selections on a multi-table operation', () => {
  const { db, resources, sales, quotes } = setup();
  const projects = db
    .collection('projects')
    .typed<{ id: string }>()
    .actions('read')
    .register();
  const reference = sales
    .resource('submit', { title: 'Submit' })
    .action('run', { title: 'Run' }, (action) =>
      action
        .grant(projects.scope('projects', { title: 'Projects' }).read(['id']))
        .grant(
          quotes
            .scope('quotes', { title: 'Quotes' })
            .read(['id'])
            .update(['amount']),
        ),
    )
    .register();
  const [grant] = reference.grant({
    run: { projects: 'regional', quotes: 'own' },
  }).actions;
  const expanded = resources.expand({
    resource: { type: 'resource', id: 'submit' },
    action: grant.action,
    policy: grant.policy,
    source: { plugin: 'test', id: 'test' },
  });
  expect(
    expanded
      .slice(1)
      .map((entry) => [
        entry.resource.id,
        entry.action,
        entry.policy?.recordAccess,
      ]),
  ).toEqual([
    ['projects', 'read', ['regional']],
    ['quotes', 'read', ['own']],
    ['quotes', 'update', ['own']],
  ]);
});

it('rejects ambiguous and empty contributions at runtime', () => {
  const { quotes } = setup();
  const scope = quotes.scope('quotes', { title: 'Quotes' });
  expect(() => scope.build()).toThrow('at least one action');
  expect(() => scope.read(['id']).read(['amount'])).toThrow(
    'Duplicate database action',
  );
  expect(() =>
    new BusinessActionBuilder()
      .grant(scope.read(['id']))
      .grant(scope.update(['amount'])),
  ).toThrow('Duplicate action scope');
  expect(() =>
    scope.options({ key: 'foreign', collections: ['other'] } as never),
  ).toThrow('does not apply');
  expect(() =>
    scope
      .options({ key: 'own', collections: ['quotes'] })
      .default({ key: 'other', collections: ['quotes'] } as never),
  ).toThrow('Invalid default');
});

it('supports portable collection, page and resolver definitions', async () => {
  const { databaseCollection } = await import('../server/database/builders.js');
  const { authorizationPage } =
    await import('../server/pages-authorization.js');
  const { db } = setup();
  const definition = databaseCollection('portable')
    .typed<{ id: string }>()
    .actions('read');
  expect(db.collections.has('portable')).toBe(false);
  const data = JSON.parse(JSON.stringify(definition.build()));
  db.collections.add(data);
  expect(
    definition
      .register(db)
      .scope('rows', { title: 'Rows' })
      .read(['id'])
      .build(),
  ).toEqual(
    definition
      .reference()
      .scope('rows', { title: 'Rows' })
      .read(['id'])
      .build(),
  );
  const resolver = definition
    .reference()
    .recordAccess('portable-own')
    .resolve(({ principal, filter }) => filter.eq('id', principal.id));
  expect(db.recordAccess.get('portable-own')).toBeUndefined();
  db.recordAccess.add(resolver.build());
  expect(
    await db.recordAccess.get('portable-own')!.resolve({
      principal: { type: 'user', id: 'alex' },
      collection: {
        name: 'portable',
        fields: ['id'],
        primaryKey: 'id',
        generatedPrimaryKey: false,
      },
      action: 'read',
      params: undefined,
    }),
  ).toMatchObject({ value: 'alex' });
  const api = pages().authorizationApi!.pages;
  const page = authorizationPage('portable', { title: 'Portable' });
  api.add(JSON.parse(JSON.stringify(page.build())));
  expect(page.reference().access()).toEqual(api.grant('portable', ['access']));
});

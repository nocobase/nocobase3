import { expect, it } from 'vitest';
import {
  AuthorizationActionBuilder,
  AuthorizationResourceGroups,
  AuthorizationResources,
  defineAuthorizationResource,
} from '@nocobase/authorization/core';
import { defineDatabasePermission } from '../server/database/builders.js';
import { DatabaseAuthorizationService } from '../server/database/api.js';
import { defineRecordAccess } from '@nocobase/authorization/core';
import { pages } from '../server/pages-authorization.js';

it('binds reusable permissions to independent action keys without leaking writes', () => {
  const read = defineDatabasePermission((p) =>
    p
      .collection<{ id: string; amount: number }>('quotes')
      .title('Quotes')
      .read(['id']),
  );
  const resource = defineAuthorizationResource('sales.quotes', (r) =>
    r
      .title('Quotes')
      .group('sales')
      .action('view', (a) => a.title('View').grant('visible', read))
      .action('edit', (a) =>
        a.title('Edit').grant('editable', read.update(['amount']), {
          title: 'Editable quotes',
        }),
      ),
  );
  const groups = new AuthorizationResourceGroups();
  const resources = new AuthorizationResources(groups);
  groups.add({ name: 'sales', title: 'Sales' });
  resources.add(resource.build());
  expect(read.build().actions).toHaveLength(1);
  expect(read.build().actions[0].policy).not.toHaveProperty('scope');
  expect(
    resources.operation('sales.quotes', 'view')?.grants[0].actions,
  ).toEqual([
    {
      action: 'read',
      policy: { type: 'database', fields: ['id'], scope: 'visible' },
    },
  ]);
  expect(
    resources.operation('sales.quotes', 'edit')?.scopes?.editable.title,
  ).toBe('Editable quotes');
  const bound = read.bind('snapshot').build();
  Reflect.set(bound.grants[0].actions[0].policy!, 'fields', []);
  expect(
    read.bind('snapshot').build().grants[0].actions[0].policy?.fields,
  ).toEqual(['id']);
});

it('keeps multi-table selections and defaults through binding and expansion', () => {
  const own = defineRecordAccess('own', (access) =>
    access
      .resources({ type: 'database.collection', id: 'quotes' })
      .resolve(() => true),
  );
  const quotes = defineDatabasePermission((p) =>
    p.collection('quotes').read(['id']).options(own).default(own),
  );
  const projects = defineDatabasePermission((p) =>
    p.collection('projects').read(['id']),
  );
  const resource = defineAuthorizationResource('submit', (r) =>
    r
      .group('sales')
      .action('run', (a) =>
        a.grant('quotes', quotes).grant('projects', projects),
      ),
  );
  const groups = new AuthorizationResourceGroups();
  const resources = new AuthorizationResources(groups);
  groups.add({ name: 'sales', title: 'Sales' });
  resource.register(resources);
  const [grant] = resource
    .reference()
    .grant({ run: { projects: 'regional' } }).actions;
  const expanded = resources.expand({
    resource: { type: 'resource', id: 'submit' },
    ...grant,
    source: { plugin: 'test', id: 'test' },
  });
  expect(expanded.slice(1).map((entry) => entry.policy?.recordAccess)).toEqual([
    ['own'],
    ['regional'],
  ]);
});

it('rejects duplicate bindings, malformed declarations and incompatible scope choices', () => {
  const permission = defineDatabasePermission((p) =>
    p.collection('quotes').read(['id']),
  );
  expect(() => defineDatabasePermission((p) => p.collection('empty'))).toThrow(
    'at least one action',
  );
  expect(() => permission.read(['amount'])).toThrow('Duplicate');
  expect(() =>
    new AuthorizationActionBuilder()
      .grant('rows', permission)
      .grant('rows' as never, permission),
  ).toThrow('Duplicate');
  expect(() => permission.bind('type')).toThrow('Invalid');
  expect(() =>
    permission.options({
      key: 'foreign',
      resources: [{ type: 'database.collection', id: 'other' }],
    }),
  ).toThrow('does not apply');
  expect(() =>
    permission
      .options({
        key: 'own',
        resources: [{ type: 'database.collection', id: 'quotes' }],
      })
      .default({
        key: 'other',
        resources: [{ type: 'database.collection', id: 'quotes' }],
      } as never),
  ).toThrow('Invalid default');
});

it('registers pages and collections directly without definition factories', () => {
  const db = new DatabaseAuthorizationService();
  db.collections.add({
    name: 'quotes',
    title: 'Quotes',
    actions: ['read', 'update'],
  });
  expect(db.collections.has('quotes')).toBe(true);
  const api = pages().authorizationApi!.pages;
  api.add({ name: 'quotes', title: 'Quotes', actions: ['access'] });
  expect(api.grant('quotes', ['access'])).toEqual({
    resource: { type: 'page', id: 'quotes' },
    actions: [{ action: 'access' }],
  });
});

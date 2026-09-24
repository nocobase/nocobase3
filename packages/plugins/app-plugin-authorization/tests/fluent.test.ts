import { expect, it } from 'vitest';
import {
  CompositeActionBuilder,
  createAuthorization,
  defineComposite,
  defineRecordAccess,
  selection,
} from '@nocobase/authorization/core';
import { defineDatabasePermission } from '../server/database/builders.js';
import { DatabaseAuthorizationService } from '../server/database/api.js';
import { pagesPlugin } from '../server/pages-authorization.js';
import { settingsPlugin } from '../server/settings.js';

function compositeHost() {
  return createAuthorization({ plugins: [] });
}

it('binds reusable permissions to independent data scopes without leaking writes', () => {
  const read = defineDatabasePermission((p) =>
    p
      .collection<{ id: string; amount: number }>('quotes')
      .title('Quotes')
      .read(['id']),
  );
  const resource = defineComposite('sales.quotes', (r) =>
    r
      .title('Quotes')
      .action('view', (a) => a.title('View').grant('visible', read))
      .action('edit', (a) =>
        a.title('Edit').grant('editable', read.update(['amount']), {
          title: 'Editable quotes',
        }),
      ),
  );
  const authz = compositeHost();
  authz.composites.define(resource);
  expect(read.build().actions).toHaveLength(1);
  expect(read.build().actions[0]).not.toHaveProperty('scopeKey');
  expect(
    authz.composites.getAction('sales.quotes', 'view')?.grants[0]?.actions,
  ).toEqual([
    {
      action: 'read',
      policy: { type: 'database', fields: ['id'] },
      scopeKey: 'visible',
    },
  ]);
  expect(
    authz.composites
      .getAction('sales.quotes', 'edit')
      ?.dataScopes?.find((scope) => scope.key === 'editable')?.title,
  ).toBe('Editable quotes');
  const bound = read.bind('snapshot').build();
  Reflect.set(bound.grants[0]!.actions[0]!.policy!, 'fields', []);
  expect(
    read.bind('snapshot').build().grants[0]?.actions[0]?.policy?.fields,
  ).toEqual(['id']);
});

it('keeps multi-table selections and defaults through binding and expansion', async () => {
  const own = defineRecordAccess('own', (access) =>
    access.collections('quotes').resolver(() => true),
  ).reference();
  const quotes = defineDatabasePermission((p) =>
    p.collection('quotes').read(['id']).options(own).default(own),
  );
  const projects = defineDatabasePermission((p) =>
    p.collection('projects').read(['id']),
  );
  const resource = defineComposite('submit', (r) =>
    r.action('run', (a) =>
      a.grant('quotes', quotes).grant('projects', projects),
    ),
  );
  const seen: unknown[] = [];
  const grant = resource.reference().grant({ run: { projects: 'regional' } });
  const authz = createAuthorization({
    plugins: [
      {
        id: 'grants',
        grants: {
          resolveAll: async () =>
            grant.actions.map((entry) => ({
              source: { plugin: 'test', id: 'test' },
              resource: grant.resource,
              ...entry,
            })),
          resolve: async () => [],
        },
      },
      {
        id: 'collections',
        setup(host) {
          host.resourceTypes.add({
            type: 'database.collection',
            actions: ['read'],
            recordAccess: true,
            async authorize(request, context) {
              for (const item of await context.grants.resolve(request))
                seen.push(item.origin?.selection);
              return { effect: 'permit', reasons: [] };
            },
          });
        },
      },
    ],
  });
  authz.composites.define(resource);
  const context = authz.for({ principal: { type: 'user', id: 'alice' } });
  for (const id of ['quotes', 'projects'])
    await context.authorize({
      resource: { type: 'database.collection', id },
      action: 'read',
    });
  expect(seen).toEqual([
    selection.recordAccess('own'),
    selection.recordAccess('regional'),
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
    new CompositeActionBuilder()
      .grant('rows', permission)
      .grant('rows' as never, permission),
  ).toThrow('Duplicate');
  expect(() => permission.bind('')).toThrow('needs a key');
  expect(() =>
    permission.options({ key: 'foreign', collections: ['other'] }),
  ).toThrow('does not apply');
  expect(() =>
    permission
      .options({ key: 'own', collections: ['quotes'] })
      .default({ key: 'other', collections: ['quotes'] } as never),
  ).toThrow('Invalid default');
});

it('registers settings items and collections and builds page grants', () => {
  const db = new DatabaseAuthorizationService();
  db.collections.add({
    name: 'quotes',
    title: 'Quotes',
    actions: ['read', 'update'],
  });
  expect(db.collections.has('quotes')).toBe(true);
  const pages = pagesPlugin().authorizationApi!.pages;
  expect(pages.grant('quotes')).toEqual({
    resource: { type: 'page', id: 'quotes' },
    actions: [{ action: 'access' }],
  });
  const settings = settingsPlugin();
  createAuthorization({ plugins: [settings] });
  settings.authorizationApi!.settings.add({
    id: 'workflow',
    title: 'Workflow',
    actions: [{ name: 'manage' }],
  });
  expect(
    settings.authorizationApi!.settings.grant('workflow', ['manage']),
  ).toEqual({
    resource: { type: 'settings', id: 'workflow' },
    actions: [{ action: 'manage' }],
  });
  expect(() =>
    settings.authorizationApi!.settings.grant('workflow', ['delete']),
  ).toThrow('has no action delete');
  expect(() =>
    settings.authorizationApi!.settings.grant('missing', ['manage']),
  ).toThrow('Unknown settings item');
});

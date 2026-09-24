import { describe, expect, it } from 'vitest';
import {
  ResourceItems,
  createAuthorization,
  grantBacked,
  type AuthorizationGrant,
  type AuthorizationGrantService,
} from '../src/core/index.js';

const source = { plugin: 'test', id: 'set' };
const alice = { principal: { type: 'user', id: 'alice' } };

function withGrants(
  grants: readonly Omit<AuthorizationGrant, 'source'>[],
  unrestricted = false,
): ReturnType<typeof createAuthorization> {
  const all = grants.map((grant) => ({ ...grant, source }));
  const service: AuthorizationGrantService = {
    resolveAll: () => Promise.resolve(all),
    resolve: (input) =>
      Promise.resolve(
        all.filter(
          (grant) =>
            grant.resource.type === input.resource.type &&
            (grant.resource.id === '*' ||
              grant.resource.id === input.resource.id) &&
            grant.action === input.action,
        ),
      ),
    unrestricted: () => Promise.resolve(unrestricted),
  };
  return createAuthorization({ plugins: [{ id: 'grants', grants: service }] });
}

describe('sections, subsections and resource groups', () => {
  const names = (authz: ReturnType<typeof createAuthorization>) =>
    authz.sections
      .tree()
      .map((section) => [
        section.name,
        section.subsections.map((subsection) => subsection.name),
      ]);

  it('registers the built-in sections through the same API', () => {
    const authz = createAuthorization({ plugins: [] });
    expect(names(authz)).toEqual([
      ['pages', []],
      ['business', []],
      ['administration', []],
    ]);
    authz.sections.add({ name: 'reports', title: 'Reports', order: 50 });
    authz.sections.add({ name: 'b', title: 'B', parent: 'business' });
    authz.sections.add({ name: 'a', title: 'A', parent: 'business', order: 1 });
    expect(names(authz)).toEqual([
      ['pages', []],
      ['reports', []],
      ['business', ['a', 'b']],
      ['administration', []],
    ]);
  });

  it('nests exactly one level under a known top-level section', () => {
    const authz = createAuthorization({ plugins: [] });
    expect(() =>
      authz.sections.add({ name: 'x', title: 'X', parent: 'missing' }),
    ).toThrow(/unknown parent/);
    authz.sections.add({ name: 'sales', title: 'Sales', parent: 'business' });
    expect(() =>
      authz.sections.add({ name: 'deals', title: 'Deals', parent: 'sales' }),
    ).toThrow(/cannot nest/);
    expect(() => authz.sections.add({ name: 'top', title: 'Top' })).toThrow(
      /needs an order/,
    );
    expect(authz.sections.isSubsection('sales')).toBe(true);
    expect(authz.sections.isSubsection('business')).toBe(false);
  });

  it('accepts an identical re-add and rejects any other', () => {
    const authz = createAuthorization({ plugins: [] });
    const reports = { name: 'reports', title: 'Reports', order: 50 };
    authz.sections.add(reports);
    authz.sections.add({ ...reports });
    expect(() => authz.sections.add({ ...reports, order: 60 })).toThrow(
      /already registered/,
    );
    const automation = {
      name: 'automation',
      title: 'Automation',
      parent: 'administration',
    };
    authz.sections.add(automation);
    authz.sections.add({ ...automation });
    expect(() =>
      authz.sections.add({ ...automation, parent: 'business' }),
    ).toThrow(/already registered/);
    expect(() =>
      authz.sections.add({
        name: 'pages',
        title: { key: 'sections.pages', ns: 'other' },
        order: 0,
      }),
    ).toThrow(/already registered/);

    authz.resourceGroups.add({ name: 'sales', title: 'Sales' });
    authz.resourceGroups.add({ name: 'sales', title: 'Sales' });
    authz.resourceGroups.add({
      name: 'deals',
      title: 'Deals',
      parent: 'sales',
    });
    expect(() =>
      authz.resourceGroups.add({ name: 'sales', title: 'Selling' }),
    ).toThrow(/already registered/);
    expect(() =>
      authz.resourceGroups.add({ name: 'x', title: 'X', parent: 'missing' }),
    ).toThrow(/unknown parent/);
    expect(authz.resourceGroups.list()).toEqual([
      { name: 'sales', title: 'Sales' },
      { name: 'deals', title: 'Deals', parent: 'sales' },
    ]);
  });

  it('validates the default section of a type and the subsection and group of an item', () => {
    const authz = createAuthorization({ plugins: [] });
    expect(() =>
      authz.resourceTypes.add({
        type: 'report',
        title: 'R',
        defaultSection: 'nope',
        actions: ['read'],
      }),
    ).toThrow(/unknown top-level section/);
    authz.sections.add({
      name: 'finance',
      title: 'Finance',
      parent: 'administration',
    });
    expect(() =>
      authz.resourceTypes.add({
        type: 'report',
        title: 'R',
        defaultSection: 'finance',
        actions: ['read'],
      }),
    ).toThrow(/unknown top-level section/);
    const items = new ResourceItems();
    authz.resourceTypes.add({
      type: 'report',
      title: 'Reports',
      defaultSection: 'administration',
      actions: ['read'],
      items,
    });
    expect(() =>
      items.add({ id: 'sales', title: 'Sales', section: 'administration' }),
    ).toThrow(/unknown subsection/);
    expect(() =>
      items.add({ id: 'sales', title: 'Sales', group: 'missing' }),
    ).toThrow(/unknown resource group/);
    authz.resourceGroups.add({ name: 'ledgers', title: 'Ledgers' });
    items.add({
      id: 'sales',
      title: 'Sales',
      section: 'finance',
      group: 'ledgers',
    });
    expect(authz.resourceTypes.get('report')).toMatchObject({
      type: 'report',
      title: 'Reports',
      defaultSection: 'administration',
    });
    expect(authz.resourceTypes.get('report').items).toBe(items);
    expect(() => authz.resourceTypes.get('missing')).toThrow(/not registered/);
  });

  it('lists an item without a subsection under the default section Other', () => {
    const authz = createAuthorization({ plugins: [] });
    const items = new ResourceItems();
    items.add({ id: 'costs', title: 'Costs' });
    authz.resourceTypes.add({
      type: 'report',
      title: 'Reports',
      defaultSection: 'administration',
      actions: ['read'],
      items,
    });
    expect(items.get('costs')?.section).toBe('administration.other');
    expect(authz.sections.get('administration.other')).toEqual({
      name: 'administration.other',
      title: { key: 'sections.other', ns: '@nocobase/authorization' },
      parent: 'administration',
      order: Number.MAX_SAFE_INTEGER,
    });
    authz.sections.add({
      name: 'sales',
      title: 'Sales',
      parent: 'administration',
    });
    expect(
      authz.sections
        .tree()
        .find((section) => section.name === 'administration')
        ?.subsections.map((subsection) => subsection.name),
    ).toEqual(['sales', 'administration.other']);
  });
});

describe('resource items', () => {
  it('inherits declared actions and their titles', () => {
    const authz = createAuthorization({ plugins: [] });
    const items = new ResourceItems();
    items.add({ id: 'sales', title: 'Sales' });
    items.add({
      id: 'costs',
      title: 'Costs',
      actions: [{ name: 'read', title: 'View' }],
    });
    authz.resourceTypes.add({
      type: 'report',
      title: 'Reports',
      items,
      actions: [{ name: 'read', title: 'Read' }, 'export'],
    });
    expect(items.list()).toEqual([
      {
        id: 'sales',
        title: 'Sales',
        actions: [{ name: 'read', title: 'Read' }, { name: 'export' }],
      },
      {
        id: 'costs',
        title: 'Costs',
        actions: [{ name: 'read', title: 'View' }],
      },
    ]);
    expect(() =>
      items.add({ id: 'bad', title: 'Bad', actions: ['delete'] }),
    ).toThrow(/does not declare action delete/);
    expect(() => items.add({ id: 'sales', title: 'Again' })).toThrow(
      /already registered/,
    );
  });

  it('requires item actions when the type declares none', () => {
    const authz = createAuthorization({ plugins: [] });
    const settings = new ResourceItems();
    authz.resourceTypes.add({ type: 'settings', title: 'S', items: settings });
    expect(() => settings.add({ id: 'workflow', title: 'W' })).toThrow(
      /needs actions/,
    );
    settings.add({ id: 'workflow', title: 'W', actions: ['manage'] });
    expect(settings.get('workflow')?.actions).toEqual([{ name: 'manage' }]);
  });

  it('denies an unregistered item or action, even without restriction', async () => {
    for (const unrestricted of [false, true]) {
      const authz = withGrants(
        [
          { resource: { type: 'report', id: '*' }, action: 'read' },
          { resource: { type: 'report', id: '*' }, action: 'delete' },
        ],
        unrestricted,
      );
      const items = new ResourceItems();
      authz.resourceTypes.add({ type: 'report', title: 'R', items });
      items.add({ id: 'sales', title: 'Sales', actions: ['read'] });
      const context = authz.for(alice);
      await expect(
        context.can({
          resource: { type: 'report', id: 'sales' },
          action: 'read',
        }),
      ).resolves.toBe(true);
      for (const request of [
        { resource: { type: 'report', id: 'costs' }, action: 'read' },
        { resource: { type: 'report', id: 'sales' }, action: 'delete' },
      ])
        await expect(context.authorize(request)).resolves.toMatchObject({
          effect: 'deny',
          reasons: [{ code: 'RESOURCE_ACTION_NOT_SUPPORTED' }],
        });
    }
  });

  it('needs items or declared actions', () => {
    const authz = createAuthorization({ plugins: [] });
    expect(() => authz.resourceTypes.add({ type: 'bare', title: 'B' })).toThrow(
      /needs items or declared actions/,
    );
  });

  it('accepts any record id for a declared action and denies an undeclared one', async () => {
    const authz = withGrants([
      { resource: { type: 'hub.app', id: '*' }, action: 'read' },
      { resource: { type: 'hub.app', id: '*' }, action: 'erase' },
    ]);
    const registered = authz.resourceTypes.add({
      type: 'hub.app',
      title: 'Apps',
      actions: ['read'],
    });
    expect(registered.items).toBeUndefined();
    expect(registered.actions).toEqual([{ name: 'read' }]);
    const context = authz.for(alice);
    for (const id of ['app-1', 'app-2', '*'])
      await expect(
        context.can({ resource: { type: 'hub.app', id }, action: 'read' }),
      ).resolves.toBe(true);
    await expect(
      context.authorize({
        resource: { type: 'hub.app', id: 'app-1' },
        action: 'erase',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'RESOURCE_ACTION_NOT_SUPPORTED' }],
    });
  });

  it('treats page as a record type', async () => {
    const authz = withGrants([
      { resource: { type: 'page', id: 'orders' }, action: 'access' },
    ]);
    authz.resourceTypes.add({
      type: 'page',
      title: 'Pages',
      section: 'pages',
      actions: ['access'],
    });
    const context = authz.for(alice);
    await expect(
      context.can({
        resource: { type: 'page', id: 'orders' },
        action: 'access',
      }),
    ).resolves.toBe(true);
    await expect(
      context.can({
        resource: { type: 'page', id: 'other' },
        action: 'access',
      }),
    ).resolves.toBe(false);
    await expect(
      context.authorize({
        resource: { type: 'page', id: 'orders' },
        action: 'edit',
      }),
    ).resolves.toMatchObject({
      reasons: [{ code: 'RESOURCE_ACTION_NOT_SUPPORTED' }],
    });
  });
});

describe('grantBacked', () => {
  it('permits only on a policy-less matching grant', async () => {
    const authz = withGrants([
      { resource: { type: 'user', id: '*' }, action: 'read' },
      {
        resource: { type: 'user', id: '*' },
        action: 'update',
        policy: { type: 'custom' },
      },
    ]);
    authz.resourceTypes.add({
      type: 'user',
      title: 'Users',
      actions: ['read', 'update'],
      authorize: grantBacked(),
    });
    const context = authz.for(alice);
    await expect(
      context.authorize({
        resource: { type: 'user', id: 'u1' },
        action: 'read',
      }),
    ).resolves.toMatchObject({
      effect: 'permit',
      reasons: [{ code: 'GRANT_MATCHED' }],
    });
    await expect(
      context.authorize({
        resource: { type: 'user', id: 'u1' },
        action: 'update',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'NO_MATCHING_GRANT' }],
    });
  });

  it('checks the extra condition once a grant matches', async () => {
    const authz = withGrants([
      { resource: { type: 'hub.app', id: '*' }, action: 'read' },
    ]);
    const seen: number[] = [];
    authz.resourceTypes.add({
      type: 'hub.app',
      title: 'Apps',
      actions: ['read'],
      authorize: grantBacked({
        also: (request, grants) => {
          seen.push(grants.length);
          return Promise.resolve(request.resource.id === 'mine');
        },
      }),
    });
    const context = authz.for(alice);
    await expect(
      context.can({
        resource: { type: 'hub.app', id: 'mine' },
        action: 'read',
      }),
    ).resolves.toBe(true);
    await expect(
      context.can({
        resource: { type: 'hub.app', id: 'other' },
        action: 'read',
      }),
    ).resolves.toBe(false);
    expect(seen).toEqual([1, 1]);
  });

  it('is the default and a type action may override it', async () => {
    const authz = withGrants([
      { resource: { type: 'job', id: 'nightly' }, action: 'run' },
    ]);
    const jobs = new ResourceItems();
    authz.resourceTypes.add({
      type: 'job',
      title: 'Jobs',
      items: jobs,
      actions: [
        'run',
        {
          name: 'inspect',
          authorize: () => Promise.resolve({ effect: 'permit', reasons: [] }),
        },
      ],
    });
    jobs.add({ id: 'nightly', title: 'Nightly' });
    const context = authz.for(alice);
    await expect(
      context.can({ resource: { type: 'job', id: 'nightly' }, action: 'run' }),
    ).resolves.toBe(true);
    await expect(
      context.can({
        resource: { type: 'job', id: 'nightly' },
        action: 'inspect',
      }),
    ).resolves.toBe(true);
  });
});

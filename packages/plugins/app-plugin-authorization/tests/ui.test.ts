import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComposite } from '@nocobase/authorization/core';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  AUTHORIZATION_NAMESPACE,
  AuthorizationProvider,
  authorizationToken,
  createAppAuthorization,
  reportAuthorizationUi,
  type AppAuthorization,
} from '../server/index.js';
import { authorizationOptions } from '../server/options.js';

const names = (authz: AppAuthorization): [string, string[]][] =>
  authz.ui.sections
    .tree()
    .map((section) => [
      section.name,
      section.subsections.map((subsection) => subsection.name),
    ]);

const quotes = defineComposite('sales.quotes', (resource) =>
  resource.title('Quotes').action('view', (action) =>
    action.grant({
      build: () => ({
        grants: [
          {
            resource: { type: 'database.collection', id: 'quotes' },
            actions: [{ action: 'read' }],
          },
        ],
      }),
    }),
  ),
);

describe('authz.ui sections', () => {
  it('registers the built-in sections, the authorization subsection and the defaults', () => {
    const authz = createAppAuthorization({});
    expect(names(authz)).toEqual([
      ['pages', []],
      ['business', []],
      ['administration', ['authorization']],
    ]);
    expect(authz.ui.sections.get('business')).toEqual({
      name: 'business',
      title: { key: 'sections.business', ns: AUTHORIZATION_NAMESPACE },
      order: 100,
    });
    expect(authz.ui.defaultSectionOf('page')).toBe('pages');
    expect(authz.ui.defaultSectionOf('composite')).toBe('business');
    expect(authz.ui.defaultSectionOf('settings')).toBe('administration');
    expect(authz.ui.defaultSectionOf('database.collection')).toBeUndefined();
  });

  it('orders sections and nests exactly one level under a known top-level section', () => {
    const authz = createAppAuthorization({});
    authz.ui.sections.add({ name: 'reports', title: 'Reports', order: 50 });
    authz.ui.sections.add({ name: 'b', title: 'B', parent: 'business' });
    authz.ui.sections.add({
      name: 'a',
      title: 'A',
      parent: 'business',
      order: 1,
    });
    expect(names(authz).slice(0, 3)).toEqual([
      ['pages', []],
      ['reports', []],
      ['business', ['a', 'b']],
    ]);
    expect(() =>
      authz.ui.sections.add({ name: 'x', title: 'X', parent: 'missing' }),
    ).toThrow(/unknown parent/);
    expect(() =>
      authz.ui.sections.add({ name: 'deep', title: 'Deep', parent: 'a' }),
    ).toThrow(/cannot nest/);
    expect(() => authz.ui.sections.add({ name: 'top', title: 'Top' })).toThrow(
      /needs an order/,
    );
  });

  it('accepts a deep-equal re-add and rejects any other', () => {
    const authz = createAppAuthorization({});
    const automation = {
      name: 'automation',
      title: 'Automation',
      parent: 'administration',
    };
    authz.ui.sections.add(automation);
    authz.ui.sections.add({ ...automation });
    expect(() =>
      authz.ui.sections.add({ ...automation, title: 'Jobs' }),
    ).toThrow(/already registered/);
    expect(() =>
      authz.ui.sections.add({ name: 'pages', title: 'Pages', order: 0 }),
    ).toThrow(/already registered/);
  });

  describe('extending a subsection another plugin owns', () => {
    const owner = {
      name: 'automation',
      title: { key: 'nav.automation', ns: 'workflow' },
      parent: 'administration',
    };
    const extension = {
      name: 'automation',
      title: { key: 'nav.automation', ns: 'scheduler' },
      parent: 'administration',
      extend: true,
    };

    it('does nothing when the owner booted first', () => {
      const authz = createAppAuthorization({});
      authz.ui.sections.add(owner);
      authz.ui.sections.add(extension);
      expect(authz.ui.sections.get('automation')).toEqual(owner);
    });

    it('creates the subsection and yields to an owner that boots later', () => {
      const authz = createAppAuthorization({});
      authz.ui.sections.add({ ...extension, order: 5 });
      const { extend: _extend, ...created } = { ...extension, order: 5 };
      expect(authz.ui.sections.get('automation')).toEqual(created);
      authz.ui.sections.add(owner);
      expect(authz.ui.sections.get('automation')).toEqual(owner);
      expect(() =>
        authz.ui.sections.add({ ...owner, title: 'Automation' }),
      ).toThrow(/already registered/);
    });

    it('throws for an owner under another parent, or an extend on a top-level section', () => {
      const authz = createAppAuthorization({});
      authz.ui.sections.add(extension);
      expect(() =>
        authz.ui.sections.add({ ...owner, parent: 'business' }),
      ).toThrow(/already registered under administration/);
      expect(() =>
        authz.ui.sections.add({
          name: 'top',
          title: 'Top',
          order: 1,
          extend: true,
        }),
      ).toThrow(/only as a subsection/);
    });
  });
});

describe('authz.ui groups and placement', () => {
  it('nests groups to any depth and rejects a conflicting re-add', () => {
    const authz = createAppAuthorization({});
    authz.ui.groups.add({ name: 'ledgers', title: 'Ledgers' });
    authz.ui.groups.add({ name: 'ledgers', title: 'Ledgers' });
    authz.ui.groups.add({
      name: 'payables',
      title: 'Payables',
      parent: 'ledgers',
    });
    authz.ui.groups.add({ name: 'bills', title: 'Bills', parent: 'payables' });
    expect(() =>
      authz.ui.groups.add({ name: 'ledgers', title: 'Books' }),
    ).toThrow(/already registered/);
    expect(() =>
      authz.ui.groups.add({ name: 'x', title: 'X', parent: 'missing' }),
    ).toThrow(/unknown parent/);
    expect(authz.ui.groups.list().map((group) => group.name)).toEqual([
      'ledgers',
      'payables',
      'bills',
    ]);
  });

  it('places a ref or a composite reference in a subsection only', () => {
    const authz = createAppAuthorization({});
    authz.database.collections.add({ name: 'quotes', title: 'Quotes' });
    const reference = authz.composites.define(quotes);
    authz.ui.sections.add({
      name: 'sales',
      title: 'Sales',
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'sales' });
    authz.ui.place(
      { type: 'composite', id: 'sales.quotes' },
      { section: 'sales' },
    );
    expect(
      authz.ui.placementOf({ type: 'composite', id: 'sales.quotes' }),
    ).toEqual({ section: 'sales' });
    expect(() =>
      authz.ui.place(reference, { section: 'sales', group: 'other' }),
    ).toThrow(/already placed/);
    expect(() =>
      authz.ui.place({ type: 'settings', id: 'x' }, { section: 'business' }),
    ).toThrow(/only in a subsection/);
  });

  it('checks the default section of a type', () => {
    const authz = createAppAuthorization({});
    expect(() => authz.ui.defaultSection('report', 'missing')).toThrow(
      /unknown top-level section/,
    );
    expect(() => authz.ui.defaultSection('report', 'authorization')).toThrow(
      /unknown top-level section/,
    );
    authz.ui.defaultSection('report', 'administration');
    authz.ui.defaultSection('report', 'administration');
    expect(() => authz.ui.defaultSection('report', 'business')).toThrow(
      /already defaults/,
    );
  });

  it('lists an unplaced item under its default section Other, and a placed one in its group', async () => {
    const authz = createAppAuthorization({});
    authz.database.collections.add({ name: 'quotes', title: 'Quotes' });
    authz.composites.define(quotes);
    authz.settings.add({ id: 'misc', title: 'Misc', actions: ['manage'] });
    authz.settings.add({ id: 'bills', title: 'Bills', actions: ['manage'] });
    authz.ui.groups.add({ name: 'ledgers', title: 'Ledgers' });
    authz.ui.place(
      { type: 'settings', id: 'bills' },
      { section: 'authorization', group: 'ledgers' },
    );
    const options = await authorizationOptions(authz);
    const subsections = (name: string) =>
      options.sections.find((section) => section.name === name)?.subsections;
    expect(subsections('business')).toMatchObject([
      {
        name: 'business.other',
        title: { key: 'sections.other', ns: AUTHORIZATION_NAMESPACE },
        resources: [{ type: 'composite', id: 'sales.quotes' }],
      },
    ]);
    expect(
      subsections('administration')?.map((subsection) => [
        subsection.name,
        subsection.resources.map((resource) => [resource.id, resource.group]),
      ]),
    ).toEqual([
      [
        'authorization',
        [
          ['authorization.permission-sets', undefined],
          ['authorization.inspector', undefined],
          ['bills', 'ledgers'],
        ],
      ],
      ['administration.other', [['misc', undefined]]],
    ]);
    expect(options.resourceGroups).toEqual([
      { name: 'ledgers', title: 'Ledgers' },
    ]);
  });
});

describe('authz.ui startup validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports unknown subsections, groups and resources, and warns about unplaced items', () => {
    const authz = createAppAuthorization({});
    authz.database.collections.add({ name: 'quotes', title: 'Quotes' });
    authz.composites.define(quotes);
    authz.settings.add({ id: 'misc', title: 'Misc', actions: ['manage'] });
    authz.ui.place({ type: 'settings', id: 'misc' }, { section: 'nowhere' });
    authz.settings.add({ id: 'bills', title: 'Bills', actions: ['manage'] });
    authz.ui.place(
      { type: 'settings', id: 'bills' },
      { section: 'authorization', group: 'missing' },
    );
    authz.ui.place(
      { type: 'settings', id: 'ghost' },
      { section: 'authorization' },
    );
    authz.ui.place({ type: 'unknown', id: 'x' }, { section: 'authorization' });
    const report = authz.ui.validate(authz);
    expect(report.errors).toEqual([
      'settings:misc is placed in unknown subsection nowhere',
      'settings:bills is placed in unknown group missing',
      'settings:ghost is placed but not registered',
      'unknown:x is placed but not registered',
    ]);
    expect(report.warnings).toEqual([
      'composite:sales.quotes is not placed; it is listed under business.other',
    ]);
  });

  it('includes composites whose data scope targets a type without recordAccess', () => {
    const authz = createAppAuthorization({});
    authz.composites.define({
      name: 'ledger.view',
      title: 'Ledger',
      actions: [
        {
          name: 'view',
          title: 'View',
          dataScopes: [{ key: 'rows', title: 'Rows' }],
          grants: [
            {
              resource: { type: 'ledger', id: 'main' },
              actions: [{ action: 'read', scopeKey: 'rows' }],
            },
          ],
        },
      ],
    });
    authz.resourceTypes.add({ type: 'ledger', title: 'L', actions: ['read'] });
    authz.ui.place(
      { type: 'composite', id: 'ledger.view' },
      { section: 'authorization' },
    );
    expect(authz.ui.validate(authz).errors).toEqual([
      'Data scope ledger.view.view.rows targets resource type ledger, which does not declare recordAccess',
    ]);
  });

  it('throws in development and warns in production', () => {
    const report = { errors: ['broken'], warnings: ['unplaced'] };
    const warn = vi.fn();
    expect(() =>
      reportAuthorizationUi(report, { production: false, warn }),
    ).toThrow(/misconfigured:\n- broken/);
    expect(warn).toHaveBeenCalledWith('Authorization workspace: unplaced');
    warn.mockClear();
    reportAuthorizationUi(report, { production: true, warn });
    expect(warn.mock.calls).toEqual([
      ['Authorization workspace: unplaced'],
      ['Authorization workspace: broken'],
    ]);
  });

  it('runs when the provider starts, after every plugin has booted', async () => {
    const container = new ServiceContainer();
    const app = {
      container,
      config: { get: () => undefined },
    } as unknown as AppPluginApplication;
    const provider = new AuthorizationProvider(app);
    provider.register();
    await provider.boot();
    const authz = container.resolve(authorizationToken);
    authz.ui.place(
      { type: 'settings', id: 'ghost' },
      { section: 'authorization' },
    );
    vi.stubEnv('NODE_ENV', 'development');
    await expect(provider.start()).rejects.toThrow(
      'settings:ghost is placed but not registered',
    );
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(provider.start()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Authorization workspace: settings:ghost is placed but not registered',
    );
    warn.mockRestore();
  });
});

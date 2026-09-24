import { describe, expect, it, vi } from 'vitest';
import {
  businessPlugin,
  createAuthorization,
  defineBusinessResource,
  selection,
  type AccessConstraint,
  type AuthorizationGrant,
  type AuthorizationGrantService,
  type AuthorizationPlugin,
  type BindableBusinessPermission,
  type BusinessContribution,
  type BusinessResource,
  type PermissionGrant,
  type ResolveAccessConstraintsInput,
} from '../src/core/index.js';

type Access = 'recordsIOwn' | 'allRecords';

/** A stand-in for the database plugin's collection permission. */
class CollectionPermission implements BindableBusinessPermission {
  declare readonly recordAccessSelection?: Access;
  constructor(
    private readonly collection: string,
    private readonly actions: readonly string[],
  ) {}
  bind<K extends string>(key: K): BusinessContribution<Record<K, Access>> {
    return {
      build: () => ({
        grants: [
          {
            resource: { type: 'database.collection', id: this.collection },
            actions: this.actions.map((action) => ({
              action,
              policy: { type: 'database', fields: '*' },
              scopeKey: key,
            })),
          },
        ],
        dataScopes: [
          {
            key,
            title: this.collection,
            collection: this.collection,
            options: ['recordsIOwn', 'allRecords'],
            defaultValue: 'recordsIOwn',
          },
        ],
      }),
    };
  }
}

const quotes = defineBusinessResource('sales.quotes', (resource) =>
  resource
    .title('Quotes')
    .group('sales')
    .action('submit', (action) =>
      action
        .title('Submit')
        .grant(
          'quotes',
          new CollectionPermission('quotes', ['read', 'update']),
        ),
    )
    .action('export', (action) =>
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

const quotesObject: BusinessResource = {
  name: 'sales.quotes',
  title: 'Quotes',
  group: 'sales',
  actions: [
    {
      name: 'submit',
      title: 'Submit',
      dataScopes: [
        {
          key: 'quotes',
          title: 'quotes',
          collection: 'quotes',
          options: ['recordsIOwn', 'allRecords'],
          defaultValue: 'recordsIOwn',
        },
      ],
      grants: [
        {
          resource: { type: 'database.collection', id: 'quotes' },
          actions: ['read', 'update'].map((action) => ({
            action,
            policy: { type: 'database', fields: '*' },
            scopeKey: 'quotes',
          })),
        },
      ],
    },
    {
      name: 'export',
      title: 'export',
      grants: [
        {
          resource: { type: 'database.collection', id: 'quotes' },
          actions: [{ action: 'read' }],
        },
      ],
    },
  ],
};

const source = { plugin: 'test', id: 'set' };
const alice = { principal: { type: 'user', id: 'alice' } };

function provider(
  grants: readonly PermissionGrant[],
): AuthorizationGrantService {
  const all: AuthorizationGrant[] = grants.flatMap((grant) =>
    grant.actions.map((entry) => ({
      source,
      resource: grant.resource,
      action: entry.action,
      ...(entry.policy ? { policy: entry.policy } : {}),
    })),
  );
  return {
    resolveAll: () => Promise.resolve(all),
    resolve: (input) =>
      Promise.resolve(
        all.filter(
          (grant) =>
            grant.resource.type === input.resource.type &&
            grant.resource.id === input.resource.id &&
            grant.action === input.action,
        ),
      ),
  };
}

function setup(
  grants: readonly PermissionGrant[] = [],
  extra: readonly AuthorizationPlugin[] = [],
) {
  const authz = createAuthorization({
    plugins: [
      businessPlugin(),
      { id: 'grants', grants: provider(grants) },
      ...extra,
    ],
  });
  authz.groups.add({ name: 'sales', title: 'Sales' });
  return authz;
}

describe('business resources', () => {
  it('builds the same definition in object and builder form', () => {
    expect(quotes.build()).toEqual(quotesObject);
    const built = quotes.build();
    built.title = 'Mutated';
    expect(quotes.build().title).toBe('Quotes');
  });

  it('registers either form as an item of the business type', () => {
    for (const definition of [quotes, quotesObject]) {
      const authz = setup();
      const reference = authz.business.define(definition);
      expect(reference.name).toBe('sales.quotes');
      expect(authz.business.list()).toEqual([quotesObject]);
      expect(authz.business.getAction('sales.quotes', 'export')).toEqual(
        quotesObject.actions[1],
      );
      const business = authz.resourceTypes.get('business');
      expect(business.section).toBe('business');
      expect(business.items.list()).toEqual([
        {
          id: 'sales.quotes',
          title: 'Quotes',
          group: 'sales',
          actions: [
            { name: 'submit', title: 'Submit' },
            { name: 'export', title: 'export' },
          ],
        },
      ]);
      expect(() => authz.business.define(definition)).toThrow(
        'already defined',
      );
    }
  });

  it('composes only collection grants', () => {
    const authz = setup();
    authz.groups.add({ name: 'system', title: 'System' });
    for (const type of ['page', 'settings', 'workflow'])
      expect(() =>
        authz.business.define({
          ...quotesObject,
          name: `x.${type}`,
          group: 'system',
          actions: [
            {
              name: 'view',
              title: 'View',
              grants: [
                {
                  resource: { type, id: 'orders' },
                  actions: [{ action: 'read' }],
                },
              ],
            },
          ],
        }),
      ).toThrow('may only compose database.collection');
  });

  it('rejects incomplete definitions and unknown groups', () => {
    const authz = setup();
    expect(() =>
      defineBusinessResource('quotes', (resource) => resource.group('sales')),
    ).toThrow('needs unique, nonempty actions');
    expect(() =>
      defineBusinessResource('quotes', (resource) =>
        resource.group('sales').action('view', (action) => action),
      ),
    ).toThrow('grants nothing');
    expect(() =>
      authz.business.define({ ...quotesObject, group: 'missing' }),
    ).toThrow('unknown group');
    const [submit] = quotesObject.actions;
    expect(() =>
      authz.business.define({
        ...quotesObject,
        actions: [{ ...submit!, dataScopes: [] }],
      }),
    ).toThrow('unknown data scope');
    expect(() =>
      authz.business.define({
        ...quotesObject,
        actions: [
          {
            ...submit!,
            dataScopes: [
              ...submit!.dataScopes!,
              { key: 'orders', title: 'Orders', collection: 'orders' },
            ],
          },
        ],
      }),
    ).toThrow('is not used by a grant');
  });

  it('builds typed grants whose policy names data scopes', () => {
    const reference = quotes.reference();
    expect(reference.grant('submit', 'export')).toEqual({
      resource: { type: 'business', id: 'sales.quotes' },
      actions: [{ action: 'submit' }, { action: 'export' }],
    });
    expect(reference.grant({ submit: { quotes: 'allRecords' } })).toEqual({
      resource: { type: 'business', id: 'sales.quotes' },
      actions: [
        {
          action: 'submit',
          policy: { type: 'business', scopes: { quotes: 'allRecords' } },
        },
      ],
    });
    expect(reference.scope('submit', 'quotes')).toEqual({
      action: 'submit',
      scopeKey: 'quotes',
    });
    expect(() =>
      reference.grant({ submit: { quotes: 'other' as Access } }),
    ).toThrow('does not offer other');
    expect(() => reference.scope('export', 'quotes' as never)).toThrow(
      'Unknown business data scope',
    );
  });
});

describe('business authorization', () => {
  it('checks each composed collection once, with that action’s grants only', async () => {
    const calls: { action: string; grants: readonly AuthorizationGrant[] }[] =
      [];
    const database: AuthorizationPlugin = {
      id: 'database',
      composeConditions: (checks) => ({ tables: checks.length }),
      setup(authz) {
        authz.resourceTypes.add({
          type: 'database.collection',
          title: 'Collections',
          actions: ['read', 'create', 'update', 'delete'],
          async authorize(request, context) {
            const grants = await context.grants.resolve(request);
            calls.push({ action: request.action, grants });
            return {
              effect: 'conditional',
              conditions: { type: 'database', count: grants.length },
              reasons: [],
            };
          },
        });
      },
    };
    const reference = quotes.reference();
    const authz = setup(
      [
        reference.grant({ submit: { quotes: 'allRecords' } }),
        reference.grant('export'),
      ],
      [database],
    );
    authz.business.define(quotes);
    const decision = await authz.for(alice).authorize({
      resource: { type: 'business', id: 'sales.quotes' },
      action: 'submit',
    });
    expect(decision.effect).toBe('conditional');
    expect(decision.conditions?.type).toBe('business');
    expect(decision.conditions?.checks.map((check) => check.action)).toEqual([
      'read',
      'update',
    ]);
    expect(Reflect.get(decision.conditions ?? {}, 'tables')).toBe(2);
    expect(calls.map((call) => call.action)).toEqual(['read', 'update']);
    expect(calls[0]!.grants).toEqual([
      expect.objectContaining({
        resource: { type: 'database.collection', id: 'quotes' },
        policy: { type: 'database', fields: '*' },
        origin: {
          resource: { type: 'business', id: 'sales.quotes' },
          action: 'submit',
          scopeKey: 'quotes',
          selection: selection.recordAccess('allRecords'),
          constraints: [],
        },
      }),
    ]);
    await expect(
      authz.for(alice).can({
        resource: { type: 'business', id: 'sales.quotes' },
        action: 'submit',
      }),
    ).resolves.toBe(true);
  });

  it.each([
    [undefined, selection.recordAccess('recordsIOwn')],
    ['', undefined],
  ] as const)(
    'fills an unset data scope with its default (%j)',
    async (value, expected) => {
      const reference = quotes.reference();
      const seen: AuthorizationGrant[] = [];
      const authz = setup(
        [
          value === undefined
            ? reference.grant('submit')
            : reference.grant({ submit: { quotes: value } }),
        ],
        [
          {
            id: 'database',
            setup(host) {
              host.resourceTypes.add({
                type: 'database.collection',
                title: 'Collections',
                actions: ['read', 'create', 'update', 'delete'],
                async authorize(request, context) {
                  seen.push(...(await context.grants.resolve(request)));
                  return { effect: 'permit', reasons: [] };
                },
              });
            },
          },
        ],
      );
      authz.business.define(quotes);
      await expect(
        authz.for(alice).authorize({
          resource: { type: 'business', id: 'sales.quotes' },
          action: 'submit',
        }),
      ).resolves.toMatchObject({ effect: 'permit' });
      expect(seen.map((grant) => grant.origin?.selection)).toEqual([
        expected,
        expected,
      ]);
    },
  );

  it('denies a stored business policy the definition does not accept', async () => {
    const authz = setup([
      {
        resource: { type: 'business', id: 'sales.quotes' },
        actions: [
          {
            action: 'submit',
            policy: { type: 'business', scopes: { missing: 'allRecords' } },
          },
        ],
      },
    ]);
    authz.business.define(quotes);
    await expect(
      authz.for(alice).authorize({
        resource: { type: 'business', id: 'sales.quotes' },
        action: 'submit',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'AUTHORIZATION_HANDLER_FAILED' }],
    });
  });

  it('shares branch constraints within a context and not across contexts', async () => {
    let revision = 1;
    const resolve = vi.fn(
      async (
        input: ResolveAccessConstraintsInput,
      ): Promise<readonly AccessConstraint[]> => [
        {
          source: { plugin: 'rules', id: String(revision) },
          effect: 'restrict',
          selection: selection.records([
            `${input.principal.id}:${input.scopeKey}:${revision}`,
          ]),
        },
      ],
    );
    const bound = vi.fn(() => ({ id: 'rules', resolve }));
    const received: (readonly AccessConstraint[] | undefined)[] = [];
    const rules: AuthorizationPlugin = {
      id: 'rules',
      setup(host) {
        host.constraints.add({ id: 'rules', resolve, for: bound });
        host.resourceTypes.add({
          type: 'database.collection',
          title: 'Collections',
          actions: ['read', 'create', 'update', 'delete'],
          async authorize(request, context) {
            for (const grant of await context.grants.resolve(request))
              received.push(grant.origin?.constraints);
            return { effect: 'permit', reasons: [] };
          },
        });
      },
    };
    const authz = setup([quotes.reference().grant('submit')], [rules]);
    authz.business.define(quotes);
    const request = {
      resource: { type: 'database.collection', id: 'quotes' },
      action: 'read',
    };
    const context = authz.for(alice);
    await Promise.all([context.authorize(request), context.authorize(request)]);
    revision = 2;
    await context.authorize(request);
    await authz.for(alice).authorize(request);
    await authz
      .for({ principal: { type: 'user', id: 'bob' } })
      .authorize(request);
    expect(received.map((value) => value?.[0]?.selection)).toEqual([
      selection.records(['alice:quotes:1']),
      selection.records(['alice:quotes:1']),
      selection.records(['alice:quotes:1']),
      selection.records(['alice:quotes:2']),
      selection.records(['bob:quotes:2']),
    ]);
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(bound).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  AuthorizationDeniedError,
  createAuthorization,
  type AuthorizationEnv,
  type AuthorizationGrantService,
  type AuthorizationPlugin,
} from '../src/core/index.js';

const emptyGrants: AuthorizationGrantService = {
  resolve: () => Promise.resolve([]),
  resolveAll: () => Promise.resolve([]),
};

function plugin(
  id: string,
  options: {
    dependencies?: readonly string[];
    providesGrants?: boolean;
    requiresGrants?: boolean;
    effect?: 'permit' | 'conditional' | 'deny';
    throws?: boolean;
    order?: string[];
  } = {},
): AuthorizationPlugin {
  return {
    id,
    ...(options.dependencies ? { dependencies: options.dependencies } : {}),
    ...(options.providesGrants ? { grants: emptyGrants } : {}),
    ...(options.requiresGrants ? { requiresGrants: true } : {}),
    setup(authz): void {
      options.order?.push(id);
      authz.resourceTypes.add({
        type: id,
        actions: ['read'],
        async authorize() {
          if (options.throws) throw new Error('broken handler');
          const effect = options.effect ?? 'permit';
          return {
            effect,
            ...(effect === 'conditional'
              ? { conditions: { type: 'test', constrained: true } }
              : {}),
            reasons: [],
          };
        },
      });
    },
  };
}

const alice = { principal: { type: 'user', id: 'alice' } };
const check = (type: string) => ({
  resource: { type, id: 'resource' },
  action: 'read',
});

describe('Authorization Core', () => {
  it('lets applications register a resource type directly', async () => {
    const authorization = createAuthorization({ plugins: [] });
    authorization.resourceTypes.add<{ userId: string }>({
      type: 'post',
      actions: ['update'],
      authorize(request) {
        return Promise.resolve({
          effect:
            request.action === 'update' &&
            request.principal.id === request.params.userId
              ? 'permit'
              : 'deny',
          reasons: [],
        });
      },
    });

    await expect(
      authorization.for(alice).can<{ userId: string }>({
        resource: { type: 'post', id: 'post-1' },
        action: 'update',
        params: { userId: 'alice' },
      }),
    ).resolves.toBe(true);
  });

  it('sets plugins up in dependency order', () => {
    const order: string[] = [];
    createAuthorization({
      plugins: [
        plugin('database', { dependencies: ['permissions'], order }),
        plugin('permissions', { order }),
      ],
    });
    expect(order).toEqual(['permissions', 'database']);
  });

  it('collects access constraints from installed plugins', async () => {
    const authorization = createAuthorization({
      plugins: [
        {
          id: 'sharing',
          setup(authz): void {
            authz.constraints.add({
              id: 'sharing',
              resolve: (input) =>
                Promise.resolve([
                  {
                    source: { plugin: 'sharing', id: 'shared-order' },
                    effect: 'expand',
                    selection: { type: 'records', ids: [input.resource.id] },
                  },
                ]),
            });
          },
        },
      ],
    });

    await expect(
      authorization.constraints.resolve({
        ...alice,
        resource: { type: 'order', id: 'order-1' },
        action: 'read',
      }),
    ).resolves.toEqual([
      {
        source: { plugin: 'sharing', id: 'shared-order' },
        effect: 'expand',
        selection: { type: 'records', ids: ['order-1'] },
      },
    ]);
    expect(authorization.constraints.list()).toEqual(['sharing']);
  });

  it('fails fast for duplicate, missing, and circular plugins', () => {
    expect(() =>
      createAuthorization({ plugins: [plugin('a'), plugin('a')] }),
    ).toThrow(/already installed/);
    expect(() =>
      createAuthorization({ plugins: [plugin('a', { dependencies: ['b'] })] }),
    ).toThrow(/missing plugin/);
    expect(() =>
      createAuthorization({
        plugins: [
          plugin('a', { dependencies: ['b'] }),
          plugin('b', { dependencies: ['a'] }),
        ],
      }),
    ).toThrow(/Circular/);
  });

  it('sets the Grant Provider up before its consumers', () => {
    const order: string[] = [];
    createAuthorization({
      plugins: [
        plugin('consumer', { requiresGrants: true, order }),
        plugin('roles', { providesGrants: true, order }),
      ],
    });
    expect(order).toEqual(['roles', 'consumer']);
  });

  it('fails fast for missing and multiple Grant Providers', () => {
    expect(() =>
      createAuthorization({
        plugins: [plugin('database', { requiresGrants: true })],
      }),
    ).toThrow(/requires a Grant Provider/);
    expect(() =>
      createAuthorization({
        plugins: [
          plugin('roles', { providesGrants: true }),
          plugin('permission-sets', { providesGrants: true }),
        ],
      }),
    ).toThrow(/multiple Grant Providers/);
  });

  it('denies unknown resource types and handler failures', async () => {
    const context = createAuthorization({
      plugins: [plugin('broken', { throws: true })],
    }).for(alice);
    await expect(context.authorize(check('unknown'))).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'UNKNOWN_RESOURCE_TYPE' }],
    });
    await expect(context.authorize(check('broken'))).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'AUTHORIZATION_HANDLER_FAILED' }],
    });
  });

  it('does not treat conditional decisions as enforced', async () => {
    const context = createAuthorization({
      plugins: [plugin('orders', { effect: 'conditional' })],
    }).for(alice);
    await expect(context.can(check('orders'))).resolves.toBe(false);
    await expect(context.require(check('orders'))).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    await expect(context.authorize(check('orders'))).resolves.toMatchObject({
      effect: 'conditional',
    });
  });

  it('binds the identity once per context', async () => {
    let receivedPrincipal: string | undefined;
    let receivedSubject: string | undefined;
    const authorization = createAuthorization({ plugins: [] });
    authorization.resourceTypes.add({
      type: 'document',
      actions: ['read'],
      authorize(request) {
        receivedPrincipal = request.principal.id;
        receivedSubject = request.subjects?.[0]?.id;
        return Promise.resolve({ effect: 'permit', reasons: [] });
      },
    });
    const context = authorization.for({
      ...alice,
      subjects: [{ type: 'role', id: 'editor' }],
    });

    await expect(
      context.can({
        resource: { type: 'document', id: 'document-1' },
        action: 'read',
      }),
    ).resolves.toBe(true);
    expect(receivedPrincipal).toBe('alice');
    expect(receivedSubject).toBe('editor');
  });

  it('exposes the request context through middleware', async () => {
    const identityPlugin: AuthorizationPlugin = {
      id: 'identity',
      setup(authz): void {
        authz.use(async (request, next) => {
          request.principal = { type: 'user', id: 'alice' };
          await next();
        });
      },
    };
    const rolesPlugin: AuthorizationPlugin = {
      id: 'roles',
      dependencies: ['identity'],
      setup(authz): void {
        authz.use(async (request, next) => {
          if (!request.principal) throw new Error('Principal is required');
          request.subjects.add({ type: 'role', id: 'editor' });
          request.subjects.add({ type: 'role', id: 'editor' });
          await next();
        });
      },
    };
    const authorization = createAuthorization({
      plugins: [rolesPlugin, plugin('orders'), identityPlugin],
    });
    const router = new Hono<AuthorizationEnv>();
    router.use('*', authorization.middleware());
    router.get('/', async (context) => {
      const authz = context.get('authz');
      return context.json({
        allowed: await authz.can({
          resource: { type: 'orders', id: 'order-1' },
          action: 'read',
        }),
        principal: authz.identity.principal.id,
        subjects: authz.identity.subjects,
      });
    });

    await expect((await router.request('/')).json()).resolves.toEqual({
      allowed: true,
      principal: 'alice',
      subjects: [{ type: 'role', id: 'editor' }],
    });
  });

  it('gives plugins the same middleware through setup', async () => {
    let middleware: ReturnType<
      ReturnType<typeof createAuthorization>['middleware']
    > = () => Promise.resolve();
    const authorization = createAuthorization({
      plugins: [
        {
          id: 'routes',
          setup(authz): void {
            middleware = authz.middleware();
          },
        },
      ],
    });
    authorization.use(async (request, next) => {
      request.principal = { type: 'user', id: 'alice' };
      await next();
    });
    const router = new Hono<AuthorizationEnv>();
    router.use('*', middleware);
    router.get('/', (context) =>
      context.text(context.get('authz').identity.principal.id),
    );

    await expect((await router.request('/')).text()).resolves.toBe('alice');
  });

  it('fails when middleware does not resolve a principal', async () => {
    const authorization = createAuthorization({ plugins: [] });
    const router = new Hono<AuthorizationEnv>();
    router.onError((error, context) =>
      context.json({ message: error.message }, 500),
    );
    router.use('*', authorization.middleware());
    router.get('/', (context) => context.text('ok'));

    const response = await router.request('/');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Authorization principal was not resolved',
    });
  });

  it('hands route handlers the request context', async () => {
    const authorization = createAuthorization({
      plugins: [plugin('reports')],
    });
    authorization.routes.add('/reports', async ({ authorization: authz }) => {
      await authz.require({
        resource: { type: 'reports', id: 'sales' },
        action: 'read',
      });
      return Response.json({ ok: true });
    });
    const response = await authorization.routes.handle({
      request: new Request('http://localhost/reports/sales'),
      path: '/reports/sales',
      authorization: authorization.for(alice),
    });
    await expect(response?.json()).resolves.toEqual({ ok: true });
    expect(
      authorization.routes.handle({
        request: new Request('http://localhost/other'),
        path: '/other',
        authorization: authorization.for(alice),
      }),
    ).toBeUndefined();
  });
});

describe('the subject types an application declares', () => {
  it('passes every subject of an undeclared type through', async () => {
    const authorization = createAuthorization({ plugins: [] });

    await expect(
      authorization.subjects.filterActive([
        { type: 'authenticated', id: '*' },
        { type: 'team', id: 'sales' },
      ]),
    ).resolves.toEqual([
      { type: 'authenticated', id: '*' },
      { type: 'team', id: 'sales' },
    ]);
  });

  it('asks a declared type for its own ids and keeps the rest', async () => {
    const authorization = createAuthorization({ plugins: [] });
    const asked: (readonly string[])[] = [];
    authorization.subjects.add('user', {
      filterActive: (ids) => {
        asked.push(ids);
        return Promise.resolve(ids.filter((id) => id !== 'retired'));
      },
    });

    await expect(
      authorization.subjects.filterActive([
        { type: 'user', id: 'root' },
        { type: 'user', id: 'retired' },
        { type: 'authenticated', id: '*' },
      ]),
    ).resolves.toEqual([
      { type: 'user', id: 'root' },
      { type: 'authenticated', id: '*' },
    ]);
    expect(asked).toEqual([['root', 'retired']]);
  });

  it('groups a mixed list by type and hands each its own ids', async () => {
    const authorization = createAuthorization({ plugins: [] });
    const asked = new Map<string, readonly string[]>();
    for (const type of ['user', 'team']) {
      authorization.subjects.add(type, {
        filterActive: (ids) => {
          asked.set(type, ids);
          return Promise.resolve(ids.slice(0, 1));
        },
      });
    }

    await expect(
      authorization.subjects.filterActive([
        { type: 'user', id: 'root' },
        { type: 'team', id: 'sales' },
        { type: 'user', id: 'retired' },
        { type: 'team', id: 'closed' },
        { type: 'authenticated', id: '*' },
      ]),
    ).resolves.toEqual([
      { type: 'user', id: 'root' },
      { type: 'team', id: 'sales' },
      { type: 'authenticated', id: '*' },
    ]);
    expect([...asked]).toEqual([
      ['user', ['root', 'retired']],
      ['team', ['sales', 'closed']],
    ]);
  });

  it('rejects a second registration of one type', () => {
    const authorization = createAuthorization({ plugins: [] });
    authorization.subjects.add('user', {
      filterActive: (ids) => Promise.resolve(ids),
    });
    expect(() =>
      authorization.subjects.add('user', {
        filterActive: (ids) => Promise.resolve(ids),
      }),
    ).toThrow(/already registered/);
    expect(authorization.subjects.list()).toEqual(['user']);
  });

  it('releases a registration so the type passes through again', async () => {
    const authorization = createAuthorization({ plugins: [] });
    const release = authorization.subjects.add('user', {
      filterActive: () => Promise.resolve([]),
    });

    await expect(
      authorization.subjects.filterActive([{ type: 'user', id: 'root' }]),
    ).resolves.toEqual([]);
    release();
    await expect(
      authorization.subjects.filterActive([{ type: 'user', id: 'root' }]),
    ).resolves.toEqual([{ type: 'user', id: 'root' }]);
  });

  it('resolves inherited subjects and excludes inactive ones', async () => {
    const authz = createAuthorization({ plugins: [] });
    let members = ['active', 'disabled'];
    const release = authz.subjects.add('team', {
      resolveFor: async (principal) =>
        principal.type === 'user' ? members : [],
      filterActive: async (ids) => ids.filter((id) => id !== 'disabled'),
    });
    expect(
      await authz.subjects.resolveFor({ type: 'user', id: 'alice' }),
    ).toEqual([{ type: 'team', id: 'active' }]);
    members = [];
    expect(
      await authz.subjects.resolveFor({ type: 'user', id: 'alice' }),
    ).toEqual([]);
    release();
    expect(authz.subjects.list()).toEqual([]);
  });
});

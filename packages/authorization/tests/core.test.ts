import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
  createAuthorization,
  type AuthorizationGrantService,
  type AuthorizationPlugin,
} from '../src/core/index.js';

const emptyGrants: AuthorizationGrantService = {
  resolve(): Promise<readonly never[]> {
    return Promise.resolve([]);
  },
  resolveAll(): Promise<readonly never[]> {
    return Promise.resolve([]);
  },
};

function plugin(
  id: string,
  options: {
    dependencies?: readonly string[];
    providesGrants?: boolean;
    requiresGrants?: boolean;
    effect?: 'permit' | 'conditional' | 'deny';
    throws?: boolean;
  } = {},
): AuthorizationPlugin {
  return {
    id,
    dependencies: options.dependencies,
    ...(options.providesGrants ? { grants: emptyGrants } : {}),
    requiresGrants: options.requiresGrants,
    setup(authz): void {
      authz.resources.add({
        resourceType: id,
        async authorize() {
          if (options.throws) throw new Error('broken handler');
          const effect = options.effect ?? 'permit';
          return {
            effect,
            ...(effect === 'conditional'
              ? {
                  conditions: {
                    type: 'test',
                    constrained: true,
                  },
                }
              : {}),
            reasons: [],
          };
        },
      });
    },
  };
}

const request = (type: string) => ({
  principal: { type: 'user', id: 'alice' },
  resource: { type, id: 'resource' },
  action: 'read',
});

describe('Authorization Core', () => {
  it('allows applications to register resource authorization directly', async () => {
    const authorization = createAuthorization({ plugins: [] });
    authorization.resources.add<{ userId: string }>({
      resourceType: 'post',
      authorize(request) {
        return Promise.resolve({
          effect:
            request.action === 'update' &&
            request.principal.id === request.params?.userId
              ? 'permit'
              : 'deny',
          reasons: [],
        });
      },
    });

    await expect(
      authorization.can({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'post', id: 'post-1' },
        action: 'update',
        params: { userId: 'alice' },
      }),
    ).resolves.toBe(true);
  });

  it('orders plugins by declared dependencies', () => {
    const authorization = createAuthorization({
      plugins: [
        plugin('database', { dependencies: ['permissions'] }),
        plugin('permissions'),
      ],
    });
    expect(authorization.describe().plugins).toEqual([
      'permissions',
      'database',
    ]);
  });

  it('collects access constraints from installed plugins', async () => {
    const authorization = createAuthorization({
      plugins: [
        {
          id: 'sharing',
          setup(authz): void {
            authz.constraints.add({
              id: 'sharing',
              resolve(input) {
                return Promise.resolve([
                  {
                    source: { plugin: 'sharing', id: 'shared-order' },
                    effect: 'expand',
                    value: { type: 'ids', ids: [input.resource.id] },
                  },
                ]);
              },
            });
          },
        },
      ],
    });

    await expect(
      authorization.constraints.resolve({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'order', id: 'order-1' },
        action: 'read',
      }),
    ).resolves.toEqual([
      {
        source: { plugin: 'sharing', id: 'shared-order' },
        effect: 'expand',
        value: { type: 'ids', ids: ['order-1'] },
      },
    ]);
    expect(authorization.describe().constraintResolvers).toEqual(['sharing']);
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

  it('orders the Grant Provider before consumers', () => {
    const authorization = createAuthorization({
      plugins: [
        plugin('consumer', { requiresGrants: true }),
        plugin('roles', { providesGrants: true }),
      ],
    });
    expect(authorization.describe().plugins).toEqual(['roles', 'consumer']);
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

  it('denies unknown resources and handler failures', async () => {
    const authorization = createAuthorization({
      plugins: [plugin('broken', { throws: true })],
    });
    await expect(
      authorization.authorize(request('unknown')),
    ).resolves.toMatchObject({ effect: 'deny' });
    await expect(
      authorization.authorize(request('broken')),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'AUTHORIZATION_HANDLER_FAILED' }],
    });
  });

  it('does not treat conditional decisions as already enforced', async () => {
    const authorization = createAuthorization({
      plugins: [plugin('orders', { effect: 'conditional' })],
    });
    await expect(authorization.can(request('orders'))).resolves.toBe(false);
    await expect(
      authorization.require(request('orders')),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      authorization.authorize(request('orders')),
    ).resolves.toMatchObject({ effect: 'conditional' });
  });

  it('binds identity once for scoped authorization', async () => {
    let receivedPrincipal: string | undefined;
    let receivedSubject: string | undefined;
    const authorization = createAuthorization({
      plugins: [
        {
          id: 'documents',
          setup(authz): void {
            authz.resources.add({
              resourceType: 'document',
              authorize(request) {
                receivedPrincipal = request.principal.id;
                receivedSubject = request.subjects?.[0]?.id;
                return Promise.resolve({ effect: 'permit', reasons: [] });
              },
            });
          },
        },
      ],
    });
    const authz = authorization.for({
      principal: { type: 'user', id: 'alice' },
      subjects: [{ type: 'role', id: 'editor' }],
    });

    await expect(
      authz.can({
        resource: { type: 'document', id: 'document-1' },
        action: 'read',
      }),
    ).resolves.toBe(true);
    expect(receivedPrincipal).toBe('alice');
    expect(receivedSubject).toBe('editor');
  });

  it('creates and exposes a scoped authorizer with middleware', async () => {
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
    const app = new Hono<AuthorizationEnv>();
    app.use('*', authorization.middleware());
    app.get('/', async (context) => {
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

    await expect((await app.request('/')).json()).resolves.toEqual({
      allowed: true,
      principal: 'alice',
      subjects: [{ type: 'role', id: 'editor' }],
    });
  });

  it('guards routes with the scoped authorization request', async () => {
    let handled = 0;
    const identityPlugin: AuthorizationPlugin = {
      id: 'identity',
      setup(authz): void {
        authz.use(async (request, next) => {
          request.principal = { type: 'user', id: 'alice' };
          await next();
        });
      },
    };
    const postsPlugin: AuthorizationPlugin = {
      id: 'posts',
      setup(authz): void {
        authz.resources.add<{ ownerId: string }>({
          resourceType: 'post',
          authorize(request) {
            const allowed =
              request.action === 'update' &&
              request.principal.id === request.params.ownerId;
            return Promise.resolve({
              effect: allowed ? 'permit' : 'deny',
              reasons: allowed
                ? []
                : [{ code: 'POST_UPDATE_DENIED', message: 'Not the owner' }],
            });
          },
        });
      },
    };
    const authorization = createAuthorization({
      plugins: [identityPlugin, postsPlugin],
    });
    const app = new Hono<AuthorizationEnv>();
    app.onError((error, context) =>
      context.json(
        { message: error.message },
        error instanceof AuthorizationDeniedError ? 403 : 500,
      ),
    );
    app.use('*', authorization.middleware());
    app.put(
      '/posts/:owner',
      authorization.guard<{ ownerId: string }>((context) => ({
        resource: { type: 'post', id: 'post-1' },
        action: 'update',
        params: { ownerId: context.req.param('owner') },
      })),
      (context) => {
        handled += 1;
        return context.json({ updated: true });
      },
    );

    expect((await app.request('/posts/alice', { method: 'PUT' })).status).toBe(
      200,
    );
    expect((await app.request('/posts/bob', { method: 'PUT' })).status).toBe(
      403,
    );
    expect(handled).toBe(1);
  });

  it('fails clearly when a route guard runs before authorization middleware', async () => {
    const authorization = createAuthorization({ plugins: [] });
    const app = new Hono<AuthorizationEnv>();
    app.onError((error, context) =>
      context.json({ message: error.message }, 500),
    );
    app.get(
      '/',
      authorization.guard(() => ({
        resource: { type: 'post', id: 'post-1' },
        action: 'read',
      })),
      (context) => context.text('unexpected'),
    );

    await expect((await app.request('/')).json()).resolves.toEqual({
      message:
        'Authorization guard requires authorization.middleware() to run first',
    });
  });

  it('fails when authorization middleware does not resolve a principal', async () => {
    const authorization = createAuthorization({ plugins: [] });
    const app = new Hono<AuthorizationEnv>();
    app.onError((error, context) =>
      context.json({ message: error.message }, 500),
    );
    app.use('*', authorization.middleware());
    app.get('/', (context) => context.text('ok'));

    const response = await app.request('/');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Authorization principal was not resolved',
    });
  });
});

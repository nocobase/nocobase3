import type { DatabaseConnection } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import { realtimeServiceToken } from '@nocobase/app-server/realtime';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { PERMISSION_SETS_PROTECTION_OWNER } from '@nocobase/authorization/permission-sets';
import type {
  AuthorizationContext,
  AuthorizationPlugin,
} from '@nocobase/authorization/core';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createAppAuthorization,
  type AuthorizationConfig,
} from '../../server/authorization.js';
import {
  AuthorizationProvider,
  authorizationToken,
} from '../../server/index.js';
import {
  createSqliteDatabase,
  migratePlugins,
} from '../helpers/database-fixture.js';
import { mountedRouter } from '../helpers/mounted-router.js';
import { testRulePlugin } from '../helpers/rule-plugin.js';

/** Permission Sets need a connection to build their store; nothing here queries. */
const connection = { query: {} } as unknown as DatabaseConnection;

interface TestEnv {
  Variables: {
    auth?: { user: { id: string } };
    authz: AuthorizationContext;
  };
}

async function signedInAs(
  auth: { user: { id: string } } | undefined,
): Promise<Response> {
  const authorization = createAppAuthorization({ connection });
  const router = new Hono<TestEnv>();
  router.onError((error, context) =>
    context.json({ message: error.message }, 500),
  );
  router.use('*', async (context, next) => {
    if (auth) context.set('auth', auth);
    await next();
  });
  router.use('*', authorization.middleware());
  router.get('/', (context) => {
    const { identity } = context.get('authz');
    return context.json({
      principal: identity.principal,
      subjects: identity.subjects,
    });
  });
  return router.request('/');
}

describe('the identity an application resolves for a request', () => {
  it('resolves the principal and the authenticated subject from the session', async () => {
    const response = await signedInAs({ user: { id: 'alice' } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      principal: { type: 'user', id: 'alice' },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
  });

  it('refuses a request that carries no authenticated session', async () => {
    const response = await signedInAs(undefined);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Authorization requires an authenticated session',
    });
  });
});

describe('what an application configures about its own authorization', () => {
  const member = {
    owner: PERMISSION_SETS_PROTECTION_OWNER,
    allow: ['update'],
  };
  const root = (key: string) => ({
    [key]: {
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['assign', 'revoke'],
      requireActiveAssignment: true,
      unrestricted: true,
      // A superuser is an account; this host's principal type is `user`.
      assignableTo: ['user'],
    },
  });

  it.each([
    [
      'the default sets',
      {},
      { ...root('root'), member, owner: undefined, everyone: undefined },
    ],
    [
      'the sets the application names',
      { permissionSets: { rootSet: 'owner', defaultSet: 'everyone' } },
      {
        ...root('owner'),
        everyone: member,
        root: undefined,
        member: undefined,
      },
    ],
  ] as const)(
    'protects %s through the Permission Sets plugin',
    (_name, config: AuthorizationConfig, expected) => {
      const authorization = createAppAuthorization({ connection, config });
      for (const [key, protection] of Object.entries(expected))
        expect(authorization.permissionSets.protection(key)).toEqual(
          protection,
        );
    },
  );

  // The mount used to be a constant in the route file, so a router mounted
  // anywhere else answered 404 on every plugin surface while the
  // application's own endpoints kept working.
  it('answers the plugin surfaces it installed, and no others, under whatever prefix the router is mounted at', async () => {
    const authorization = createAppAuthorization({
      connection,
      config: { plugins: [testRulePlugin('restriction-rules')] },
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['admin-set'],
      unrestricted: true,
    });
    vi.spyOn(authorization.permissionSets, 'getEffective').mockResolvedValue([
      { key: 'admin-set', grants: [] },
    ]);
    const router = new Hono().route(
      '/portal',
      await mountedRouter(authorization),
    );

    const [installed, rule, missing] = await Promise.all([
      router.request('/portal/api/authz/permission-sets/options'),
      router.request('/portal/api/authz/restriction-rules/options'),
      router.request('/portal/api/authz/sharing-rules'),
    ]);

    expect([installed.status, rule.status, missing.status]).toEqual([
      200, 200, 404,
    ]);
  });

  it('refuses an application plugin that also provides grants', () => {
    const grantsOnly: AuthorizationPlugin = {
      id: 'test-grants',
      grants: {
        resolve: () => Promise.resolve([]),
        resolveAll: () => Promise.resolve([]),
      },
    };

    expect(() =>
      createAppAuthorization({ connection, config: { plugins: [grantsOnly] } }),
    ).toThrow('multiple Grant Providers');
  });
});

describe('the authorization provider', () => {
  it('resolves a database-backed authorization and publishes targeted and global permission invalidations', async () => {
    const database = createSqliteDatabase();
    await migratePlugins(database, 'app-plugin-authorization');
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    const publishFor = vi.fn();
    const publish = vi.fn();
    const closeUser = vi.fn();
    const closeGlobal = vi.fn();
    const defineTopic = vi
      .fn()
      .mockReturnValueOnce({ publishFor, close: closeUser })
      .mockReturnValueOnce({ publish, close: closeGlobal });
    container.instance(realtimeServiceToken, { defineTopic } as never);
    const provider = new AuthorizationProvider({
      container,
      config: {
        get: () => ({ permissionSets: { rootSet: 'owner' } }),
      },
    } as unknown as AppPluginApplication);

    try {
      provider.register();
      await provider.boot();
      const authorization = container.resolve(authorizationToken);
      expect(authorization.permissionSets.protection('owner')).toMatchObject({
        unrestricted: true,
      });
      await authorization.permissionSets.create({ key: 'reader', grants: [] });
      await authorization.permissionSets.assign({
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'reader',
      });
      await authorization.permissionSets.assign({
        subject: { type: 'authenticated', id: '*' },
        permissionSet: 'reader',
      });

      expect(
        await database
          .connection()
          .query.selectFrom('authorizationPermissionSetAssignments')
          .select('subjectId')
          .execute(),
      ).toHaveLength(2);
      expect(publishFor).toHaveBeenCalledExactlyOnceWith('alice', {
        type: 'permissions-changed',
      });
      expect(publish).toHaveBeenCalledExactlyOnceWith({
        type: 'permissions-changed',
      });

      await provider.shutdown();
      expect(closeUser).toHaveBeenCalledOnce();
      expect(closeGlobal).toHaveBeenCalledOnce();
    } finally {
      await database.destroy();
    }
  });
});

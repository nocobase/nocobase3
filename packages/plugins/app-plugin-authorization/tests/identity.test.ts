import type { DatabaseConnection } from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createAppAuthorization } from '../server/authorization.js';

/** Permission Sets need a connection to build their store; nothing here queries. */
const connection = { query: {} } as unknown as DatabaseConnection;

interface TestEnv {
  Variables: {
    auth?: { user: { id: string } };
    authz: AuthorizationContext;
  };
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

  // The identity step is middleware on the instance, so the plugin list holds
  // only the built-in plugins and whatever the application declared.
  it('installs no identity plugin to do it', () => {
    const authorization = createAppAuthorization({ connection });

    expect(authorization.resourceTypes.list().map((type) => type.type)).toEqual(
      ['composite', 'database.collection', 'page', 'settings'],
    );
  });
});

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

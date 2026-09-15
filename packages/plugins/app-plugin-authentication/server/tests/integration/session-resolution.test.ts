// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { createDatabaseManager, createMigrator } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Auth, type AuthEnv } from '../../auth.js';

const CREDENTIAL_HEADER = 'x-test-credential';

/**
 * Stands in for any plugin that authenticates by something other than a
 * cookie — an API key, a bearer token — and reports a rejected credential the
 * way Better Auth expects it to, by throwing.
 */
function rejectingCredential(
  status: 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR',
): BetterAuthPlugin {
  return {
    id: 'rejecting-credential',
    hooks: {
      before: [
        {
          matcher: (context) =>
            Boolean(context.headers?.get(CREDENTIAL_HEADER)),
          handler: createAuthMiddleware(() => {
            throw new APIError(status, {
              code: 'REJECTED',
              message: 'The credential was rejected.',
            });
          }),
        },
      ],
    },
  };
}

describe('Auth.getSession', () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });

  beforeAll(async () => {
    await createMigrator({
      database,
      packageName: '@nocobase/app-plugin-authentication',
      directory: fileURLToPath(
        new URL('../../../database/migrations', import.meta.url),
      ),
    }).latest();
  });

  afterAll(async () => {
    await database.destroy();
  });

  const authWith = (plugin: BetterAuthPlugin): Auth =>
    new Auth({
      connection: database.connection(),
      baseURL: 'http://localhost/api/auth',
      secret: 'development-secret-at-least-32-characters',
      plugins: [plugin],
    });

  it('reads a rejected credential as no session, not as a failure', async () => {
    // Otherwise `required()` answers 500 for an expired key instead of 401.
    const auth = authWith(rejectingCredential('FORBIDDEN'));

    await expect(
      auth.getSession(new Headers({ [CREDENTIAL_HEADER]: 'expired' })),
    ).resolves.toBeNull();
  });

  it('still surfaces a server-side failure rather than reporting a guest', async () => {
    const auth = authWith(rejectingCredential('INTERNAL_SERVER_ERROR'));

    await expect(
      auth.getSession(new Headers({ [CREDENTIAL_HEADER]: 'anything' })),
    ).rejects.toThrow();
  });

  it('reads a request carrying no credential as no session', async () => {
    const auth = authWith(rejectingCredential('FORBIDDEN'));

    await expect(auth.getSession(new Headers())).resolves.toBeNull();
  });

  describe('through the middleware', () => {
    const routerFor = (auth: Auth): Hono<AuthEnv> => {
      const router = new Hono<AuthEnv>();
      router.get('/required', auth.required(), (context) =>
        context.json({ ok: true }),
      );
      router.get('/optional', auth.optional(), (context) =>
        context.json({ auth: context.get('auth') }),
      );
      return router;
    };
    const refused = { headers: { [CREDENTIAL_HEADER]: 'expired' } };

    it("required() forwards the plugin's own status and code", async () => {
      const response = await routerFor(
        authWith(rejectingCredential('FORBIDDEN')),
      ).request('/required', refused);

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'REJECTED' });
    });

    it('optional() forwards a refused credential rather than reading it as anonymous', async () => {
      const response = await routerFor(
        authWith(rejectingCredential('FORBIDDEN')),
      ).request('/optional', refused);

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'REJECTED' });
    });

    it('still answers 401 UNAUTHORIZED when no credential is sent', async () => {
      const router = routerFor(authWith(rejectingCredential('FORBIDDEN')));

      const required = await router.request('/required');
      expect(required.status).toBe(401);
      expect(await required.json()).toMatchObject({ code: 'UNAUTHORIZED' });

      const optional = await router.request('/optional');
      expect(optional.status).toBe(200);
      expect(await optional.json()).toEqual({ auth: null });
    });

    it('still surfaces a server-side failure as a failure', async () => {
      const router = routerFor(
        authWith(rejectingCredential('INTERNAL_SERVER_ERROR')),
      );
      router.onError((error, context) =>
        context.json({ crashed: error.message }, 500),
      );

      const response = await router.request('/required', refused);

      expect(response.status).toBe(500);
    });
  });
});

// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Application } from '@nocobase/app-server/application';
import { CachingProvider } from '@nocobase/app-server/caching';
import {
  createAppPaths,
  type AppConfigAccessor,
} from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { IdGeneratorProvider } from '@nocobase/app-server/id-generator';
import {
  defineServerPlugins,
  resolveAppServerPlugins,
} from '@nocobase/app-server/plugins';
import {
  findUndeclaredApiRoutes,
  type ApiDocument,
  type OpenAPIV3_1,
} from '@nocobase/app-server/router';
import { createDefaultCachingConfig } from '@nocobase/caching';
import {
  provisionTestDatabases,
  type ProvisionedTestDatabases,
} from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BROWSER_ONLY_AUTH_PATHS,
  createAuthenticationApiFragment,
} from '../../api-docs.js';
import type { Auth, AuthOpenAPISchema } from '../../auth.js';
import authentication from '../../plugin.js';
import { signIn, type TestSession } from '../../testing.js';

const ORIGIN = 'http://localhost';
const USER = {
  name: 'Docs Reader',
  email: 'docs-reader@example.com',
  password: 'docs-reader-password',
};

describe('API documentation access and the Better Auth fragment', () => {
  let directory: string;
  let databases: ProvisionedTestDatabases;
  let app: Application;
  let session: TestSession;

  const request = (pathname: string, headers: HeadersInit = {}) =>
    app.fetch(new Request(new URL(pathname, ORIGIN), { headers }));

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'authentication-api-docs-'));
    databases = await provisionTestDatabases();
    const values: Record<string, unknown> = {
      app: {
        name: 'main',
        publicOrigin: ORIGIN,
        publicBasePath: '/',
        internalBasePath: '',
        publicApiUrl: '/api',
      },
      auth: {
        secret: 'authentication-api-docs-secret-at-least-32-characters',
        emailAndPassword: { enabled: true, autoSignIn: false },
        session: { storeSessionInDatabase: true },
      },
      caching: createDefaultCachingConfig(),
      database: {
        default: 'main',
        connections: {
          main: {
            ...databases.connectionConfig(),
            schemaManagement: 'managed',
          },
        },
      },
      snowflake: { workerId: 0 },
    };
    const config: AppConfigAccessor = {
      get: <TValue>(key: string): TValue => values[key] as TValue,
      raw: () => values,
      reload: () => Promise.resolve({ changedNamespaces: [] }),
      subscribe: () => () => undefined,
    };
    app = new Application({
      config,
      paths: createAppPaths({ rootDir: directory }),
    });
    app.addServiceProvider(DatabaseProvider);
    app.addServiceProvider(CachingProvider);
    app.addServiceProvider(IdGeneratorProvider);
    app.addServerPlugins(
      resolveAppServerPlugins(directory, defineServerPlugins([authentication])),
    );
    await app.start();
    const signUp = await app.fetch(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify(USER),
      }),
    );
    if (signUp.status !== 200)
      throw new Error(`Sign-up failed: ${await signUp.text()}`);
    session = await signIn(
      { fetch: (input) => app.fetch(input), publicBasePath: '' },
      { email: USER.email, password: USER.password },
    );
  }, 60_000);

  afterAll(async () => {
    await app?.shutdown();
    await databases?.drop();
    rmSync(directory, { recursive: true, force: true });
  });

  it('refuses an anonymous request', async () => {
    for (const pathname of ['/api/swagger', '/api/swagger/docs']) {
      const response = await request(pathname);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: {
          status: 'UNAUTHENTICATED',
          reason: 'API_DOCS_UNAUTHENTICATED',
        },
      });
    }
  });

  it('refuses a session cookie Better Auth does not recognize', async () => {
    const response = await request('/api/swagger', {
      cookie: 'main.session_token=forged.signature',
    });
    expect(response.status).toBe(401);
  });

  it('serves the document and the Swagger UI page to a signed-in session, without touching its cookies', async () => {
    const document = await request('/api/swagger', { cookie: session.cookie });
    expect(document.status).toBe(200);
    expect(document.headers.getSetCookie()).toEqual([]);
    expect(await document.json()).toMatchObject({ openapi: '3.1.0' });

    const page = await request('/api/swagger/docs', { cookie: session.cookie });
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.getSetCookie()).toEqual([]);
  });

  it('documents Better Auth’s endpoints under /api/auth, tagged Authentication', async () => {
    const response = await request('/api/swagger', { cookie: session.cookie });
    const document = (await response.json()) as ApiDocument;
    const paths = document.paths ?? {};

    const signInEmail = paths['/api/auth/sign-in/email']?.post;
    expect(signInEmail).toMatchObject({
      tags: ['Authentication'],
      operationId: 'signInEmail',
      summary: 'Sign in with email and password',
    });
    expect(signInEmail).not.toHaveProperty('security');
    expect(paths['/api/auth/sign-in/username']?.post).toMatchObject({
      tags: ['Authentication'],
      operationId: 'signInUsername',
    });
    expect(paths['/api/auth/get-session']?.get?.operationId).toBe('getSession');
    expect(document.tags).toContainEqual(
      expect.objectContaining({ name: 'Authentication' }),
    );
    expect(document.components?.schemas).toHaveProperty('Session');

    const authPaths = Object.keys(paths).filter((pathname) =>
      pathname.startsWith('/api/auth'),
    );
    expect(authPaths.length).toBeGreaterThan(10);
    for (const pathname of authPaths) {
      for (const operation of operations(paths[pathname])) {
        expect(operation.tags).toEqual(['Authentication']);
        expect(operation.operationId).toEqual(expect.any(String));
        expect(operation.summary).toEqual(expect.any(String));
      }
    }
    // The catch-all route is hidden, browser-only flows are left out, and Better Auth's own reference is not served.
    expect(paths).not.toHaveProperty('/api/auth/*');
    for (const browserOnly of BROWSER_ONLY_AUTH_PATHS)
      expect(paths).not.toHaveProperty(`/api/auth${browserOnly}`);
    expect(paths).not.toHaveProperty('/api/auth/open-api/generate-schema');
    expect((await request('/api/auth/reference')).status).toBe(404);
    expect((await request('/api/auth/open-api/generate-schema')).status).toBe(
      404,
    );
  });

  it('declares every route the plugin registers', () => {
    expect(findUndeclaredApiRoutes(app.apiRouter!)).toEqual([]);
  });
});

describe('createAuthenticationApiFragment()', () => {
  it('places paths below the application’s base path and names operations without an id', async () => {
    const schema: AuthOpenAPISchema = {
      basePath: '/main/api/auth',
      paths: {
        '/is-username-available': {
          post: { tags: ['Username'], responses: {} },
        },
        '/callback/{id}': { get: { operationId: 'callback', responses: {} } },
      },
      components: { schemas: {} },
    };
    const auth = { openAPISchema: () => Promise.resolve(schema) };

    const fragment = await createAuthenticationApiFragment(
      auth as unknown as Auth,
      '/main',
    );

    expect(fragment).toMatchObject({
      owner: '@nocobase/app-plugin-authentication',
      namespace: 'auth',
    });
    expect(Object.keys(fragment.paths ?? {})).toEqual([
      '/api/auth/is-username-available',
    ]);
    expect(fragment.paths?.['/api/auth/is-username-available']?.post).toEqual({
      tags: ['Authentication'],
      responses: {},
    });
  });
});

function operations(
  item: OpenAPIV3_1.PathItemObject | undefined,
): OpenAPIV3_1.OperationObject[] {
  return (['get', 'post', 'put', 'patch', 'delete'] as const).flatMap(
    (method) => (item?.[method] ? [item[method]] : []),
  );
}

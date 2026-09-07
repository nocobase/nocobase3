import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { createCaching } from '@nocobase/caching';
import { createMigrator, databaseManagerToken } from '@nocobase/db';
import { Application } from '@nocobase/app-server/application';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '@nocobase/app-server/config';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { defineApiRoutes } from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import authentication, {
  authenticationConfig,
  AuthenticationProvider,
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication/server';
import type { PortableFixture } from './database-fixtures.js';

interface AuthenticatedApp {
  app: Application<AppConfig>;
  contributionApp: AppPluginApplication<AppConfig>;
  auth: Auth;
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

/** Shared authentication infrastructure; callers own audit bindings and business routes. */
export async function createAuthenticatedApp(
  fixture: PortableFixture,
  contributions: ConstructorParameters<typeof AppConfig>[0] = [],
  secret: string = 'audit-test-authentication-secret-at-least-32-characters',
): Promise<AuthenticatedApp> {
  const config = new AppConfig([
    ...contributions,
    {
      ...appConfig,
      defaults: {
        name: 'synthetic-app',
        publicOrigin: 'http://localhost',
        publicBasePath: '',
        internalBasePath: '',
        publicApiUrl: '/api',
      },
    },
    {
      ...authenticationConfig,
      defaults: {
        secret,
        emailAndPassword: { enabled: true, autoSignIn: true },
        session: { storeSessionInDatabase: true },
      },
    },
  ]);
  await config.loadAll();
  const caching = createCaching();
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: fixture.directory }),
    websocket: () => async () => null,
  });
  const close = async () => {
    try {
      await app.shutdown();
    } finally {
      await caching.dispose();
    }
  };
  try {
    app.container.instance(databaseManagerToken, fixture.manager);
    app.container.instance(cachingToken, caching);
    app.container.instance(idGeneratorToken, {
      generate: () => 1,
      generateString: () => randomUUID(),
    });
    const contributionApp = {
      appName: 'synthetic-app',
      publicBasePath: '',
      config,
      paths: app.paths,
      router: new Hono(),
      container: app.container,
    };
    new AuthenticationProvider(contributionApp).register();
    await createMigrator({
      database: fixture.manager,
      packageName: '@nocobase/app-plugin-authentication',
      directory: fileURLToPath(
        new URL(
          '../../../app-plugin-authentication/database/migrations',
          import.meta.url,
        ),
      ),
    }).latest();
    for (const route of authentication.routes ?? [])
      app.addRoutes(defineApiRoutes(() => route.createRouter(contributionApp)));
    return {
      app,
      contributionApp,
      auth: app.container.resolve(authenticationToken),
      request: async (path: string, init?: RequestInit) =>
        app.fetch(new Request('http://localhost/api' + path, init)),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export function jsonRequest(body: object, cookie?: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  };
}

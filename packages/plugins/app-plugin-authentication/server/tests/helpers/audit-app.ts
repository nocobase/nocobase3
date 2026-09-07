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
import {
  NodeAuditScopeCarrier,
  TrustedAuditRuntime,
  PersistentAuditSettingsService,
  AuditCaptureCatalog,
  AuditReadiness,
  LocalAuditHealthService,
  createAuditHttpResources,
} from '@nocobase/app-plugin-audit/server';
import { createPortableFixture } from '../../../../app-plugin-audit/tests/helpers/database-fixtures.js';
import type { DatabaseDialect } from '@nocobase/db';
import { authenticationConfig } from '../../config.js';
import { AuthenticationProvider } from '../../providers/authentication.js';
import { authenticationToken } from '../../tokens.js';
import { authenticationAuditToken } from '../../audit.js';
import { apiRoutes } from '../../routes/index.js';

export async function createAuditAuthApp(
  dialect: DatabaseDialect,
  configure?: (
    app: Application<AppConfig>,
    auth: import('../../auth.js').Auth,
  ) => Promise<void> | void,
  bridgeEnabled: boolean = true,
) {
  const fixture = await createPortableFixture(dialect);
  const caching = createCaching();
  const config = new AppConfig([
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
        secret: 'G15-synthetic-secret-at-least-32-characters',
        emailAndPassword: { enabled: true, autoSignIn: true },
        session: { storeSessionInDatabase: true },
      },
    },
  ]);
  await config.loadAll();
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: fixture.directory }),
    websocket: () => async () => null,
  });
  const runtime = new TrustedAuditRuntime({
    appId: fixture.scope.appId,
    carrier: new NodeAuditScopeCarrier(fixture.scope.appId),
    bind: () => fixture.recorder,
    diagnostic: () => undefined,
  });
  const health = new LocalAuditHealthService(() => undefined);
  const catalog = new AuditCaptureCatalog();
  const readiness = new AuditReadiness({
    stores: [{ connection: fixture.connection, store: fixture.store }],
    catalog,
    health,
    requirements: {
      auditRequired: false,
      requiredDataSources: [],
      mandatorySources: [],
    },
  });
  const settings = new PersistentAuditSettingsService({
    connection: fixture.connection,
    store: fixture.store,
    readiness,
    health,
    defaults: {
      enabled: true,
      sources: { http: 'declared-routes', runtime: 'disabled', database: [] },
    },
  });
  const initial = await settings.initialize(fixture.scope);
  const resources = createAuditHttpResources({
    application: app,
    runtime,
    settings,
    stores: [fixture.store],
    health,
    catalog,
    connections: [fixture.connection],
  });
  app.container.instance(databaseManagerToken, fixture.manager);
  app.container.instance(cachingToken, caching);
  app.container.instance(idGeneratorToken, {
    generate: () => 1,
    generateString: () => randomUUID(),
  });
  if (bridgeEnabled)
    app.container.instance(authenticationAuditToken, {
      runtime,
      collector: resources.collector,
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
      new URL('../../../database/migrations', import.meta.url),
    ),
  }).latest();
  app.addRoutes(
    defineApiRoutes(async () => apiRoutes.createRouter(contributionApp)),
  );
  await configure?.(app, app.container.resolve(authenticationToken));
  await resources.verify(async () => {
    await app.fetch(new Request('http://localhost/probe'));
  });
  await readiness.start(initial);
  return {
    fixture,
    app,
    contributionApp,
    settings,
    auth: app.container.resolve(authenticationToken),
    request: (path: string, init?: RequestInit) =>
      app.fetch(new Request('http://localhost/api' + path, init)),
    events: async () =>
      (
        await fixture.store.query(fixture.scope, {
          store: 'main',
          pageSize: 100,
        })
      ).items,
    close: async () => {
      await resources.dispose();
      runtime.dispose();
      await app.shutdown();
      await caching.dispose();
      await fixture.cleanup();
    },
  };
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

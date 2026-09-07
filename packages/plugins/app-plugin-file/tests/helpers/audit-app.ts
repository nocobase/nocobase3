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
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import { createPortableFixture } from '../../../app-plugin-audit/tests/helpers/database-fixtures.js';
import type { DatabaseDialect } from '@nocobase/db';
import { authenticationConfig } from '@nocobase/app-plugin-authentication';
import { AuthenticationProvider } from '../../../app-plugin-authentication/server/providers/authentication.js';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
import { apiRoutes } from '../../../app-plugin-authentication/server/routes/index.js';

export async function createAuditAuthApp(
  dialect: DatabaseDialect,
  configure?: (
    app: Application<AppConfig>,
    auth: import('@nocobase/app-plugin-authentication').Auth,
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
  const carrier = new NodeAuditScopeCarrier(fixture.scope.appId);
  const runtime = new TrustedAuditRuntime({
    appId: fixture.scope.appId,
    carrier,
    bind: (scope) =>
      bindAuditRecorder(scope, {
        producer: 'file',
        store: fixture.store,
        policy: async () => {
          const policy = await settings.snapshot(scope);
          return {
            revision: policy.revision,
            enabled: policy.enabled && policy.sources.runtime !== 'disabled',
            maxDetailsBytes: policy.maxDetailsBytes,
          };
        },
      }),
    diagnostic: () => undefined,
  });
  const health = new LocalAuditHealthService(() => undefined);
  const catalog = new AuditCaptureCatalog();
  const business = catalog.register({
    producer: 'file',
    kind: 'business',
    connection: fixture.connection,
    targets: [],
    dispose: () => undefined,
  });
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
      sources: {
        http: 'declared-routes',
        runtime: 'integrated-producers',
        database: ['g16_files', 'g16_other_files'].map((table) => ({
          dataSource: 'main',
          table,
        })),
      },
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
      new URL(
        '../../../app-plugin-authentication/database/migrations',
        import.meta.url,
      ),
    ),
  }).latest();
  app.addRoutes(
    defineApiRoutes(async () => apiRoutes.createRouter(contributionApp)),
  );
  await configure?.(app, app.container.resolve(authenticationToken));
  return {
    start: async () => {
      await resources.verify(async () => {
        await app.fetch(new Request('http://localhost/probe'));
      });
      await business.verify(async () => {
        await runtime.runRequest(() =>
          runtime.recorder.record({ action: 'file.probe', outcome: 'success' }),
        );
      });
      await readiness.start(initial);
    },
    fixture,
    runtime,
    carrier,
    health,
    catalog,
    collector: resources.collector,
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
      await business.dispose();
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

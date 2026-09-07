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
import { createPortableFixture } from './database-fixtures.js';
import type { DatabaseDialect } from '@nocobase/db';
import { authenticationConfig } from '@nocobase/app-plugin-authentication/server';
import { AuthenticationProvider } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
import authenticationPlugin from '@nocobase/app-plugin-authentication/server';
import { bindAuditRecorder } from '../../server/service.js';
import { notificationConfig } from '@nocobase/app-plugin-notification/server';
import { I18nRuntime } from '@nocobase/i18n';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { defineHttpMiddleware } from '@nocobase/app-server/router';

import { createLogging } from '@nocobase/logging';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import notificationPlugin, {
  NotificationProvider,
  notificationExtensionRegistryToken,
} from '@nocobase/app-plugin-notification/server';
import inAppPlugin, {
  DatabaseInAppStore,
  inAppNotificationStoreToken,
  createInAppChannelDefinition,
  createDatabaseProviderDefinition,
} from '@nocobase/app-plugin-notification-in-app/server';
import { notificationAuditToken } from '@nocobase/app-plugin-notification/server/audit';
import { inAppNotificationAuditToken } from '@nocobase/app-plugin-notification-in-app/server/audit';

export async function addNotifications(
  app: AdminAuditApp,
  enabled: boolean = true,
): Promise<{
  store: DatabaseInAppStore;
  authz: ReturnType<typeof createAppAuthorization>;
  close(): Promise<void>;
}> {
  const i18n = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  await i18n.init('en-US');
  app.app.addHttpMiddleware(
    defineHttpMiddleware({
      name: 'g19-i18n',
      register(router) {
        router.use('*', createI18nMiddleware(i18n));
      },
    }),
  );
  for (const name of ['authorization', 'notification', 'notification-in-app']) {
    await createMigrator({
      database: app.fixture.manager,
      packageName: '@nocobase/app-plugin-' + name,
      directory: fileURLToPath(
        new URL(
          '../../../app-plugin-' + name + '/database/migrations',
          import.meta.url,
        ),
      ),
    }).latest();
  }
  const authz = createAppAuthorization({ connection: app.fixture.connection });
  app.app.container.instance(authorizationToken, authz);
  const store = new DatabaseInAppStore(app.fixture.manager);
  const queue = createQueueManager(createSyncQueueConfig());
  const logging = createLogging({ level: 'silent' });
  app.app.container.instance(queueManagerToken, queue);
  app.app.container.instance(loggingToken, logging);
  const provider = new NotificationProvider(app.contributionApp);
  provider.register();
  await provider.boot();
  const registry = app.app.container.resolve(
    notificationExtensionRegistryToken,
  );
  registry
    .registerChannel(createInAppChannelDefinition())
    .registerProvider('in-app', createDatabaseProviderDefinition({ store }));
  app.app.container.instance(inAppNotificationStoreToken, store);
  if (enabled) {
    app.app.container.instance(notificationAuditToken, {
      http: (input) => app.collector.http(input),
    });
    app.app.container.instance(inAppNotificationAuditToken, {
      http: (input) => app.collector.http(input),
      withIdentity: async (context, verifiedUserId, next) => {
        const proceed = async () => {
          app.collector.captureScope(context);
          await next();
        };
        if (verifiedUserId)
          await app.runtime.runAuthenticated(
            { actor: { type: 'user', id: verifiedUserId } },
            proceed,
          );
        else await app.runtime.runAnonymous(proceed);
      },
    });
  }
  for (const plugin of [notificationPlugin, inAppPlugin])
    for (const route of plugin.routes)
      app.app.addRoutes(
        defineApiRoutes(() => route.createRouter(app.contributionApp)),
      );
  await provider.start();
  return {
    store,
    authz,
    close: async () => {
      await provider.shutdown();
      await queue.close();
    },
  };
}

export interface AdminAuditApp {
  start(): Promise<void>;
  runtime: TrustedAuditRuntime;
  collector: import('../../server/http.js').AuditHttpCollector;
  readiness: AuditReadiness;
  catalog: AuditCaptureCatalog;
  health: LocalAuditHealthService;
  fixture: import('./database-fixtures.js').PortableFixture;
  app: Application<AppConfig>;
  contributionApp: import('@nocobase/app-server/plugins').AppPluginApplication<AppConfig>;
  settings: PersistentAuditSettingsService;
  auth: import('@nocobase/app-plugin-authentication/server').Auth;
  request(path: string, init?: RequestInit): Promise<Response>;
  events(): Promise<
    readonly import('../../server/contracts.js').AuditEventDto[]
  >;
  close(): Promise<void>;
}

export async function createAdminAuditApp(
  dialect: DatabaseDialect,
  configure?: (
    app: Application<AppConfig>,
    auth: import('@nocobase/app-plugin-authentication/server').Auth,
  ) => Promise<void> | void,
  bridgeEnabled: boolean = true,
  installMode: boolean = false,
): Promise<AdminAuditApp> {
  const fixture = await createPortableFixture(dialect);
  const caching = createCaching();
  const config = new AppConfig([
    {
      ...notificationConfig,
      defaults: {
        test: { enabled: true },
        channels: [
          {
            type: 'in-app',
            enabled: true,
            providers: [{ type: 'database', name: 'primary' }],
          },
        ],
      },
    },
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
        secret: installMode
          ? 'nocobase-install-mode-G19-temporary-secret'
          : 'G19-synthetic-secret-at-least-32-characters',
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
    bind: (scope) =>
      bindAuditRecorder(scope, {
        store: fixture.store,
        producer: 'administration',
        policy: async () => ({
          enabled: true,
          revision: 0,
          maxDetailsBytes: 262144,
        }),
      }),
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
      new URL(
        '../../../app-plugin-authentication/database/migrations',
        import.meta.url,
      ),
    ),
  }).latest();
  for (const route of authenticationPlugin.routes ?? []) {
    app.addRoutes(defineApiRoutes(() => route.createRouter(contributionApp)));
  }
  await configure?.(app, app.container.resolve(authenticationToken));
  const start = async () => {
    await resources.verify(async () => {
      await app.fetch(new Request('http://localhost/probe'));
    });
    await readiness.start(initial);
  };
  return {
    start,
    runtime,
    collector: resources.collector,
    readiness,
    catalog,
    health,
    fixture,
    app,
    contributionApp,
    settings,
    auth: app.container.resolve(authenticationToken),
    request: async (path: string, init?: RequestInit) =>
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

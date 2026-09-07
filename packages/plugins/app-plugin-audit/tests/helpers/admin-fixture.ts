import { createAuthenticatedApp } from './authenticated-app.js';
import { createCaptureServices } from './capture-services.js';
import { fileURLToPath } from 'node:url';
import { createMigrator } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import type { AppConfig } from '@nocobase/app-server/config';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  NodeAuditScopeCarrier,
  TrustedAuditRuntime,
  type PersistentAuditSettingsService,
  type AuditCaptureCatalog,
  type AuditReadiness,
  type LocalAuditHealthService,
  createAuditHttpResources,
} from '@nocobase/app-plugin-audit/server';
import { createPortableFixture } from './database-fixtures.js';
import type { DatabaseDialect } from '@nocobase/db';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
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
      name: 'admin-i18n',
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
  const authenticated = await createAuthenticatedApp(
    fixture,
    [
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
    ],
    installMode ? 'nocobase-install-mode-test-temporary-secret' : undefined,
  );
  const { app } = authenticated;
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
  const { health, catalog, readiness, settings } = createCaptureServices([
    fixture,
  ]);
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
  if (bridgeEnabled)
    app.container.instance(authenticationAuditToken, {
      runtime,
      collector: resources.collector,
    });
  await configure?.(app, authenticated.auth);
  const start = async () => {
    await resources.verify(async () => {
      await app.fetch(new Request('http://localhost/probe'));
    });
    await readiness.start(initial);
  };
  return {
    ...authenticated,
    start,
    runtime,
    collector: resources.collector,
    readiness,
    catalog,
    health,
    fixture,
    settings,
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
      await authenticated.close();
      await fixture.cleanup();
    },
  };
}

export { jsonRequest } from './authenticated-app.js';

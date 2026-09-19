import {
  Application,
  type ApplicationConfig,
} from '@nocobase/app-server/application';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { I18nProvider, i18nHttpMiddleware } from '@nocobase/app-server/i18n';
import { CachingProvider } from '@nocobase/app-server/caching';
import { DriveProvider } from '@nocobase/app-server/drive';
import { IdGeneratorProvider } from '@nocobase/app-server/id-generator';
import {
  LoggingProvider,
  requestLoggingMiddleware,
} from '@nocobase/app-server/logging';
import { QueueProvider } from '@nocobase/app-server/queue';
import {
  SessionProvider,
  sessionHttpMiddleware,
} from '@nocobase/app-server/session';
import {
  healthCheckApiRoutes,
  defineRootRoutes,
} from '@nocobase/app-server/router';
import { type AppRuntimeContext } from '@nocobase/app-server/runtime';
import { createCustomerWebSocketHandler } from '@nocobase/app-plugin-audit-example/server';
import {
  createRealtimeWebSocketHandler,
  RealtimeProvider,
  registerRealtimeWebSocketRoutes,
} from '@nocobase/app-server/realtime';
import { Hono } from 'hono';
import { spaRootRoutes } from '@nocobase/app-server/spa';

export function createApp(runtime: AppRuntimeContext): Application {
  // This example App owns its customer message protocol alongside Realtime.
  const app = new Application<ApplicationConfig>({
    config: runtime.config,
    mode: runtime.mode,
    paths: runtime.paths,
    runtimeLogging: runtime.scope.logging,
    websocket: (services) => {
      const customers = createCustomerWebSocketHandler(services);
      const realtime = createRealtimeWebSocketHandler(services);
      return async (request, env) =>
        (await customers(request, env)) ?? realtime(request, env);
    },
  });
  runtime.app = app;
  app.addServiceProvider(RealtimeProvider);
  app.addRoutes(
    defineRootRoutes(() => {
      const router = new Hono();
      registerRealtimeWebSocketRoutes(router);
      router.get('/audit-example/ws', (context) =>
        context.json({ code: 'WEBSOCKET_UPGRADE_REQUIRED' }, 426),
      );
      return router;
    }),
  );

  app.addServiceProvider(DatabaseProvider);
  app.addServiceProvider(I18nProvider);
  app.addServiceProvider(LoggingProvider);
  app.addServiceProvider(CachingProvider);
  app.addServiceProvider(IdGeneratorProvider);
  app.addServiceProvider(SessionProvider);
  app.addServiceProvider(DriveProvider);
  app.addServiceProvider(QueueProvider);
  app.addHttpMiddleware(requestLoggingMiddleware);
  app.addHttpMiddleware(sessionHttpMiddleware);
  app.addHttpMiddleware(i18nHttpMiddleware);
  app.addRoutes(healthCheckApiRoutes);
  app.addRuntimeContributions(runtime);
  app.addRoutes(spaRootRoutes);

  return app;
}

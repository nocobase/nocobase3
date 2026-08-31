import {
  Application,
  type ApplicationConfig,
} from '@nocobase/app-server-kit/application';
import { DatabaseProvider } from '@nocobase/app-server-kit/database';
import {
  I18nProvider,
  i18nHttpMiddleware,
} from '@nocobase/app-server-kit/i18n';
import { CachingProvider } from '@nocobase/app-server-kit/caching';
import { DriveProvider } from '@nocobase/app-server-kit/drive';
import { IdGeneratorProvider } from '@nocobase/app-server-kit/id-generator';
import {
  LoggingProvider,
  requestLoggingMiddleware,
} from '@nocobase/app-server-kit/logging';
import { QueueProvider } from '@nocobase/app-server-kit/queue';
import {
  SessionProvider,
  sessionHttpMiddleware,
} from '@nocobase/app-server-kit/session';
import { healthCheckApiRoutes } from '@nocobase/app-server-kit/router';
import type { ResolvedAppRuntime } from '@nocobase/app-server-kit/runtime';
import { spaRootRoutes } from '@nocobase/app-server-kit/spa';

export function createApp(runtime: ResolvedAppRuntime): Application {
  const app = new Application<ApplicationConfig>({
    config: runtime.appConfig,
    mode: runtime.mode,
    paths: runtime.configPaths,
  });
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
